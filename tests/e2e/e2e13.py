import os
import json, sys, uuid, urllib.request, urllib.error
from datetime import datetime, timezone, date
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
OT, TID = o['token'], o['memberships'][0]['tenant_id']
pull = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
setup_form = next(r for r in pull if r['type'] == 'form' and r['data']['target'] == 'setup')
weights = next(s for s in setup_form['data']['sections'] if s['id'] == 'weights')
assert weights['fields'][0]['key'] == 'corner_weights', [f['key'] for f in weights['fields']]

now = datetime.now(timezone.utc).isoformat()
def rec(type, values, **extra):
    return {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **extra}, 'client_updated_at': now}
car = rec('car', {'name': 'Calc car', 'number': '5', 'rp_ratio': '4.86'})
ev = rec('event', {'name': 'Calc night', 'date': date.today().isoformat(), 'track': 'Test Speedway', 'track_length': '3/8 mi', 'car': car['id']})
s1 = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Heat 1', 'order': 10, 'day': 1, 'adr': '95', 'main_jet': '110'}, form_id=setup_form['id'])
s2 = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Feature', 'order': 20, 'day': 1, 'adr': '90'}, form_id=setup_form['id'])
assert all(r['status'] == 'applied' for r in call(f'/t/{TID}/sync', OT, 'POST', {'changes': [car, ev, s1, s2]})[1]['results'])

def out(page, label):
    return page.locator('.calc-out').filter(has=page.locator('dt', has_text=label)).first.locator('dd b')

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- calculators page ----
    page.locator('aside a.nav-link:has-text("Calculators")').first.click()
    expect(page.locator('h1:has-text("Calculators")')).to_be_visible()
    expect(page.locator('aside a.nav-link.active:has-text("Calculators")')).to_have_count(1)
    expect(page.locator('.calc-cat h3').first).to_have_text('Air & weather')
    page.click('.calc-item:has-text("Air correction")')
    page.fill('#calc-air-temp', '85'); page.fill('#calc-air-rh', '60'); page.fill('#calc-air-baro', '29.50')
    expect(out(page, 'ADR')).to_have_text('93')
    expect(out(page, 'Density altitude')).to_have_text('2456')
    expect(out(page, 'Correction factor (STD)')).to_have_text('1.065')
    page.click('summary:has-text("How it’s worked out")')
    expect(page.locator('.calc-how p')).to_contain_text('29.92')
    shot(page, 'p13-01-air')
    page.reload(); expect(page.locator('#calc-air-temp')).to_have_value('85')     # remembered on this device

    page.fill('input[aria-label="Search calculators"]', 'stagger')
    expect(page.locator('.calc-item')).to_have_count(2)
    page.click('.calc-item:has-text("Tyre stagger for the turn")')
    page.fill('#calc-stagger-turn', '180'); page.fill('#calc-stagger-outer', '105'); page.fill('#calc-stagger-spacing', '60')
    expect(out(page, 'Stagger')).to_have_text('5.83')
    page.fill('input[aria-label="Search calculators"]', '')

    # two-way calculator (mode select) and error message
    page.click('.calc-item:has-text("Corner weights ↔ percentages")')
    page.select_option('#calc-chassis-mode', 'Corner weights from percentages')
    page.fill('#calc-chassis-w', '1450'); page.fill('#calc-chassis-left', '49.66'); page.fill('#calc-chassis-rear', '62.07'); page.fill('#calc-chassis-cross', '46.21')
    expect(out(page, 'LR')).to_have_text('420')
    page.fill('#calc-chassis-cross', '5')
    expect(page.locator('.calc-panel .notice.error')).to_contain_text('negative')

    # engines area order + quick-change closest gear uses the team's gear list
    page.click('.calc-areas button:has-text("Engines")')
    expect(page.locator('.calc-cat h3').first).to_have_text('Engine builder')
    page.click('.calc-item:has-text("Dynamic compression")')
    for k, x in {'bore': '4.155', 'stroke': '3.75', 'rod': '6.0', 'cr': '14.5', 'ivc': '75'}.items(): page.fill(f'#calc-dynamic-cr-{k}', x)
    expect(out(page, 'Dynamic compression ratio')).to_have_text('10.5')
    page.click('.calc-areas button:has-text("All")')
    page.click('.calc-item:has-text("Quick-change final drive")')
    page.fill('#calc-qc-final-small', '22'); page.fill('#calc-qc-final-large', '27'); page.fill('#calc-qc-final-rp', '4.86'); page.fill('#calc-qc-final-target', '6.0')
    expect(out(page, 'Final drive')).to_have_text('5.965')
    expect(out(page, 'Closest in your gear list')).to_contain_text('large on')
    page.click('.calc-item:has-text("Unit converter")')
    page.select_option('#calc-converter-kind', 'Torque'); page.fill('#calc-converter-x', '100')
    expect(out(page, 'Equals')).to_contain_text('135.5818 Nm')

    # ---- setup sheet: corner weights fill the percentages ----
    page.goto(B + f'/r/setup/{s2["id"]}')
    for c, x in {'LF': '300', 'RF': '250', 'LR': '420', 'RR': '480'}.items(): page.fill(f'#f-corner_weights-{c}', x)
    for k, x in {'total_weight': '1450', 'left_pct': '49.7', 'rear_pct': '62.1', 'cross_pct': '46.2'}.items():
        assert page.input_value(f'#f-{k}') == x, (k, page.input_value(f'#f-{k}'))

    # ---- calculator beside a field: stagger ----
    page.click('button[aria-label="Tyre stagger for the turn calculator"]')
    dlg = page.locator('.calc-modal')
    expect(dlg).to_be_visible()
    dlg.locator('#calc-stagger-turn').fill('180'); dlg.locator('#calc-stagger-outer').fill('105'); dlg.locator('#calc-stagger-spacing').fill('60')
    dlg.locator('button:has-text("Use 5.83")').click()
    expect(dlg).to_have_count(0)
    assert page.input_value('#f-stagger_cold') == '5.83'

    # main jet: pre-filled from this sheet's ADR and the previous session's ADR and main pill
    page.click('button[aria-label="Main jet (pill) for new air calculator"]')
    expect(dlg.locator('#calc-main-jet-new_adr')).to_have_value('90')
    expect(dlg.locator('#calc-main-jet-base_adr')).to_have_value('95')
    expect(dlg.locator('#calc-main-jet-base_main')).to_have_value('110')
    dlg.locator('#calc-main-jet-nozzles').fill('0.0101')
    expect(out(page, 'New main pill')).to_contain_text('0.116')
    shot(page, 'p13-02-mainjet', full=False)
    dlg.locator('button:has-text("Use 116.1")').click()
    assert page.input_value('#f-main_jet') == '116.1'
    # Escape closes without using
    page.click('button[aria-label="Air correction calculator"] >> nth=0')
    expect(dlg).to_be_visible()
    page.keyboard.press('Escape')
    expect(dlg).to_have_count(0)
    page.get_by_role('button', name='Save', exact=True).click(); page.wait_for_timeout(800)

    # ---- engine build: clearances & checks ----
    page.goto(B + '/r/engine_build/new')
    expect(page.locator('.engine-checks')).to_have_count(0)
    page.fill('[id="f-main_brg_id-#1"]', '2.4515'); page.fill('[id="f-main_journal-#1"]', '2.4490')
    page.fill('#f-stroke', '3.75'); page.fill('#f-rod_length', '6.0'); page.fill('#f-peak_rpm', '8500')
    chk = page.locator('.engine-checks')
    expect(chk).to_contain_text('Main bearing oil clearance')
    expect(chk).to_contain_text('0.0025')
    expect(chk).to_contain_text('Rod ratio')
    expect(chk).to_contain_text('1.6')
    expect(chk).to_contain_text('5313 ft/min')
    chk.scroll_into_view_if_needed(); shot(page, 'p13-03-engine-checks', full=False)
    page.fill('#f-hp', '850')
    page.click('button[aria-label="Dyno correction calculator"]')
    dlg.locator('#calc-dyno-correction-temp').fill('85'); dlg.locator('#calc-dyno-correction-baro').fill('29.5'); dlg.locator('#calc-dyno-correction-rh').fill('60')
    expect(out(page, 'HP (STD)')).to_have_text('904.9')
    dlg.locator('button[aria-label="Close calculator"]').click()

    # ---- mobile ----
    m = br.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True).new_page()
    m.on('pageerror', lambda e: errors.append(str(e)))
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    m.goto(B); expect(m.locator('text=Synced')).to_be_visible(timeout=30000)
    m.goto(B + '/calculators')
    expect(m.locator('.calc-detail')).to_be_hidden()
    m.locator('.calc-item:has-text("Ballast")').tap()
    expect(m.locator('.calc-list')).to_be_hidden()
    m.fill('#calc-ballast-w', '1450'); m.fill('#calc-ballast-now', '49.66'); m.fill('#calc-ballast-target', '51')
    expect(m.locator('.calc-out').filter(has=m.locator('dt', has_text='Add to that side')).locator('dd b')).to_have_text('39.7')
    w = m.evaluate('document.documentElement.scrollWidth'); assert w <= 391, w
    shot(m, 'p13-04-mobile-calc', full=False)
    m.locator('.calc-back').tap()
    expect(m.locator('.calc-list')).to_be_visible()
    m.goto(B + f'/r/setup/{s2["id"]}')
    m.locator('button[aria-label="Tyre stagger for the turn calculator"]').tap()
    sheet = m.locator('.calc-sheet')
    expect(sheet).to_be_visible()
    box = sheet.bounding_box(); assert box['x'] >= 0 and box['x'] + box['width'] <= 391, box
    shot(m, 'p13-05-mobile-sheet', full=False)
    br.close()

g = next(r for r in call(f'/t/{TID}/sync?since=0', OT)[1]['records'] if r['id'] == s2['id'])['data']['values']
assert g['stagger_cold'] == '5.83' and g['main_jet'] == '116.1' and g['left_pct'] == '49.7' and g['corner_weights']['RR'] == '480', g
errs = [e for e in errors if 'favicon' not in e]
print('errors:', errs)
assert not errs
print('E2E13 OK')
