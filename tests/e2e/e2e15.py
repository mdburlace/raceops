import os
import json, sys, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []

def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def shot(page, name, full=True):
    page.wait_for_timeout(400)
    page.screenshot(path=f'{OUT}/{name}.png', full_page=full)

st, o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})
OT = o['token']
RACE = next(m for m in o['memberships'] if m['tenant_name'] == 'Burlace Racing')['tenant_id']

# ---- platform admin creates an engine shop ----
assert call('/admin/tenants', OT, 'POST', {'name': 'Bad Type', 'team_type': 'nope'})[0] == 200  # unknown type is ignored → race
st, shop = call('/admin/tenants', OT, 'POST', {'name': 'Hi-Rev Engines', 'plan': 'engine_shop', 'team_type': 'engine_shop'})
assert st == 200 and shop['settings']['team_type'] == 'engine_shop', shop
SHOP = shop['id']
assert call(f'/admin/tenants/{SHOP}', OT, 'PATCH', {'team_type': 'bogus'})[0] == 400
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
m = next(x for x in o['memberships'] if x['tenant_id'] == SHOP)
assert m['settings']['team_type'] == 'engine_shop' and 'track' not in m['entitlements'], m
roles = call(f'/t/{SHOP}/roles', OT)[1]
mech = next(r for r in roles if r['name'] == 'Mechanic')
assert 'jobs.edit' in mech['permissions'] and 'customers.view' in mech['permissions'], mech['permissions']
pull = call(f'/t/{SHOP}/sync?since=0', OT)[1]['records']
assert any(r['type'] == 'form' and r['data']['target'] == 'job' for r in pull) and any(r['type'] == 'form' and r['data']['target'] == 'customer' for r in pull)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': SHOP}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- shop menu & home ----
    side = page.locator('aside.sidebar')
    expect(side.locator('.nav-area:has-text("Engine Shop")')).to_be_visible()
    for l in ['Jobs', 'Customers', 'Customer engines', 'Build sheets']:
        expect(side.get_by_role('link', name=l, exact=True)).to_be_visible()
    expect(side.locator('.nav-area:has-text("At the Track")')).to_have_count(0)
    expect(side.get_by_role('link', name='Cars', exact=True)).to_have_count(0)
    expect(side.get_by_role('link', name='Car maintenance', exact=True)).to_have_count(0)
    expect(page.locator('.shop-home')).to_contain_text('In the shop')
    expect(page.locator('[data-testid="setup-checklist"]')).not_to_contain_text('Add your car')  # shop steps only

    # ---- shop settings ----
    page.goto(B + '/team/members')
    expect(page.locator('#team-type')).to_have_value('engine_shop')
    page.fill('#shop-labour_rate', '150'); page.fill('#shop-job_prefix', 'WO'); page.fill('#shop-terms', 'Payment due on collection.')
    page.click('section:has-text("Team type & engine shop") button:has-text("Save")')
    expect(page.locator('text=Saved.')).to_be_visible()
    s = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
    ms = next(x for x in s['memberships'] if x['tenant_id'] == SHOP)['settings']['shop']
    assert ms['labour_rate'] == 150 and ms['job_prefix'] == 'WO', ms

    # ---- customer → engine → job ----
    page.goto(B + '/customers'); page.click('a:has-text("New customer")')
    page.fill('#f-name', 'Smith Racing'); page.fill('#f-contact_name', 'Dave Smith'); page.fill('#f-phone', '0400 000 000')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.locator('h1')).to_have_text('Smith Racing')
    page.click('a:has-text("Add engine")')
    expect(page.locator('#f-category')).to_have_value('Engine')
    expect(page.locator('#f-customer')).to_be_visible()
    page.fill('#f-name', 'Smith 410 #1'); page.fill('#f-serial_number', 'SR-410-77')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.locator('section:has-text("Shop jobs")')).to_contain_text('Owner: Smith Racing')
    page.click('section:has-text("Shop jobs") a:has-text("New job")')
    expect(page.locator('#f-job_no')).to_have_value('WO-0001')
    expect(page.locator('#f-status')).to_have_value('Booked in')
    expect(page.locator('#f-tax_rate')).to_have_value('10')
    page.select_option('#f-job_type', 'Freshen / refresh')
    page.fill('#f-request', 'Freshen after 40 nights; check oil pressure drop.')
    page.fill('#f-work_done', 'Full teardown, new rings and bearings, valve job.')
    parts = page.locator('.field:has(> .field-label > label:text-is("Parts used"))')
    parts.locator('input[aria-label="Part # row 1"]').fill('RS-123'); parts.locator('input[aria-label="Description row 1"]').fill('Ring set')
    parts.locator('input[aria-label="Qty row 1"]').fill('1'); parts.locator('input[aria-label="Unit cost row 1"]').fill('300'); parts.locator('input[aria-label="Unit price row 1"]').fill('420')
    parts.locator('button:has-text("+ Row")').click()
    parts.locator('input[aria-label="Description row 2"]').fill('Main bearings'); parts.locator('input[aria-label="Qty row 2"]').fill('2'); parts.locator('input[aria-label="Unit cost row 2"]').fill('50')
    lab = page.locator('.field:has(> .field-label > label:text-is("Labour"))')
    lab.locator('input[aria-label="Work row 1"]').fill('Teardown & assembly'); lab.locator('input[aria-label="Hours row 1"]').fill('6')
    tot = page.locator('.job-totals')
    expect(tot.locator('div:has(dt:text-is("Parts")) dd')).to_have_text('$520.00')
    expect(tot.locator('div:has(dt:has-text("Labour")) dd')).to_have_text('$900.00')
    expect(tot.locator('.grand dd')).to_have_text('$1,562.00')
    expect(tot).to_contain_text('margin $120.00')
    shot(page, 'p15-01-job')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.locator('h1')).to_contain_text('WO-0001 · Smith Racing')
    job_url = page.url

    # ---- build sheet from the job ----
    page.click('a:has-text("New build sheet")')
    expect(page.locator('#f-work_order')).to_have_value('WO-0001')
    expect(page.locator('#f-customer')).to_have_value('Smith Racing')
    page.fill('#f-stroke', '3.75'); page.fill('#f-rod_length', '6.0'); page.fill('#f-hp', '905'); page.fill('#f-head_tq', '75')
    page.fill('[id="f-main_brg_id-#1"]', '2.4515'); page.fill('[id="f-main_journal-#1"]', '2.4490')
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_url(job_url)
    expect(page.locator('section:has-text("Build sheets for this job") .list-row')).to_have_count(1)

    # ---- jobs list, customer page, second job number ----
    page.goto(B + '/jobs')
    row = page.locator('.job-row:has-text("WO-0001")')
    expect(row).to_contain_text('$1,562.00'); expect(row).to_contain_text('Booked in')
    page.click('.chip:has-text("Collected")'); expect(page.locator('.job-row')).to_have_count(0)
    page.click('.chip:has-text("Open")'); expect(page.locator('.job-row')).to_have_count(1)
    page.goto(B + '/customers'); page.click('a:has-text("Smith Racing")')
    expect(page.locator('section:has-text("Engines")').first).to_contain_text('Smith 410 #1')
    expect(page.locator('section:has-text("Jobs")').last).to_contain_text('WO-0001')
    page.click('a:has-text("New job")'); expect(page.locator('#f-job_no')).to_have_value('WO-0002')
    page.goto(job_url)

    # ---- printout ----
    page.click('a:has-text("Job sheet / handover pack")')
    sheet = page.locator('.print-sheet')
    expect(sheet).to_contain_text('Hi-Rev Engines'); expect(sheet).to_contain_text('Engine handover pack')
    expect(sheet).to_contain_text('Smith Racing'); expect(sheet).to_contain_text('S/N SR-410-77')
    expect(sheet).to_contain_text('Ring set'); expect(sheet.locator('.ps-totals .grand')).to_contain_text('$1,562.00')
    expect(sheet).to_contain_text('Head torque'); expect(sheet).to_contain_text('Main bearing oil clearance')
    expect(sheet).to_contain_text('Payment due on collection.')
    shot(page, 'p15-02-print')
    page.uncheck('text=Show prices'); expect(sheet.locator('.ps-totals')).to_have_count(0)
    page.uncheck('text=Include build specs'); expect(sheet).to_contain_text('Job sheet'); expect(sheet).not_to_contain_text('Head torque')
    page.emulate_media(media='print'); expect(page.locator('.print-tools')).to_be_hidden(); page.emulate_media(media='screen')

    # ---- home panel ----
    page.goto(B + '/')
    expect(page.locator('.shop-home .chip:has-text("Booked in") b')).to_have_text('1')

    # ---- mobile ----
    mp = br.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True).new_page()
    mp.on('pageerror', lambda e: errors.append(str(e)))
    mp.goto(B); mp.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    mp.goto(B); expect(mp.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(mp.locator('.tabbar').get_by_role('link', name='Shop', exact=True)).to_be_visible()
    expect(mp.locator('.tabbar .tab:has-text("Track")')).to_have_count(0)
    mp.goto(B + job_url.replace(B, ''))
    w = mp.evaluate('document.documentElement.scrollWidth'); assert w <= 391, w
    shot(mp, 'p15-03-mobile-job')
    mp.goto(B + '/jobs'); shot(mp, 'p15-04-mobile-jobs', full=False)

    # ---- the race team is unchanged ----
    rsess = dict(sess, tenantId=RACE)
    rp = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    rp.goto(B); rp.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(rsess))})")
    rp.goto(B); expect(rp.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(rp.locator('aside .nav-area:has-text("Engine Builds")')).to_be_visible()
    expect(rp.locator('aside').get_by_role('link', name='Jobs', exact=True)).to_have_count(0)
    expect(rp.locator('aside .nav-area:has-text("At the Track")')).to_be_visible()
    expect(rp.locator('.shop-home')).to_have_count(0)
    br.close()

jobs = [r for r in call(f'/t/{SHOP}/sync?since=0', OT)[1]['records'] if r['type'] == 'job']
assert len(jobs) == 1 and jobs[0]['data']['values']['job_no'] == 'WO-0001', jobs
builds = [r for r in call(f'/t/{SHOP}/sync?since=0', OT)[1]['records'] if r['type'] == 'engine_build']
assert builds[0]['data']['values']['job'] == jobs[0]['id']
errs = [e for e in errors if 'favicon' not in e]
print('errors:', errs)
assert not errs
print('E2E15 OK')
