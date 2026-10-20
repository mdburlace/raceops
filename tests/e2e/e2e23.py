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
def save(page):
    page.get_by_role('button', name='Save', exact=True).click(); page.wait_for_timeout(1500)
now = datetime.now(timezone.utc).isoformat()
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]; OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Units Team', 'plan': 'pro'}); TID = t['id']
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
recs = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
form = lambda target: next(r['id'] for r in recs if r['type'] == 'form' and r['data']['target'] == target)
shockform = next(r for r in recs if r['type'] == 'form' and r['data']['target'] == 'dyno_run' and r['data'].get('dyno_kind') == 'shock')['data']
barform = next(r for r in recs if r['type'] == 'form' and r['data']['target'] == 'dyno_run' and r['data'].get('dyno_kind') == 'bar')['data']
keys = lambda f: [x['key'] for s in f['sections'] for x in s['fields']]
assert 'test_speeds' in keys(shockform) and 'test_speeds' not in keys(barform)
AF = form('asset')
car = rec('car', {'name': 'Units car', 'number': '3', 'fuel_min': '1', 'fuel_min_unit': 'gal'})
shock = rec('asset', {'name': 'RF dyno shock', 'category': 'Shock', 'status': 'In Service'}, form_id=AF)
ev = rec('event', {'name': 'Units night', 'date': date.today().isoformat(), 'track': 'Somewhere', 'car': car['id']})
heat = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Heat 1', 'order': 10, 'laps': '10', 'fuel_start': '5', 'fuel_finish': '3'}, form_id=form('setup'))
call(f'/t/{TID}/sync', OT, 'POST', {'changes': [car, shock, ev, heat]})
with sync_playwright() as pw:
    br = pw.chromium.launch(); page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- 1. shock dyno at several test speeds ----
    page.goto(B + '/workshop/dyno'); page.click('a:has-text("New shock run")')
    page.select_option('#f-asset', label='RF dyno shock'); page.fill('#f-label', 'Speed test')
    for sp in ['3.00', '6.00', '10.00']: expect(page.locator(f'.tags-input .chip:has-text("{sp}")')).to_be_visible()
    expect(page.locator('.speed-table')).to_have_count(3)
    expect(page.locator('.speed-table[data-speed="3.00"] tbody tr')).to_have_count(4)          # 0,1,2,3
    expect(page.locator('.speed-table[data-speed="10.00"] tbody tr')).to_have_count(11)
    page.fill('input[aria-label="3.00 in/s CA row 4"]', '120'); page.fill('input[aria-label="3.00 in/s RA row 4"]', '-150')
    page.fill('input[aria-label="10.00 in/s CA row 6"]', '300'); page.fill('input[aria-label="10.00 in/s RA row 6"]', '-380')
    page.click('button[aria-label="Remove 6.00"]')
    expect(page.locator('.speed-table')).to_have_count(2)
    page.fill('#f-test_speeds', '8'); page.press('#f-test_speeds', 'Enter')
    expect(page.locator('.tags-input .chip:has-text("8.00")')).to_be_visible()
    expect(page.locator('.speed-table')).to_have_count(3)
    page.fill('input[aria-label="8.00 in/s CA row 6"]', '260')
    shot(page, '23-01-speeds', full=True)
    save(page)
    runs = [r for r in call(f'/t/{TID}/sync?since=0', OT)[1]['records'] if r['type'] == 'dyno_run']
    rv = runs[0]['data']['values']
    assert rv['test_speeds'] == ['3.00', '10.00', '8.00'], rv['test_speeds']
    by = {}
    for r in rv['data']: by.setdefault(r['s'], []).append(r)
    assert set(by) == {'3.00', '10.00', '8.00'}, by.keys()
    assert any(r.get('ca') == '120' for r in by['3.00']) and any(r.get('ca') == '300' for r in by['10.00'])
    # list + chart: a curve per speed
    page.goto(B + '/workshop/dyno')
    expect(page.locator('.list-row').first).to_contain_text('3 / 8 / 10 in/s')
    expect(page.locator('.legend .lg:has-text("10.00 in/s")')).to_be_visible()
    expect(page.locator('.legend .lg:has-text("3.00 in/s")')).to_be_visible()
    shot(page, '23-02-chart')
    # at least one speed
    page.click('a:has-text("New shock run")'); page.select_option('#f-asset', label='RF dyno shock')
    for sp in ['3.00', '6.00', '10.00']: page.click(f'button[aria-label="Remove {sp}"]')
    expect(page.locator('text=Pick at least one test speed')).to_be_visible()
    save(page); expect(page.locator('.field.has-error:has(#f-test_speeds)')).to_be_visible()
    # adjustable: + Setting adds a block per speed
    page.click('button:has-text("+ 6.00")'); page.select_option('#f-adjust_type', 'Two-way')
    page.click('button:has-text("+ 10.00")')
    page.click('.sweep button:has-text("+ Setting")')
    expect(page.locator('.sweep-item')).to_have_count(2)
    expect(page.locator('select[aria-label="Setting 1 test speed"]')).to_have_value('6.00')
    expect(page.locator('select[aria-label="Setting 2 test speed"]')).to_have_value('10.00')
    shot(page, '23-03-sweep')
    # older run without speeds: readings shown and can be moved to a speed
    legacy = rec('dyno_run', {'asset': shock['id'], 'date': date.today().isoformat(), 'label': 'Old run', 'adjust_type': 'Non-adjustable',
                              'data': [{'v': '5', 'ca': '210', 'ra': '-300'}]}, form_id=next(r['id'] for r in recs if r['type'] == 'form' and r['data'].get('dyno_kind') == 'shock'))
    call(f'/t/{TID}/sync', OT, 'POST', {'changes': [legacy]})
    page.goto(B); page.wait_for_timeout(1500); page.goto(f"{B}/r/dyno_run/{legacy['id']}")
    expect(page.locator('.speed-table.loose')).to_be_visible()
    page.click('button:has-text("+ 6.00")')                       # one speed: the old readings belong to it
    expect(page.locator('.speed-table.loose')).to_have_count(0)
    expect(page.locator('input[aria-label="CA row 1"]')).to_have_value('210')
    page.click('button:has-text("+ 10.00")')                      # two speeds: say which one they were
    expect(page.locator('.speed-table.loose')).to_be_visible()
    page.select_option('select[aria-label="Move readings to speed"]', '6.00'); page.click('.speed-table.loose button:has-text("Move")')
    expect(page.locator('.speed-table.loose')).to_have_count(0)
    expect(page.locator('input[aria-label="6.00 in/s CA row 1"]')).to_have_value('210')

    # ---- 2. fuel in US gallons or litres ----
    page.goto(f"{B}/r/setup/new?event={ev['id']}&car={car['id']}&session=Feature&order=20")
    if page.locator('button:has-text("Blank sheet")').count(): page.click('button:has-text("Blank sheet")')
    fp = page.locator('[data-testid="fuel-planner"]')
    expect(fp.locator('select[aria-label="Fuel recorded in"]')).to_have_value('gal')
    expect(fp).to_contain_text('0.200 gal/lap')
    page.fill('#f-fuel_start', '10'); page.fill('#f-fuel_finish', '4')
    expect(page.locator('.field:has(> .field-label > label:text("Fuel used")) .calc')).to_contain_text('6')
    # show in litres: converted, read-only
    fp.locator('.seg button:has-text("Litres")').click()
    expect(page.locator('#f-fuel_start')).to_have_count(0)
    expect(page.locator('.field:has(> .field-label > label:text("Fuel started"))')).to_contain_text('37.85')
    expect(page.locator('.field:has(> .field-label > label:text("Fuel started")) .unit')).to_have_text('L')
    expect(fp).to_contain_text('0.757 L/lap'); expect(fp).to_contain_text('Minimum kept in the tank: 3.8 L')
    expect(fp.locator('.notice.info')).to_contain_text('converted')
    shot(page, '23-04-fuel-litres')
    fp.locator('.seg button:has-text("US gal")').click()
    expect(page.locator('#f-fuel_start')).to_have_value('10')
    # record in litres: amounts converted
    fp.locator('select[aria-label="Fuel recorded in"]').select_option('L')
    expect(page.locator('#f-fuel_start')).to_have_value('37.85'); expect(page.locator('#f-fuel_finish')).to_have_value('15.14')
    save(page)
    feat = next(r for r in call(f'/t/{TID}/sync?since=0', OT)[1]['records'] if r['type'] == 'setup' and r['data']['values'].get('session') == 'Feature')
    assert feat['data']['values']['fuel_unit'] == 'L' and feat['data']['values']['fuel_start'] == '37.85', feat['data']['values']
    # make litres the team default
    page.goto(f"{B}/r/setup/{feat['id']}")
    fp.locator('button:has-text("Make litres the team default")').click(); page.wait_for_timeout(1500)
    expect(fp.locator('button:has-text("team default")')).to_have_count(0)
    page.goto(f"{B}/r/setup/new?event={ev['id']}&car={car['id']}&session=Dash&order=15")
    if page.locator('button:has-text("Blank sheet")').count(): page.click('button:has-text("Blank sheet")')
    expect(fp.locator('select[aria-label="Fuel recorded in"]')).to_have_value('L')
    expect(fp).to_contain_text('L/lap')                     # gal and L sessions combined
    page.goto(B + '/r/car/new'); expect(page.locator('#f-fuel_min_unit')).to_have_value('L')
    # fuel calculator works in the sheet's unit
    page.goto(f"{B}/r/setup/{feat['id']}")
    page.locator('button[aria-label="Fuel for a race calculator"]').click()
    expect(page.locator('.calc-sheet select').first).to_have_value('Litres')
    page.keyboard.press('Escape')
    # analytics labels fuel per lap in the team unit
    page.goto(B + '/analytics?tab=engines')
    expect(page.locator('h3:text-is("Engine health")')).to_be_visible()
    m = br.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    m.goto(f"{B}/r/setup/{feat['id']}"); m.wait_for_timeout(2000)
    m.locator('.sheet-nav .sn-chip:text-is("Race")').click(); m.wait_for_timeout(800); shot(m, '23-05-mobile-fuel')
    m.goto(f"{B}/r/dyno_run/{runs[0]['id']}"); m.wait_for_timeout(1500); shot(m, '23-06-mobile-dyno')
    assert m.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    br.close()
assert not errors, errors
print('E2E23 OK')
