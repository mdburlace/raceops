import base64, json, os, sys, uuid, urllib.request, urllib.error
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')

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

pdf = os.path.join(HERE, 'ai-printout.pdf')
open(pdf, 'wb').write(b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

st, o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})
OT, TID = o['token'], o['memberships'][0]['tenant_id']
call('/admin/ai', OT, 'PUT', {'enabled': True})
call(f'/admin/tenants/{TID}', OT, 'PATCH', {'plan': 'pro', 'features': {}})

pull = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
guides = [r for r in pull if r['type'] == 'tuning_guide']
assert len(guides) == 2 and all(r['global'] for r in guides), [g['data']['values']['name'] for g in guides]
setup_form = next(r for r in pull if r['type'] == 'form' and r['data']['target'] == 'setup')
secs = [s['id'] for s in setup_form['data']['sections']]
assert 'weights' in secs and secs.index('weights') < secs.index('feedback'), secs

now = datetime.now(timezone.utc).isoformat()
def rec(type, values, **extra):
    return {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **extra}, 'client_updated_at': now}
car = rec('car', {'name': 'Advisor car', 'number': '7'})
evs = [rec('event', {'name': n, 'date': d, 'track': t, 'car': car['id']}) for n, d, t in
       [('Round 1', '2026-01-10', 'Lismore'), ('Round 2', '2026-02-10', 'Lismore'), ('Round 3', '2026-03-10', 'Lismore')]]
F = setup_form['id']
def sheet(ev, session, order, stagger, rr, driver=None, crew=None):
    vals = {'event': ev['id'], 'car': car['id'], 'session': session, 'order': order, 'day': 1, 'stagger_cold': stagger,
            'pressure_cold': {'LF': '10', 'RF': '14', 'LR': '9', 'RR': rr}}
    if driver is not None: vals['driver_feel'] = driver
    if crew is not None: vals['crew_feel'] = crew
    return rec('setup', vals, form_id=F)
s = [
    sheet(evs[0], 'Heat 1', 10, '70', '16', ['Loose exit']),
    sheet(evs[0], 'Feature', 20, '68', '15', [], ['Good drive off']),        # stagger down, RR down -> fixed
    sheet(evs[1], 'Heat 1', 10, '70', '16', ['Loose exit']),
    sheet(evs[1], 'Feature', 20, '69', '16', ['Loose exit']),                # stagger down -> still loose
    sheet(evs[2], 'Heat 1', 10, '71', '16', ['Loose exit', 'Spins tyres']),  # the sheet we're advising on
]
res = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [car, *evs, *s]})[1]['results']
assert all(r['status'] == 'applied' for r in res), res
CUR = s[4]['id']

# server-side advice (mock model) cites real records
st, adv = call(f'/t/{TID}/ai/advise', OT, 'POST', {'problems': ['Loose exit'], 'setup_id': CUR})
assert st == 200, adv
assert adv['suggestions'] and adv['links'], adv
assert any(l['type'] == 'setup' for l in adv['links'].values()) and any(l['type'] == 'rule' for l in adv['links'].values()), adv['links']
assert call(f'/t/{TID}/ai/advise', OT, 'POST', {'problems': []})[0] == 400

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- launch from the sheet; problems come from the feedback tags ----
    page.goto(B + f'/r/setup/{CUR}')
    expect(page.locator('#f-total_weight')).to_be_visible()      # new Weights & chassis section
    page.click('a.advisor-link')
    expect(page.locator('h1:has-text("Setup advisor")')).to_be_visible()
    grp = page.locator('[aria-label="Handling problem"]')
    expect(grp.locator('button:has-text("Loose exit")')).to_have_attribute('aria-pressed', 'true')
    expect(grp.locator('button:has-text("Not enough RR bite")')).to_have_attribute('aria-pressed', 'true')
    grp.locator('button:has-text("Not enough RR bite")').click()   # focus on loose exit only

    worked = page.locator('section.card:has(h3:has-text("What’s worked for you"))').first
    expect(worked).to_contain_text('sessions reported this')
    expect(worked.locator('.sessions-found')).to_contain_text('Round 1')
    row = worked.locator('.advisor-row:has-text("Stagger cold ↓")')
    expect(row).to_contain_text('tried 2×')
    expect(row).to_contain_text('gone next session 1×')
    expect(row).to_contain_text('still there 1×')
    expect(worked.locator('.advisor-row:has-text("Pressure cold RR ↓")')).to_contain_text('gone next session 1×')
    row.locator('button:has-text("Examples")').click()
    expect(row.locator('.examples li')).to_have_count(2)

    guide = page.locator('.advisor-row:has-text("Reduce stagger")').first
    expect(guide).to_contain_text('XXX Tech Department')
    expect(guide).to_contain_text('you tried it 2×')
    jj = page.locator('.advisor-row:has-text("Stagger: decrease")').first
    expect(jj).to_contain_text('Effective')
    expect(jj).to_contain_text('now: 71')
    shot(page, 'p10-01-advisor')

    guide.locator('button:has-text("+ Add to changes")').click()
    expect(guide.locator('.pill:has-text("added")')).to_be_visible()

    # ---- AI talk it through ----
    page.click('button:has-text("Talk it through")')
    expect(page.locator('.advice')).to_contain_text('Reduce stagger by 1/2 inch')
    expect(page.locator('.advice .notice')).to_contain_text('Guides disagree')
    expect(page.locator('.advice a.chip').first).to_be_visible()
    page.locator('.advice li button:has-text("+ Add to changes")').click()
    shot(page, 'p10-02-ai-advice')

    page.goto(B + f'/r/setup/{CUR}')
    expect(page.locator('#f-changes_next')).to_have_value('• Reduce stagger\n• Reduce stagger by 1/2 inch')
    expect(page.locator('text=Synced')).to_be_visible(timeout=15000)

    # ---- guides: list, view rules, import from PDF ----
    page.goto(B + '/track/advisor/guides')
    expect(page.locator('.list-row')).to_have_count(2)
    page.click('.list-row:has-text("Chassis Adjustment Guide")')
    expect(page.locator('h3:has-text("Rules (41)")').first).to_be_visible()
    page.select_option('select[aria-label="Filter by problem"]', 'Loose exit')
    n = page.locator('.rules-table tbody tr').count(); assert 0 < n < 41, n
    shot(page, 'p10-03-guide')

    page.goto(B + '/track/advisor/guides')
    page.set_input_files('input[aria-label="Guide file"]', pdf)
    expect(page.locator('.notice:has-text("Read by AI")')).to_be_visible()
    expect(page.locator('#g-name')).to_have_value('Imported guide')
    expect(page.locator('.rules-table tbody tr')).to_have_count(2)
    page.locator('.rules-table tbody tr').nth(0).locator('input[aria-label="Remedy"]').fill('Reduce stagger 1/4"')
    page.click('button:has-text("Save")')
    expect(page.locator('.notice:has-text("Saved")')).to_be_visible()
    page.goto(B + '/track/advisor/guides')
    expect(page.locator('.list-row')).to_have_count(3)
    expect(page.locator('.list-row:has-text("Imported guide")')).to_contain_text('2 rules')
    expect(page.locator('text=Synced')).to_be_visible(timeout=15000)

    # the team's own guide now shows up in advice
    page.goto(B + f'/track/advisor?setup={CUR}')
    expect(page.locator('.advisor-row:has-text("Reduce stagger 1/4")')).to_contain_text('Mock Chassis Co')

    # ---- mobile ----
    m = br.new_context(viewport={'width': 390, 'height': 844}).new_page()
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    m.goto(B); expect(m.locator('text=Synced')).to_be_visible(timeout=30000)
    m.goto(B + f'/track/advisor?setup={CUR}')
    expect(m.locator('.advisor-row').first).to_be_visible(timeout=30000)
    w = m.evaluate('document.documentElement.scrollWidth'); assert w <= 392, w
    shot(m, 'p10-04-mobile')
    br.close()

# server: imported guide saved for the team, not global
pull = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
imp = [r for r in pull if r['type'] == 'tuning_guide' and r['data']['values']['name'] == 'Imported guide']
assert len(imp) == 1 and not imp[0]['global'], imp
assert imp[0]['data']['values']['rules'][0]['remedy'] == 'Reduce stagger 1/4"'
cur = next(r for r in pull if r['id'] == CUR)
assert 'Reduce stagger' in cur['data']['values']['changes_next']

errs = [e for e in errors if 'favicon' not in e]
print('errors:', errs)
assert not errs
print('E2E10 OK')
