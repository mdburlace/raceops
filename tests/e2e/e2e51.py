# Engine teardown & pre-check: a teardown started from the engine's card is of its latest build and takes the
# limits from the engine's last teardown; readings entered on the sheet (plugs, springs against the build's
# seat pressure, bores at three depths without a torque plate, a cracked crank fillet, deck heights) give
# findings worked out here independently, with the likely causes; the suggested decisions fill the
# reuse / machine / replace table; the rebuild sheet started from it links back, and the build shows the
# teardown before it; the printout (filled and blank); a read-only role sees findings but can't change them;
# a phone.
import json, os, sys, uuid, urllib.request, urllib.error
from datetime import date, datetime, timedelta, timezone
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
login = lambda e='owner@test.com', p='password1': call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
now = lambda: datetime.now(timezone.utc).isoformat()
TODAY = date.today()
day = lambda n: (TODAY + timedelta(days=n)).isoformat()

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Teardown Racing', 'plan': 'pro'}); assert st == 200, t; TID = t['id']
o = login(); OT = o['token']
RUN = TID[:6]
st, role = call(f'/t/{TID}/roles', OT, 'POST', {'name': 'Engine reader', 'permissions': ['area.engines', 'engines.view', 'assets.view']}); assert st == 200, role
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': f'reader51+{RUN}@test.com', 'role_id': role['id']})
assert call(f'/invites/{inv["token"]}/accept', method='POST', body={'name': 'Reader', 'password': 'password51'})[0] == 200
RD = login(f'reader51+{RUN}@test.com', 'password51')
recs = lambda tok=OT: [r for r in call(f'/t/{TID}/sync?since=0', tok)[1]['records'] if not r['global'] and not r['deleted']]
forms = {r['data']['target']: r for r in recs() if r['type'] == 'form' and r['data'].get('base')}
assert 'engine_teardown' in forms, 'new teams get the teardown form'
secs = [s['id'] for s in forms['engine_teardown']['data']['sections']]
assert secs == ['teardown', 'limits', 'visual', 'valvetrain', 'rotating', 'ndt', 'decision'], secs
# the team the server started with got the form too (forms are brought up to date on start)
first = o['memberships'][0]['tenant_id'] if o['memberships'][0]['tenant_id'] != TID else o['memberships'][1]['tenant_id']
assert any(r['type'] == 'form' and r['data'].get('target') == 'engine_teardown' for r in call(f'/t/{first}/sync?since=0', OT)[1]['records'])

def until(fn, what, secs=20):
    import time
    for _ in range(secs * 4):
        x = fn()
        if x: return x
        time.sleep(0.25)
    raise AssertionError(f'timed out waiting for {what}')

def add(type, vals):
    res = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [{'id': str(uuid.uuid4()), 'type': type, 'data': {'form_id': forms[type]['id'] if type in forms else None, 'values': vals}, 'client_updated_at': now()}]})[1]['results'][0]
    assert res['status'] == 'applied', res
    return res['record']

engine = add('asset', {'name': 'Motor 51', 'category': 'Engine', 'status': 'In Service'})
CYL = [f'#{i}' for i in range(1, 9)]
old_build = add('engine_build', {'engine': engine['id'], 'date': day(-400), 'build_type': 'Fresh build'})
build = add('engine_build', {'engine': engine['id'], 'date': day(-200), 'build_type': 'Freshen', 'seat_pressure': {'Int': '250', 'Exh': '260'},
                             'piston_size': {c: '4.1200' for c in CYL}})
# the engine's last teardown holds the limits the builder uses
add('engine_teardown', {'engine': engine['id'], 'date': day(-210), 'build': old_build['id'], 'spring_loss_max': '8', 'bore_taper_max': '0.0005', 'bore_oor_max': '0.0004',
                        'deck_flat_max': '0.001', 'deck_parity_max': '0.001', 'skirt_loss_max': '0.0010', 'valve_stretch_max': '0.002', 'plug_read': {'#1': 'Good'}})

# ---- independently: what the readings below should give
seat_int = {'#1': '245', '#2': '226', '#3': '231', '#4': '248'}       # vs 250 lb new (from the build), 8% limit
loss = {c: (250 - float(x)) / 250 * 100 for c, x in seat_int.items()}
over_springs = [c for c, d in loss.items() if d > 8]                     # #2 9.6%
near_springs = [c for c, d in loss.items() if 6.4 <= d <= 8]             # #3 7.6%
assert over_springs == ['#2'] and near_springs == ['#3'], (over_springs, near_springs)
bore1 = {'top_t': '4.1260', 'top_p': '4.1255', 'mid_t': '4.1258', 'mid_p': '4.1256', 'bot_t': '4.1252', 'bot_p': '4.1253'}
taper1 = max(abs(4.1260 - 4.1252), abs(4.1255 - 4.1253))                 # 0.0008 > 0.0005
oor1 = max(abs(4.1260 - 4.1255), abs(4.1258 - 4.1256), abs(4.1252 - 4.1253))  # 0.0005 > 0.0004
decks = {'Left front': '9.0250', 'Left rear': '9.0252', 'Right front': '9.0235', 'Right rear': '9.0237'}
side = abs((9.0250 + 9.0252) / 2 - (9.0235 + 9.0237) / 2)               # 0.0015 > 0.001
assert round(taper1, 4) == 0.0008 and round(oor1, 4) == 0.0005 and round(side, 4) == 0.0015

with sync_playwright() as pw:
    br = pw.chromium.launch()
    def open_as(user, w=1366, h=900):
        ctx = br.new_context(viewport={'width': w, 'height': h})
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
        tid = next(m['tenant_id'] for m in user['memberships'] if m['tenant_id'] == TID)
        s = {'token': user['token'], 'user': user['user'], 'memberships': user['memberships'], 'platform': user.get('platform'), 'tenantId': tid}
        page.goto(B); page.wait_for_load_state('networkidle'); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
        return page
    page = open_as(o)
    cell = lambda key, c: page.locator(f'[id="f-{key}-{c}"]')

    # ---- start from the engine's card: the latest build is picked and the limits come from the last teardown
    page.goto(B + '/engines')
    card = page.locator('.engine-card', has_text='Motor 51')
    expect(card.locator('[data-testid="teardown-row"]')).to_have_count(1, timeout=15000)
    card.locator('[data-testid="new-teardown"]').click()
    expect(page.locator('h1:has-text("Engine teardown")')).to_be_visible(timeout=15000)
    expect(page.locator('.carry-bar')).to_contain_text('limits and new-part figures copied')
    expect(page.locator('#f-spring_loss_max')).to_have_value('8')
    expect(page.locator('#f-bore_taper_max')).to_have_value('0.0005')
    expect(page.locator('#f-build')).to_have_value(build['id'])  # the latest build
    expect(cell('plug_read', '#1')).to_have_value('')  # readings aren't carried
    page.locator('#f-reason').select_option('Failure')
    page.locator('#f-engine_laps').fill('412')
    page.locator('#f-symptoms').fill('Lost oil pressure in the feature')

    # 1. visual log
    cell('plug_read', '#3').select_option('Detonation / aluminium peppering')
    cell('plug_read', '#5').select_option('Detonation / aluminium peppering')
    cell('chamber', '#3').select_option('Peppered / eroded')
    page.locator('#f-filter_nonferrous').select_option('Heavy')
    page.locator('#f-debris_source').select_option('Bearing copper layer')
    expect(page.locator('[data-testid="teardown-visual"]')).to_contain_text('detonation / aluminium peppering on #3, #5')
    expect(page.locator('[data-testid="teardown-visual"]')).to_contain_text('worn through the overlay')
    # 2. springs against the build's 250 lb seat pressure
    for c, x in seat_int.items(): cell('spring_seat_int', c).fill(x)
    vt = page.locator('[data-testid="teardown-valvetrain"]')
    expect(vt.locator('li.cmp-over')).to_contain_text('#2 (10%)')
    expect(vt.locator('li.cmp-warn')).to_contain_text('#3 (8%)')
    # 3. a bore at three depths, without a torque plate
    for k, x in bore1.items(): page.get_by_label(f'{dict(top_t="Top — thrust", top_p="Top — pin", mid_t="Middle — thrust", mid_p="Middle — pin", bot_t="Bottom — thrust", bot_p="Bottom — pin")[k]} row 1', exact=True).fill(x)
    rot = page.locator('[data-testid="teardown-rotating"]')
    expect(rot).to_contain_text('without a torque plate')
    expect(rot).to_contain_text('Bore taper over the 0.0005 limit: #1 0.0008')
    expect(rot).to_contain_text('Bore out-of-round over the 0.0004 limit: #1 0.0005')
    expect(page.locator('[data-testid="bore-map"] td.cmp-over')).to_have_count(2)
    cell('skirt', '#4').fill('4.1185')  # 0.0015 under the build's 4.1200
    expect(rot).to_contain_text('Piston skirt collapse over the 0.0010 limit: #4 0.0015')
    # 4. crack testing and deck heights
    page.get_by_label('Method row 4', exact=True).select_option('Magnaflux')
    page.get_by_label('Result row 4', exact=True).select_option('Crack found')
    for d, x in decks.items(): cell('deck_height', d).fill(x)
    ndt = page.locator('[data-testid="teardown-ndt"]')
    expect(ndt).to_contain_text('Crack found: Crank fillets (magnaflux)')
    expect(ndt).to_contain_text('Side to side 0.0015')
    page.screenshot(path=f'{OUT}/01-teardown-sheet.png', full_page=True)

    # ---- the summary: causes and suggested decisions, filled in with one press
    summ = page.locator('[data-testid="teardown-summary"]')
    expect(summ.locator('[data-testid="teardown-causes"]')).to_contain_text('Detonation')
    expect(summ.locator('[data-testid="teardown-causes"]')).to_contain_text('Oil starvation')
    sug = summ.locator('[data-testid="teardown-suggest"]')
    for line in ('Crankshaft: Replace', 'Valve springs: Replace', 'Block: Machine', 'Main bearings: Replace', 'Rod bearings: Replace', 'Pistons: Replace'):
        expect(sug).to_contain_text(line)
    page.locator('#f-root_cause').select_option('Oil starvation')
    page.locator('#f-tuning').fill('Take 2° of timing out')
    page.get_by_role('button', name='Fill in 6 suggested decisions').click()
    expect(page.get_by_label('Decision row 2', exact=True)).to_have_value('Replace')  # Crankshaft
    expect(page.get_by_label('Decision row 1', exact=True)).to_have_value('Machine')  # Block
    expect(page.get_by_label('Decision row 10', exact=True)).to_have_value('')  # Camshaft: nothing found
    expect(sug.get_by_role('button')).to_have_count(0)
    page.screenshot(path=f'{OUT}/02-summary.png')
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_url('**/engines', timeout=15000)

    td = until(lambda: next((r for r in recs() if r['type'] == 'engine_teardown' and r['data']['values'].get('reason') == 'Failure'), None), 'the teardown to sync')
    tv = td['data']['values']
    assert tv['build'] == build['id'] and tv['spring_loss_max'] == '8' and tv['engine_laps'] == '412'
    dec = {r['part']: r.get('decision') for r in tv['parts']}
    assert dec['Crankshaft'] == 'Replace' and dec['Block'] == 'Machine' and dec['Valve springs'] == 'Replace' and not dec.get('Camshaft'), dec
    assert 'Crack found' in next(r['reason'] for r in tv['parts'] if r['part'] == 'Crankshaft')

    # ---- the engine card lists it; start the rebuild sheet from it
    card = page.locator('.engine-card', has_text='Motor 51')
    expect(card.locator('[data-testid="teardown-row"]').first).to_contain_text('Oil starvation')
    expect(card.locator('[data-testid="teardown-row"]').first).to_contain_text('over a limit')
    page.goto(B + f'/r/engine_teardown/{td["id"]}')
    page.locator('[data-testid="start-rebuild"]').click()
    expect(page.locator('#f-build_type')).to_have_value('Rebuild', timeout=15000)
    expect(page.locator('#f-engine_laps')).to_have_value('412')
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_url('**/engines', timeout=15000)
    rb = until(lambda: next((r for r in recs() if r['type'] == 'engine_build' and r['data']['values'].get('build_type') == 'Rebuild'), None), 'the rebuild sheet to sync')
    assert rb['data']['values'].get('teardown') == td['id']
    page.goto(B + f'/r/engine_build/{rb["id"]}')
    bt = page.locator('[data-testid="build-teardown"]')
    expect(bt).to_contain_text('Root cause: Oil starvation', timeout=15000)
    expect(bt).to_contain_text('Crankshaft: replace')
    expect(bt).to_contain_text('Take 2° of timing out')
    page.screenshot(path=f'{OUT}/03-build-teardown.png')
    page.goto(B + f'/r/engine_teardown/{td["id"]}')
    expect(page.locator('[data-testid="teardown-rebuild"]')).to_have_count(1, timeout=15000)
    expect(page.locator('[data-testid="start-rebuild"]')).to_have_count(0)

    # ---- printouts
    page.goto(B + f'/print/teardown/{td["id"]}')
    pr = page.locator('[data-testid="teardown-print"]')
    expect(pr).to_contain_text('1. Forensic clean & visual log', timeout=15000)
    expect(pr).to_contain_text('4. Crack testing & stress mapping')
    expect(page.locator('[data-testid="teardown-print-findings"]')).to_contain_text('Crack found: Crank fillets')
    page.screenshot(path=f'{OUT}/04-print.png', full_page=True)
    page.goto(B + '/engines')
    page.locator('.engine-card', has_text='Motor 51').locator('[data-testid="blank-teardown"]').click()
    expect(pr).to_contain_text('Motor 51', timeout=15000)
    expect(page.locator('[data-testid="teardown-print-findings"]')).to_have_count(0)
    expect(pr.locator('td', has_text='Crank fillets')).to_have_count(1)

    # ---- a role that can only read engine builds sees the findings, not the buttons
    rp = open_as(RD)
    rp.goto(B + '/engines')
    expect(rp.locator('[data-testid="new-teardown"]')).to_have_count(0, timeout=15000)
    rp.goto(B + f'/r/engine_teardown/{td["id"]}')
    expect(rp.locator('[data-testid="teardown-summary"]')).to_contain_text('Crankshaft: Replace', timeout=15000)
    expect(rp.locator('[data-testid="teardown-suggest"] button')).to_have_count(0)
    expect(rp.locator('[data-testid="start-rebuild"]')).to_have_count(0)

    # ---- a phone: the sheet fits the screen
    ph = open_as(o, 390, 844)
    ph.goto(B + f'/r/engine_teardown/{td["id"]}')
    expect(ph.locator('[data-testid="teardown-summary"]')).to_be_visible(timeout=15000)
    over = ph.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    assert over <= 1, f'page scrolls sideways by {over}px'
    ph.screenshot(path=f'{OUT}/05-phone.png', full_page=True)
    br.close()

assert not errors, errors
print('e2e51 OK: teardown from the engine card, findings, causes, decisions, rebuild link, printouts, read-only, phone')
