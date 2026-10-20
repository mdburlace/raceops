import json, sys, os, uuid, urllib.request, urllib.error
from datetime import datetime, timezone, date, timedelta
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
errors = []
def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
def shot(page, name, full=False):
    page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
now = datetime.now(timezone.utc).isoformat()
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
d = lambda n: (date.today() - timedelta(days=n)).isoformat()
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]; OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Bar Team', 'plan': 'pro'}); TID = t['id']
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
recs = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
AF = next(r['id'] for r in recs if r['type'] == 'form' and r['data']['target'] == 'asset')
BF = next(r for r in recs if r['type'] == 'form' and r['data'].get('dyno_kind') == 'bar')
secs = {s['id']: [f['key'] for f in s['fields']] for s in BF['data']['sections']}
assert {'serial', 'manufacturer', 'model', 'bar_type', 'corner', 'rate_travel'} <= set(secs['run']) and secs['rate'] == ['comp_at', 'reb_at', 'in_baseline'], secs
bars = [rec('asset', {'name': f'Bar {i}', 'category': 'Torsion Bar', 'status': 'In Service', 'serial_number': f'TB-10{i}', 'manufacturer': 'Smith', 'model': 'Pro', 'position': 'RF'}, form_id=AF) for i in range(4)]
tests = []
for i, rate in enumerate([1000, 1010, 990]):  # three new bars for the baseline
    tests.append(rec('dyno_run', {'asset': bars[i]['id'], 'date': d(30), 'label': f'New {i}', 'diameter': '1.000', 'bar_type': 'Solid', 'nominal': '1000', 'arm': '15', 'rate_travel': '3',
                                  'data': [{'x': '0', 'load': '0', 'unload': '0'}, {'x': '3', 'load': str(rate * 3), 'unload': str(rate * 3 - 90)}]}, form_id=BF['id']))
call(f'/t/{TID}/sync', OT, 'POST', {'changes': bars + tests})
with sync_playwright() as pw:
    br = pw.chromium.launch(); page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    # ---- set a baseline from the three new bars ----
    page.goto(B + '/workshop/dyno?kind=bar')
    bl = page.locator('[data-testid="bar-baselines"]')
    expect(bl).to_contain_text('1.000 in · Solid')
    bl.locator('button:has-text("Set baseline")').click()
    expect(bl.locator('.baseline-pick input[type=checkbox]:checked')).to_have_count(3)
    bl.locator('button:has-text("Save baseline (3)")').click(); page.wait_for_timeout(1500)
    expect(bl.locator('tbody tr').first).to_contain_text('1,000 lb/in')
    expect(bl.locator('tbody tr').first).to_contain_text('990–1,010')
    expect(bl.locator('tbody tr').first).to_contain_text('90 lb')
    shot(page, '24-01-baselines')
    # ---- a new test for the 4th bar: details come from the asset, readings compression + rebound ----
    page.click('a:has-text("New bar test")')
    page.select_option('#f-asset', label='Bar 3')
    expect(page.locator('#f-serial')).to_have_value('TB-103'); expect(page.locator('#f-manufacturer')).to_have_value('Smith')
    expect(page.locator('#f-model')).to_have_value('Pro'); expect(page.locator('#f-corner')).to_have_value('RF')
    expect(page.locator('#f-arm')).to_have_value('15'); expect(page.locator('#f-rate_travel')).to_have_value('3')
    page.fill('#f-label', 'Used bar check'); page.fill('#f-diameter', '1.000'); page.select_option('#f-bar_type', 'Solid'); page.fill('#f-nominal', '1000')
    expect(page.locator('input[aria-label="Rebound row 1"]')).to_be_visible()
    for i, x in enumerate(['0', '0.5', '1', '1.5', '2', '2.5', '3']):
        page.fill(f'input[aria-label="Compression row {i+1}"]', str(round(float(x) * 960)))
        page.fill(f'input[aria-label="Rebound row {i+1}"]', str(round(float(x) * 960 - (0 if x == '0' else 150))))
    res = page.locator('[data-testid="bar-results"]')
    expect(res.locator('.kpi:has-text("Rate at 3 in") .kpi-value')).to_have_text('960')
    expect(res.locator('.kpi:has-text("Split") .kpi-value')).to_have_text('150')
    expect(res.locator('.kpi:has-text("Against baseline") .kpi-value')).to_have_text('-4.0%')
    expect(res).to_contain_text('-4.0% against the 1000 lb/in')
    shot(page, '24-02-test', full=True)
    page.get_by_role('button', name='Save', exact=True).click(); page.wait_for_timeout(1500)
    # entered values override the table
    allr = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
    used = next(r for r in allr if r['type'] == 'dyno_run' and r['data']['values'].get('label') == 'Used bar check')
    assert used['data']['values']['serial'] == 'TB-103' and used['data']['values']['data'][6]['unload'] == '2730', used['data']['values']
    page.goto(f"{B}/r/dyno_run/{used['id']}")
    page.fill('#f-comp_at', '3030'); page.fill('#f-reb_at', '2950')
    expect(res.locator('.kpi:has-text("Rate at 3 in") .kpi-value')).to_have_text('1,010')
    expect(res).to_contain_text('From the compression and rebound entered')
    page.fill('#f-comp_at', ''); page.fill('#f-reb_at', '')
    # list: rate, split, against baseline
    page.goto(B + '/workshop/dyno?kind=bar')
    row = page.locator('.list-row:has-text("Used bar check")')
    expect(row).to_contain_text('960.0 lb/in · split 150 lb'); expect(row.locator('.lvl-over')).to_have_text('-4.0%')
    expect(page.locator('.chart svg polyline')).to_have_count(4)   # 2 runs selected × compression + rebound
    shot(page, '24-03-list')
    m = br.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    m.goto(f"{B}/r/dyno_run/{used['id']}"); m.wait_for_timeout(2000)
    m.locator('[data-testid="bar-results"]').scroll_into_view_if_needed(); shot(m, '24-04-mobile')
    assert m.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    br.close()
assert not errors, errors
print('E2E24 OK')
