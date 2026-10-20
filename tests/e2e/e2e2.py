import os
import json, sys, urllib.request
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
TODAY = date.today().isoformat()
errors = []


def open_sec(page, sid='session'):
    page.wait_for_selector(f'#sec-{sid}', timeout=15000)
    t = page.locator(f'#sec-{sid} .sec-toggle[aria-expanded="false"]')
    if t.count(): t.click()

def add_session(p, name):
    p.select_option('.add-session select', name)
    p.click('.add-session button:has-text("Add session")')

def api(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    return json.loads(urllib.request.urlopen(req).read())

def shot(page, name, full=True):
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def save(page):
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(350)

def login(ctx, email, pw):
    p = ctx.new_page()
    p.on('pageerror', lambda e: errors.append(str(e)))
    p.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    p.goto(B); p.fill('input[type=email]', email); p.fill('input[type=password]', pw); p.click('button:has-text("Sign in")')
    expect(p.locator('h1')).to_contain_text("G'day", timeout=10000)
    expect(p.locator('text=Synced')).to_be_visible(timeout=30000)
    return p

owner = api('/auth/login', body={'email': 'owner@test.com', 'password': 'password1'}, method='POST')
OT, TID = owner['token'], owner['memberships'][0]['tenant_id']

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900})
    page = login(ctx, 'owner@test.com', 'password1')
    expect(page.locator('.area-tile:not(.area-admin)')).to_have_count(4)
    shot(page, 'p2-01-landing')

    # ---- gears & tires ----
    for name, up, lo in [('QC-1', '24', '27'), ('QC-2', '25', '26')]:
        page.goto(B + '/r/gear/new'); page.fill('#f-name', name); page.fill('#f-small', up); page.fill('#f-large', lo)
        save(page)
    for name, pos, c in [('LR-1', 'LR', '104.5'), ('LR-2', 'LR', '105'), ('RR-1', 'RR', '111'), ('RR-2', 'RR', '110.5')]:
        page.goto(B + '/r/tire/new'); page.fill('#f-name', name); page.select_option('#f-position', pos); page.fill('#f-circumference', c); page.fill('#f-compound', 'H12')
        save(page)
    
    page.goto(B + '/track/gears?tab=stagger'); page.fill('.toolbar input[placeholder=any]', '6'); page.wait_for_timeout(300)
    expect(page.locator('tbody tr').first).to_contain_text('6.000')
    shot(page, 'p2-03-stagger')

    # ---- setup: gear + crew chief, and a Feature sheet ----
    page.goto(B + '/setups'); page.click('a:has-text("Heat 1")'); open_sec(page)
    page.select_option('#f-gear', label='QC-1 (24/27)'); page.select_option('#f-crew_chief', label='Mark'); save(page)
    page.goto(B + '/events'); page.click('a.list-row:has-text("Spring Classic")'); add_session(page, "Feature")
    expect(page.locator('#f-crew_chief')).to_have_value(owner['user']['id'])
    page.fill('#f-laps', '30'); page.fill('#f-start', '8'); page.fill('#f-finish', '3'); save(page)

    # ---- dyno: two shock runs + a bar test ----
    def shock_run(label, d, ca, ra):
        page.goto(B + '/workshop/dyno'); page.click('a:has-text("New shock run")')
        page.select_option('#f-asset', label='LF Shock #LF1'); page.fill('#f-date', d); page.fill('#f-label', label)
        page.click('button[aria-label="Remove 3.00"]'); page.click('button[aria-label="Remove 6.00"]')   # tested at 10 in/s only
        for i in range(1, 7):
            page.fill(f'input[aria-label="CA row {i+1}"]', str(ca * i)); page.fill(f'input[aria-label="RA row {i+1}"]', str(-ra * i))
        save(page)
    shock_run('LF baseline 76-93', (date.today() - timedelta(days=40)).isoformat(), 30, 28)
    shock_run('LF after rebuild', TODAY, 34, 31)
    page.goto(B + '/workshop/dyno'); expect(page.locator('.chart svg polyline')).to_have_count(4)
    shot(page, 'p2-04-dyno-overlay')
    page.click('a:has-text("New bar test")'); page.select_option('#f-asset', label='Bar 1000'); page.fill('#f-label', 'Bar 1000 check'); page.fill('#f-nominal', '1000')
    for i, ld in enumerate(['0', '505', '1010', '1500', '2010', '2490', '3005']):
        page.fill(f'input[aria-label="Compression row {i+1}"]', ld)
    expect(page.locator('.field:has(label:text("Rate (slope")) .calc')).to_contain_text('998.9')
    save(page)
    page.goto(B + '/setups'); page.click('a:has-text("Heat 1")'); page.click('a:has-text("Shock dyno")')
    expect(page.locator('.chart')).to_be_visible(); shot(page, 'p2-05-dyno-from-setup')

    # ---- engine build ----
    page.goto(B + '/engines'); page.click('a:has-text("New build")')
    page.select_option('#f-build_type', 'Fresh build'); page.fill('#f-hp', '905')
    for c in range(1, 9):
        page.fill(f'#f-bore_max-\\#{c}', '4.125'); page.fill(f'#f-chamber_cc-\\#{c}', '58'); page.fill(f'#f-deck_clearance-\\#{c}', '0.005'); page.fill(f'#f-piston_volume-\\#{c}', '-4')
    page.fill('#f-stroke', '3.75'); page.fill('#f-gasket_bore', '4.2'); page.fill('#f-gasket_thickness', '0.041')
    page.fill('#f-int_open', '40'); page.fill('#f-int_close', '72'); page.fill('#f-exh_open', '78'); page.fill('#f-exh_close', '36')
    cid = page.locator('.field:has(label:text("C.I.D.")) .calc').inner_text()
    cr = page.locator('.field:has(label:text("Average compression ratio")) .calc').inner_text()
    print('CID', cid, 'CR', cr)
    assert cid.startswith('400'), cid
    shot(page, 'p2-06-engine-build')
    save(page)
    page.goto(B + '/engines'); shot(page, 'p2-07-engines')

    # ---- between-round check ----
    page.goto(B + '/track/checks'); page.click('a:has-text("New check")')
    page.select_option('#f-after_session', 'Heat 1')
    for i in range(5): page.locator('.check-item input[type=checkbox]').nth(i).check()
    page.locator('.check-item:has-text("Fuel added") input.num').fill('2.5'); page.fill('#f-issues', 'RR wheel bent — replaced')
    save(page); expect(page.locator('.list-row').first).to_contain_text('issues')

    # ---- review + reports ----
    page.goto(B + '/team/reviews'); page.click('a:has-text("New review")')
    page.select_option('#f-member', label='Crew Member'); page.fill('#f-period', '2026 season')
    for k, val in [('r_prep', '4'), ('r_setup', '5'), ('r_comm', '4'), ('r_team', '5'), ('r_reliability', '4'), ('r_safety', '5')]:
        page.select_option(f'#f-{k}', val)
    save(page)
    page.goto(B + '/team/reports'); shot(page, 'p2-08-reports')
    page.goto(B + '/team/stats'); expect(page.locator('tbody tr')).to_have_count(1); shot(page, 'p2-09-crew-stats')
    page.goto(B + '/track'); shot(page, 'p2-10-track-hub')
    page.goto(B + '/workshop'); shot(page, 'p2-11-workshop-hub')
    page.goto(B + '/roles'); page.click('button.list-row:has-text("Mechanic")'); shot(page, 'p2-12-roles')

    # ---- RBAC: mechanic has no Team area and cannot pull reviews ----
    mech = api('/auth/login', body={'email': 'crew@test.com', 'password': 'password2'}, method='POST')
    pulled = api(f'/t/{TID}/sync?since=0', mech['token'])['records']
    types = sorted(set(r['type'] for r in pulled))
    print('mechanic pulls', types)
    assert 'review' not in types
    c2 = br.new_context(viewport={'width': 1366, 'height': 900})
    mp = login(c2, 'crew@test.com', 'password2')
    expect(mp.locator('.area-tile.locked-tile')).to_have_count(1)
    expect(mp.locator('.locked-tile')).to_contain_text('No access')
    shot(mp, 'p2-13-mechanic-landing')
    mp.goto(B + '/team/reviews'); expect(mp.locator('.locked')).to_be_visible()
    # denied write through the API
    res = api(f'/t/{TID}/sync', mech['token'], 'POST', {'changes': [{'id': '11111111-1111-4111-8111-111111111111', 'type': 'review', 'data': {'values': {}}, 'client_updated_at': TODAY + 'T00:00:00Z'}]})
    assert res['results'][0]['status'] == 'denied', res

    # ---- licensing: switch team to the Trackside plan ----
    page.goto(B + '/admin/teams'); page.click('.team-row button.list-row >> nth=0'); page.select_option('.team-editor select[id^="tp-"]', 'trackside'); page.click('button:has-text("Save licence")'); expect(page.locator('.team-editor .notice.info')).to_contain_text('Saved')
    page.wait_for_timeout(800)
    shot(page, 'p2-14-licences')
    pulled = api(f'/t/{TID}/sync?since=0', OT)['records']
    types = sorted(set(r['type'] for r in pulled)); print('owner pulls on trackside plan', types)
    assert 'engine_build' not in types and 'dyno_run' not in types
    page.goto(B + '/'); page.reload(); page.wait_for_timeout(2500)
    expect(page.locator('.locked-tile')).to_contain_text('Not in plan')
    shot(page, 'p2-15-landing-trackside-plan')
    page.goto(B + '/workshop/dyno'); expect(page.locator('.locked')).to_contain_text('plan')
    api(f'/admin/tenants/{TID}', OT, 'PATCH', {'plan': 'pro', 'features': {}})

    # ---- mobile ----
    sess = json.loads(page.evaluate("localStorage.getItem('raceops.session')"))
    m = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p3 = m.new_page(); p3.on('pageerror', lambda e: errors.append(str(e)))
    p3.goto(B); p3.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    p3.goto(B); p3.wait_for_timeout(3000)
    shot(p3, 'p2-20-mobile-landing'); p3.screenshot(path=f'{OUT}/p2-20-mobile-landing-fold.png')
    p3.goto(B + '/track'); shot(p3, 'p2-21-mobile-track')
    p3.goto(B + '/workshop/dyno'); shot(p3, 'p2-22-mobile-dyno')
    p3.goto(B + '/engines'); p3.locator('.engine-card a.grow').first.click(); p3.wait_for_timeout(500); shot(p3, 'p2-23-mobile-engine-build')
    br.close()

print('errors:', errors[:10])
print('OK')
