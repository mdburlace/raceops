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
d = lambda n: (date.today() + timedelta(days=n)).isoformat()
login = lambda e, p: call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
o = login('owner@test.com', 'password1'); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Initial Team', 'plan': 'pro'}); TID = t['id']
o = login('owner@test.com', 'password1'); OT = o['token']
start = date.today() - timedelta(days=35); SM = start.month
settings = next(m for m in o['memberships'] if m['tenant_id'] == TID).get('settings') or {}
call(f'/t/{TID}', OT, 'PATCH', {'settings': {**settings, 'calendar_season_start': SM}})
recs = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
form = lambda target, kind=None: next(r for r in recs if r['type'] == 'form' and r['data']['target'] == target and (not kind or r['data'].get('dyno_kind') == kind))
SHF, BRF, AF, EF, CF, SF, FF, TF = form('dyno_run', 'shock'), form('dyno_run', 'bar'), form('asset')['id'], form('event'), form('car')['id'], form('series'), form('fixture'), form('track')['id']
keys = lambda f: [x['key'] for s in f['data']['sections'] for x in s['fields']]
assert 'initial' in keys(SHF) and 'initial' in keys(BRF)
assert {'sanctioning', 'major', 'major_name'} <= set(keys(EF)) and {'sanctioning', 'major_name'} <= set(keys(FF))
sanc = next(x for s in SF['data']['sections'] for x in s['fields'] if x['key'] == 'sanctioning'); assert sanc['type'] == 'select' and sanc['allowCustom']

bar = rec('asset', {'name': 'RF bar 1000', 'category': 'Torsion Bar', 'status': 'In Service', 'position': 'RF'}, form_id=AF)
shock = rec('asset', {'name': 'LF Penske', 'category': 'Shock', 'status': 'In Service', 'position': 'LF', 'adjust_type': 'Non-adjustable'}, form_id=AF)
ashock = rec('asset', {'name': 'LR Bilstein', 'category': 'Shock', 'status': 'In Service', 'position': 'LR', 'adjust_type': 'Rebound only'}, form_id=AF)
bt = lambda label, n, rate, init=False: rec('dyno_run', {'asset': bar['id'], 'date': d(-n), 'label': label, 'diameter': '1.000', 'bar_type': 'Solid', 'arm': '15', 'rate_travel': '3', 'initial': init,
                                                       'data': [{'x': '0', 'load': '0', 'unload': '0'}, {'x': '3', 'load': str(rate * 3), 'unload': str(rate * 3 - 60)}]}, form_id=BRF['id'])
b0 = bt('New bar', 200, 1000, True); b1 = bt('Mid season', 60, 960)
rows = lambda c, r: [{'v': '0', 'ca': '0', 'ra': '0'}, {'v': '5', 'ca': str(c), 'ra': str(-r)}, {'v': '10', 'ca': str(c * 1.5), 'ra': str(-r * 1.5)}]
s0 = rec('dyno_run', {'asset': shock['id'], 'date': d(-200), 'label': 'Out of the box', 'test_speeds': ['10.00'], 'initial': True, 'data': rows(100, 200)}, form_id=SHF['id'])
s1 = rec('dyno_run', {'asset': shock['id'], 'date': d(-30), 'label': 'After 20 nights', 'test_speeds': ['10.00'], 'data': rows(90, 180)}, form_id=SHF['id'])
sweep = lambda c: [{'label': 'set 10', 'adj': {}, 'note': '', 'data': rows(c, 400)}, {'label': 'set 20', 'adj': {}, 'note': '', 'data': rows(c, 300)}]
a0 = rec('dyno_run', {'asset': ashock['id'], 'date': d(-200), 'label': 'First build', 'adjust_type': 'Rebound only', 'test_speeds': ['10.00'], 'initial': True, 'settings': sweep(100)}, form_id=SHF['id'])
a1 = rec('dyno_run', {'asset': ashock['id'], 'date': d(-10), 'label': 'Check', 'adjust_type': 'Rebound only', 'test_speeds': ['10.00'], 'settings': sweep(110)[:1] + [{'label': 'set 30', 'adj': {}, 'note': '', 'data': rows(100, 250)}]}, form_id=SHF['id'])
old = rec('asset', {'name': 'RR old shock', 'category': 'Shock', 'status': 'In Service', 'position': 'RR', 'adjust_type': 'Non-adjustable'}, form_id=AF)
o0 = rec('dyno_run', {'asset': old['id'], 'date': d(-300), 'label': 'Old first', 'test_speeds': ['10.00'], 'data': rows(100, 200)}, form_id=SHF['id'])
o1 = rec('dyno_run', {'asset': old['id'], 'date': d(-100), 'label': 'Old second', 'test_speeds': ['10.00'], 'data': rows(95, 190)}, form_id=SHF['id'])
nb = rec('asset', {'name': 'LF bar 900', 'category': 'Torsion Bar', 'status': 'In Service', 'position': 'LF'}, form_id=AF)
car = rec('car', {'number': '12', 'name': 'Main', 'class': '410 Sprintcars', 'active': True}, form_id=CF)
trk = rec('track', {'name': 'Initial Valley Speedway', 'city': 'Valley', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TF, scope='global')
ser = rec('series', {'name': 'Initial Winter Series', 'season': str(start.year), 'class': '410 Sprintcars', 'sanctioning': 'Speedway Australia'}, form_id=SF['id'], scope='global')
fx = rec('fixture', {'name': 'Night 2', 'date': d(20), 'venue': trk['id'], 'classes': ['410 Sprintcars'], 'status': 'Scheduled', 'major': True, 'major_name': 'Australian Sprintcar Title', 'sanctioning': 'Sprintcars Australia'}, form_id=FF['id'], scope='global')
fx2 = rec('fixture', {'name': 'Winter Rd 1', 'date': d(27), 'venue': trk['id'], 'series': ser['id'], 'round': 1, 'status': 'Scheduled'}, form_id=FF['id'], scope='global')
ev = rec('event', {'name': 'Club night', 'date': d(13), 'venue': trk['id'], 'car': car['id'], 'intent': 'Planned'}, form_id=EF['id'])
res = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [bar, shock, ashock, b0, b1, s0, s1, a0, a1, old, o0, o1, nb, car, trk, ser, fx, fx2, ev]})[1]['results']
assert {r['status'] for r in res} == {'applied'}, res

with sync_playwright() as pw:
    br = pw.chromium.launch(); page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    # ---- bars: initial test, since-initial on later tests ----
    page.goto(B + '/workshop/dyno?kind=bar')
    expect(page.locator('.list-row:has-text("New bar") .pill')).to_have_text('Initial')
    page.click('a:has-text("Mid season")')
    si = page.locator('[data-testid="since-initial"]')
    expect(si).to_contain_text('-4.0%'); expect(si).to_contain_text('1,000 lb/in')
    shot(page, '26-01-bar-since-initial')
    page.goto(B + f'/r/dyno_run/{b0["id"]}')
    expect(page.locator('#f-initial')).to_be_checked()
    expect(page.locator('[data-testid="since-initial"]')).to_contain_text('This is the initial measurement')
    # marking another one: warned, and saving moves it
    page.goto(B + f'/r/dyno_run/{b1["id"]}')
    page.check('#f-initial')
    expect(page.locator('[data-testid="initial-clash"]')).to_contain_text('New bar')
    page.click('button:has-text("Save")'); page.wait_for_timeout(1200)
    page.goto(B + f'/r/dyno_run/{b0["id"]}')
    expect(page.locator('#f-initial')).not_to_be_checked()
    expect(page.locator('[data-testid="since-initial"]')).to_contain_text('+4.2%')  # 1000 vs the new initial (960)
    # ---- shocks: plain run and adjuster settings against the initial ----
    page.goto(B + f'/r/dyno_run/{s1["id"]}')
    expect(page.locator('[data-testid="vs-initial"]')).to_contain_text('compression -10.0%, rebound -10.0%')
    # first test of a new bar starts ticked; a later one doesn't
    page.goto(B + f'/r/dyno_run/new?form={BRF["id"]}')
    page.select_option('#f-asset', label='LF bar 900')
    expect(page.locator('#f-initial')).to_be_checked(); expect(page.locator('label.toggle:has(#f-initial)')).to_contain_text('Yes')
    page.select_option('#f-asset', label='RF bar 1000')
    expect(page.locator('#f-initial')).not_to_be_checked()
    page.goto(B + f'/r/dyno_run/new?form={SHF["id"]}&asset={nb["id"]}')
    expect(page.locator('#f-initial')).to_be_checked()
    # older runs saved before the option: the earliest offers to be marked
    page.goto(B + f'/r/dyno_run/{o1["id"]}')
    expect(page.locator('[data-testid="initial-offer"]')).to_have_count(0)
    page.goto(B + f'/r/dyno_run/{o0["id"]}')
    page.click('[data-testid="initial-offer"] button')
    expect(page.locator('#f-initial')).to_be_checked()
    page.click('button:has-text("Save")'); page.wait_for_timeout(1200)
    page.goto(B + f'/r/dyno_run/{o1["id"]}')
    expect(page.locator('[data-testid="vs-initial"]')).to_contain_text('compression -5.0%')
    page.goto(B + f'/r/dyno_run/{a1["id"]}')
    vi = page.locator('[data-testid="vs-initial"]')
    expect(vi.locator('tr:has-text("set 10")')).to_contain_text('+10.0%')
    expect(vi.locator('tr:has-text("set 30")')).to_contain_text('Not in the initial run')
    shot(page, '26-02-shock-vs-initial')
    # ---- calendar: quick edit under the entry, assign a series, sanctioning, major event name ----
    page.goto(B + '/calendar')
    row = page.locator(f'[data-event="{ev["id"]}"]')
    row.locator('button:has-text("Edit")').click()
    qe = row.locator('[data-testid="quick-edit"]')
    expect(qe).to_be_visible()
    qe.locator(f'select[aria-label="Series for Club night"]').select_option(label=f'Initial Winter Series ({start.year})')
    expect(qe.locator('input[aria-label="Sanctioning body"]')).to_have_value('Speedway Australia')
    qe.locator('input[aria-label="Round"]').fill('3')
    qe.locator('input[type=checkbox]').check()
    qe.locator('input[aria-label="Major event name"]').fill('Winter Warm-up Classic')
    shot(page, '26-03-quick-edit')
    qe.locator('button:has-text("Save")').click()
    expect(row.locator('[data-testid="quick-edit"]')).to_have_count(0)
    expect(row).to_contain_text('Round 3 · '); expect(row).to_contain_text('Initial Winter Series')
    expect(row).to_contain_text('Speedway Australia')
    expect(row).to_contain_text('★ Winter Warm-up Classic')
    # pulling the major event brings its name and sanctioning body
    page.click('.tabs button:has-text("Shared calendars")')
    page.click('.cal-views .seg button:has-text("Major events")')
    fr = page.locator(f'[data-fixture="{fx["id"]}"]')
    expect(fr).to_contain_text('★ Australian Sprintcar Title'); expect(fr).to_contain_text('Sprintcars Australia')
    fr.locator('button:has-text("Add to our calendar")').click()
    fr.locator('[data-testid="add-fx"] button.primary').click()
    expect(fr).to_contain_text('On our calendar')
    # editing a shared date opens under that date, not at the top
    page.click('.cal-views .seg button:has-text("All dates")')
    r2 = page.locator(f'[data-fixture="{fx2["id"]}"]')
    r2.locator('button:has-text("Edit")').click()
    expect(r2.locator('[data-testid="fx-editor"]')).to_be_visible()
    expect(page.locator('[data-testid="fx-editor"]')).to_have_count(1)
    expect(r2.locator('#f-name')).to_have_value('Winter Rd 1')
    r2.locator('button:has-text("Cancel")').click()
    page.click('.tabs button:has-text("Our calendar")')
    tr = page.locator('.cal-row:has-text("Night 2")')
    expect(tr).to_contain_text('★ Australian Sprintcar Title'); expect(tr).to_contain_text('Sprintcars Australia')
    # print and public page show them too
    page.goto(B + f'/print/calendar?year={start.year}')
    sh = page.locator('[data-testid="cal-sheet"]')
    expect(sh).to_contain_text('★ Australian Sprintcar Title'); expect(sh).to_contain_text('Speedway Australia')
    pub = call(f'/t/{TID}/calendar/publish', OT, 'PUT', {'on': True})[1]['calendar_publish']
    st, cal = call(f"/public/calendar/{pub['token']}")
    n2 = next(i for i in cal['items'] if i['name'] == 'Night 2')
    assert n2['major'] == 'Australian Sprintcar Title' and n2['sanctioning'] == 'Sprintcars Australia', n2
    br.close()
errs = [e for e in errors if 'Synced' not in e]
assert not errs, errs
print('E2E26 OK')
