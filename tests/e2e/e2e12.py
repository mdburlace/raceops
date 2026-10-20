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
assert o['platform']['weather'] is True, o['platform']

# ---- weather API ----
assert call(f'/t/{TID}/weather', OT)[0] == 400
st, w = call(f'/t/{TID}/weather?lat=-27.57&lon=153.0', OT)
assert st == 200 and w['tC'] == 25.5 and w['pHpa'] == 1008.2 and 'Open-Meteo' in w['attribution'], w
st, w2 = call(f'/t/{TID}/weather?lat=-27.57&lon=153.0&at=2026-09-01T09:00:00Z', OT)
assert st == 200 and w2['time'].startswith('2026-09-01T09'), w2
assert call(f'/t/{TID}/weather?lat=-27.57&lon=153.0&at=nonsense', OT)[0] == 400

pull = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
track = next(r for r in pull if r['type'] == 'track' and r['data']['values'].get('lat') and r['data']['values'].get('lon'))
nopos = next(r for r in pull if r['type'] == 'track' and not r['data']['values'].get('lat'))
setup_form = next(r for r in pull if r['type'] == 'form' and r['data']['target'] == 'setup')
keys = [f['key'] for s in setup_form['data']['sections'] if s['id'] == 'weather' for f in s['fields']]
assert keys[:6] == ['temp', 'baro', 'corrected', 'alt', 'adr', 'wb'] and {'humidity', 'dew_point', 'grains', 'wind', 'weather_source'} <= set(keys), keys

now = datetime.now(timezone.utc).isoformat()
today = date.today().isoformat()
def rec(type, values, **extra):
    return {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **extra}, 'client_updated_at': now}
car = rec('car', {'name': 'Weather car', 'number': '9'})
ev = rec('event', {'name': 'Weather night', 'date': today, 'venue': track['id'], 'track': track['data']['values']['name'], 'car': car['id']})
ev2 = rec('event', {'name': 'No-position night', 'date': today, 'venue': nopos['id'], 'track': nopos['data']['values']['name'], 'car': car['id']})
s1 = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Heat 1', 'order': 10, 'day': 1}, form_id=setup_form['id'])
s2 = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Heat 2', 'order': 20, 'day': 1, 'temp': '85', 'baro': '29.50', 'humidity': '60'}, form_id=setup_form['id'])
s3 = rec('setup', {'event': ev2['id'], 'car': car['id'], 'session': 'Heat 1', 'order': 10, 'day': 1}, form_id=setup_form['id'])
res = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [car, ev, ev2, s1, s2, s3]})[1]['results']
assert all(r['status'] == 'applied' for r in res), res

def val(page, k): return page.input_value(f'#f-{k}')

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- pull track weather into an empty sheet ----
    page.goto(B + f'/r/setup/{s1["id"]}')
    wx = page.locator('.wx-tools')
    expect(wx).to_be_visible()
    expect(page.locator('.field:has(#f-temp) .unit')).to_have_text('°F')
    expect(page.locator('.field:has(#f-baro) .unit')).to_have_text('inHg')
    wx.locator('button:has-text("Get track weather")').click()
    rv = page.locator('.wx-review')
    expect(rv).to_contain_text('Track weather')
    expect(rv).to_contain_text('Open-Meteo.com')
    expect(rv.locator('.wx-item:has-text("ADR")')).to_contain_text('95.3')
    shot(page, 'p12-01-weather-review', full=False)
    rv.locator('button:has-text("Apply ticked")').click()
    for k, x in {'temp': '77.9', 'baro': '29.77', 'corrected': '29.9', 'alt': '1645', 'adr': '95.3', 'wb': '68.4', 'humidity': '62', 'dew_point': '63.8', 'grains': '89.2', 'wind': '9 mph SE, gusts 16'}.items():
        assert val(page, k) == x, (k, val(page, k))
    assert val(page, 'weather_source').startswith('Test weather (mock)')
    page.get_by_role('button', name='Save', exact=True).click(); page.wait_for_timeout(600)

    # ---- typed-in readings are kept unless ticked; calculate from manual readings ----
    page.goto(B + f'/r/setup/{s2["id"]}')
    wx.locator('button:has-text("Calculate from readings")').click()
    rv = page.locator('.wx-review')
    expect(rv).to_contain_text('Calculated from your readings')
    rv.locator('button:has-text("Apply ticked")').click()
    for k, x in {'alt': '2456', 'adr': '93', 'grains': '110.2', 'dew_point': '69.6', 'wb': '74.3', 'temp': '85'}.items():
        assert val(page, k) == x, (k, val(page, k))
    # wet bulb instead of humidity
    page.fill('#f-humidity', ''); page.fill('#f-wb', '75')
    wx.locator('button:has-text("Calculate from readings")').click()
    expect(rv).to_contain_text('worked out from the dry and wet bulb')
    rv.locator('button:has-text("Apply ticked")').click()
    assert val(page, 'humidity') == '63' and val(page, 'alt') == '2472', (val(page, 'humidity'), val(page, 'alt'))
    # pulling over typed readings: they start unticked
    wx.locator('button:has-text("Get track weather")').click()
    expect(rv.locator('input[aria-label="Use Temp"]')).not_to_be_checked()
    expect(rv.locator('input[aria-label="Use Weather from"]')).to_be_checked()
    rv.locator('button:has-text("Cancel")').click()
    assert val(page, 'temp') == '85'
    # missing inputs
    page.fill('#f-baro', '')
    wx.locator('button:has-text("Calculate from readings")').click()
    expect(wx.locator('.notice.error')).to_contain_text('Baro')
    shot(page, 'p12-02-manual', full=False)

    # ---- track without a map position ----
    page.goto(B + f'/r/setup/{s3["id"]}')
    expect(wx).to_contain_text('has no latitude/longitude yet')
    expect(wx.locator('button:has-text("Get track weather")')).to_be_disabled()

    # ---- units: switch to metric ----
    wx.locator('select[aria-label="Weather units"]').select_option('metric')
    expect(page.locator('.field:has(#f-temp) .unit')).to_have_text('°C', timeout=10000)
    page.goto(B + f'/r/setup/{s1["id"]}')
    wx.locator('button:has-text("Get track weather")').click()
    expect(rv.locator('.wx-item').filter(has=page.locator('.wx-name', has_text='Baro')).first).to_contain_text('1008.2')
    rv.locator('button:has-text("Cancel")').click()
    wx.locator('select[aria-label="Weather units"]').select_option('imperial')
    expect(page.locator('.field:has(#f-temp) .unit')).to_have_text('°F', timeout=10000)

    # ---- hover descriptions ----
    page.goto(B + f'/r/setup/{s1["id"]}')
    btn = page.locator('.field:has(#f-baro) .info-btn')
    btn.hover()
    tip = page.locator('[role="tooltip"]')
    expect(tip).to_contain_text('uncorrected (station) pressure')
    expect(tip).to_contain_text('Where to find it')
    shot(page, 'p12-03-tooltip', full=False)
    page.mouse.move(5, 5)
    expect(tip).to_have_count(0)
    page.locator('.field:has(#f-stagger_cold) .info-btn').focus()
    expect(tip).to_contain_text('right rear circumference minus left rear')
    page.keyboard.press('Escape')
    expect(tip).to_have_count(0)
    assert page.locator('.info-btn').count() > 40
    btn.hover()
    expect(btn).to_have_attribute('aria-describedby', tip.get_attribute('id'))
    page.mouse.move(5, 5)

    # ---- team's own description in the form builder ----
    page.goto(B + f'/forms/{setup_form["id"]}')
    bf = page.locator('.builder-field').filter(has=page.locator('input.bf-label[value="Wicker"]'))
    bf.locator('button[aria-label="Field settings"]').click()
    expect(page.locator('#fi-wicker')).to_have_attribute('placeholder', 'Wicker bill (Gurney) height or type on the top wing.')
    page.fill('#fi-wicker', 'Our wicker: 1/2 in for heavy tracks, 1/4 in when slick.')
    page.fill('#fs-wicker', 'Measure from the top of the wing board.')
    page.click('button:has-text("Save form")')
    page.wait_for_timeout(800)
    page.goto(B + f'/r/setup/{s1["id"]}')
    page.locator('.field:has(#f-wicker) .info-btn').hover()
    expect(tip).to_contain_text('Our wicker')
    expect(tip).to_contain_text('top of the wing board')
    page.mouse.move(5, 5)

    # engine build descriptions
    page.goto(B + '/r/engine_build/new')
    page.locator('.field:has(#f-ring1_gap-LF) .info-btn, .field-label:has-text("Top ring end gap") .info-btn').first.hover()
    expect(tip).to_contain_text('Feeler gauge')

    # ---- mobile: tap to open, tap elsewhere to close; tooltip stays on screen ----
    m = br.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True).new_page()
    m.on('pageerror', lambda e: errors.append(str(e)))
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    m.goto(B); expect(m.locator('text=Synced')).to_be_visible(timeout=30000)
    m.goto(B + f'/r/setup/{s1["id"]}')
    expect(m.locator('.wx-tools')).to_be_visible()
    w = m.evaluate('document.documentElement.scrollWidth'); assert w <= 391, w
    for k in ['adr', 'grains']:
        b = m.locator(f'.field:has(#f-{k}) .info-btn')
        b.scroll_into_view_if_needed(); b.tap()
        t = m.locator('[role="tooltip"]')
        expect(t).to_be_visible()
        box = t.bounding_box(); assert box['x'] >= 0 and box['x'] + box['width'] <= 390, box
        t.tap()                                     # tapping the tip closes it
        expect(t).to_have_count(0)
    m.locator('.field:has(#f-adr) .info-btn').tap()
    expect(m.locator('[role="tooltip"]')).to_be_visible()
    m.locator('h1').tap()                           # tapping elsewhere closes it
    expect(m.locator('[role="tooltip"]')).to_have_count(0)
    m.locator('.field:has(#f-adr) .info-btn').tap()
    m.locator('[role="tooltip"]').scroll_into_view_if_needed()
    shot(m, 'p12-04-mobile-tip', full=False)
    br.close()

s = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
g = next(r for r in s if r['id'] == s1['id'])['data']['values']
assert g['adr'] == '95.3' and g['weather_source'].startswith('Test weather'), g
f = next(r for r in s if r['id'] == setup_form['id'])
wk = next(x for sec in f['data']['sections'] for x in sec['fields'] if x['key'] == 'wicker')
assert wk['info'].startswith('Our wicker') and wk['source'].startswith('Measure'), wk
errs = [e for e in errors if 'favicon' not in e]
print('errors:', errs)
assert not errs
print('E2E12 OK')
