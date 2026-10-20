import json, sys, os, uuid, urllib.request, urllib.error, random
from datetime import datetime, timezone, date, timedelta
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
errors = []
random.seed(7)
def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
def shot(page, name, full=False):
    page.wait_for_timeout(500); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
now = datetime.now(timezone.utc).isoformat()
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]; OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Analytics Team', 'plan': 'pro'}); TID = t['id']
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
recs = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
form = lambda target, kind=None: next(r['id'] for r in recs if r['type'] == 'form' and r['data']['target'] == target and (kind is None or r['data'].get('dyno_kind') == kind))
AF, SF = form('asset'), form('setup')
car = rec('car', {'name': 'A car', 'number': '7'})
eng = rec('asset', {'name': 'Engine A', 'category': 'Engine', 'status': 'In Service', 'life_unit': 'Laps', 'life_limit': '600'}, form_id=AF)
lf = rec('asset', {'name': 'LF shock', 'category': 'Shock', 'status': 'In Service', 'position': 'LF', 'life_unit': 'Races', 'life_limit': '12'}, form_id=AF)
sch = rec('schedule', {'name': 'Change gear oil', 'applies_to': 'Car', 'car': car['id'], 'interval': '8', 'interval_unit': 'Races'})
tracks = ['Valley Speedway', 'Lakeside Raceway', 'Hilltop Oval']
conds = [['Heavy', 'Tacky'], ['Slick'], ['Dry slick', 'Slick'], ['Tacky']]
start = date.today() - timedelta(days=14 * 11)
out = [car, eng, lf, sch]
for n in range(10):
    d = (start + timedelta(days=14 * n)).isoformat()
    ev = rec('event', {'name': f'Night {n+1}', 'date': d, 'track': tracks[n % 3], 'car': car['id']}); out.append(ev)
    for k, (sess, order) in enumerate([('Heat 1', 10), ('Feature', 20)]):
        stagger = round(5 + (n % 4) * 0.5, 2)
        st_pos = random.randint(4, 10); gained = int(round((stagger - 5.5) * -3 + random.uniform(-1, 1)))
        fin = max(1, min(14, st_pos - gained))
        adr = 90 + n * 1.5
        vals = {'event': ev['id'], 'car': car['id'], 'session': sess, 'order': order, 'start': str(st_pos), 'finish': str(fin),
                'stagger_cold': str(stagger), 'wing_angle': str(12 + n % 3), 'pressure_cold': {'LF': '12', 'RF': '14', 'LR': '10', 'RR': str(15 + (n % 2))},
                'adr': str(adr), 'temp': str(60 + n * 2), 'main_jet': str(38 + round(adr / 10)), 'laps': '10' if k == 0 else '30',
                'fuel_start': '5' if k == 0 else '9', 'fuel_finish': str(round(3 - n * 0.02, 2)) if k == 0 else str(round(3 - n * 0.06, 2)),
                'tach_high': str(8600 - n * 15), 'tach_low': str(5200 - n * 10),
                'engine': {'asset': eng['id']}, 'shocks': {'LF': {'asset': lf['id']}},
                'track_conditions': conds[n % 4], 'driver_feel': (['Loose exit'] if k == 0 and n % 2 == 0 else [])}
        if k == 1 and n % 2 == 0: vals['stagger_cold'] = str(stagger - 0.5)   # changed after "Loose exit"
        out.append(rec('setup', vals, form_id=SF))
out.append(rec('engine_build', {'engine': eng['id'], 'date': (start - timedelta(days=5)).isoformat(), 'build_type': 'Fresh build', 'hp': '880'}, form_id=form('engine_build')))
out.append(rec('engine_build', {'engine': eng['id'], 'date': (start + timedelta(days=70)).isoformat(), 'build_type': 'Freshen', 'hp': '868'}, form_id=form('engine_build')))
DF = form('dyno_run', 'shock')
for i, (ca, ra) in enumerate([(220, -330), (210, -312), (196, -290)]):
    out.append(rec('dyno_run', {'asset': lf['id'], 'date': (start + timedelta(days=50 * i)).isoformat(), 'label': f'Check {i+1}', 'adjust_type': 'Non-adjustable',
                                'data': [{'v': '3', 'ca': str(ca * 0.7), 'ra': str(ra * 0.7)}, {'v': '5', 'ca': str(ca), 'ra': str(ra)}]}, form_id=DF))
st, r = call(f'/t/{TID}/sync', OT, 'POST', {'changes': out}); assert all(x['status'] == 'applied' for x in r['results']), r

with sync_playwright() as pw:
    br = pw.chromium.launch(); page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    # Home card
    home = page.locator('[data-testid="analytics-home"]'); expect(home).to_be_visible()
    expect(home).to_contain_text('Last 5 features')
    shot(page, '22-00-home')
    page.click('aside a.nav-link:has-text("Analytics")')
    expect(page).to_have_url(f'{B}/analytics')
    # ---- performance ----
    expect(page.locator('.kpi:has-text("Nights") .kpi-value')).to_have_text('10')
    expect(page.locator('.data-note').first).to_contain_text('Based on 20 sessions over 10 nights')
    expect(page.locator('table:has(th:text("Last raced")) tbody tr')).to_have_count(3)
    expect(page.locator('.card:has(h3:text-is("Track conditions"))')).to_contain_text('Slick')
    fb = page.locator('.fb-item:has-text("Loose exit")'); expect(fb).to_contain_text('5 sessions'); expect(fb).to_contain_text('Stagger cold ↓')
    # hover tooltip and tap-through
    svg = page.locator('.card:has(h3:text-is("Results over time")) svg')
    box = svg.bounding_box(); page.mouse.move(box['x'] + box['width'] - 80, box['y'] + 60)
    expect(page.locator('.viz-tip')).to_be_visible()
    shot(page, '22-01-performance')
    page.mouse.click(box['x'] + box['width'] - 80, box['y'] + 60)
    expect(page).to_have_url(lambda u: '/r/setup/' in u) if False else page.wait_for_url('**/r/setup/**')
    page.go_back()
    # filters: features only
    page.select_option('select[aria-label=Sessions]', 'feature')
    expect(page.locator('.data-note').first).to_contain_text('Based on 10 sessions')
    page.select_option('select[aria-label="Track conditions"]', 'Slick')
    expect(page.locator('.analytics-filters .chip:has-text("Slick")')).to_be_visible()
    page.click('.analytics-filters .chip:has-text("Slick")')
    page.select_option('select[aria-label=Sessions]', 'all')
    # ---- setups ----
    page.click('.tabs button:has-text("Setups")')
    expect(page).to_have_url(f'{B}/analytics?tab=setups')
    expect(page.locator('[data-testid="what-worked"]')).to_contain_text('less stagger cold has gone with more places gained')
    expect(page.locator('.card:has(h3:text-is("What worked")) circle')).to_have_count(20)
    shot(page, '22-02-setups')
    page.select_option('select[aria-label=Result]', 'finish')
    expect(page.locator('[data-testid="what-worked"]')).to_contain_text('better finishes')
    expect(page.locator('.drift-cell')).to_have_count(3)
    page.select_option('select[aria-label="Add a setting to follow"]', label='Main')
    expect(page.locator('.drift-cell')).to_have_count(4)
    expect(page.locator('[data-testid="jet-chart"] tbody tr').first).to_be_visible()
    page.locator('.card:has(h3:text-is("Jetting vs air"))').scroll_into_view_if_needed(); shot(page, '22-03-jetting')
    # ---- engines & parts ----
    page.click('.tabs button:has-text("Engines & parts")')
    fc = page.locator('[data-testid="forecast"]')
    expect(fc).to_contain_text('Engine A'); expect(fc).to_contain_text('LF shock'); expect(fc).to_contain_text('Change gear oil')
    eng_row = fc.locator('tr:has-text("Engine A")')
    expect(eng_row).to_contain_text('400 / 600 laps'); expect(eng_row).to_contain_text('40 laps'); expect(eng_row).to_contain_text('5.0')
    expect(page.locator('.drift-cell:has-text("Fuel per lap")')).to_contain_text('→')
    expect(page.locator('.drift-cell:has-text("Dyno HP")')).to_contain_text('880 → 868')
    fade = page.locator('[data-testid="fade"]'); expect(fade.locator('tbody tr')).to_have_count(3); expect(fade).to_contain_text('-11%')
    shot(page, '22-04-engines', full=True)
    # ---- mobile ----
    m = br.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    m.on('pageerror', lambda e: errors.append(str(e)))
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    for tab in ['', '?tab=setups', '?tab=engines']:
        m.goto(f'{B}/analytics{tab}'); m.wait_for_timeout(2000)
        assert m.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), tab
        shot(m, f'22-05-mobile{tab.replace("?tab=", "-")}')
    br.close()
# permissions: a driver sees Analytics (view), a role without it doesn't
roles = call(f'/t/{TID}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
drv = next(r for r in roles if r['name'].startswith('Driver')); assert 'analytics.view' in drv['permissions'], drv
assert not errors, errors
print('E2E22 OK')
