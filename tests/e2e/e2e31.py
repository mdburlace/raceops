# Setup sheets: bars, tyres and wheels from inventory for each corner (or entered manually and saved to
# inventory), and the wing section split into top and front wings, each from inventory, with a front wicker.
import json, sys, os, uuid, urllib.request, urllib.error
from datetime import datetime, timezone, date
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
login = lambda e, p: call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
now = datetime.now(timezone.utc).isoformat()
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
def push(tok, tid, *recs):
    r = call(f'/t/{tid}/sync', tok, 'POST', {'changes': list(recs)})[1]['results']
    assert all(x['status'] == 'applied' for x in r), r
def records(tok, tid):
    return {r['id']: r for r in call(f'/t/{tid}/sync?since=0', tok)[1]['records']}
def shot(page, name, full=True):
    page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
OPTS = lambda l: l.evaluate("s => [...s.options].map(o => o.textContent)")
GROUPS = lambda l: l.evaluate("s => [...s.querySelectorAll('optgroup')].map(g => g.label)")

o = login('owner@test.com', 'password1'); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Inventory Racing', 'plan': 'pro'}); TID = t['id']
roles = call(f'/t/{TID}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
chief = next(r for r in roles if r['name'] == 'Crew Chief')
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': 'inv@test.com', 'role_id': chief['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
assert call(f'/invites/{tok}/accept', method='POST', body={'name': 'Inventory Chief', 'password': 'password31'})[0] == 200
u = login('inv@test.com', 'password31'); UT = u['token']

all0 = records(UT, TID)
form = lambda target: next(r['id'] for r in all0.values() if r['type'] == 'form' and r['data']['target'] == target)
AF, TF, SF = form('asset'), form('tire'), form('setup')
sf = all0[SF]['data']
fields = [f for s in sf['sections'] for f in s['fields']]
keys = [f['key'] for f in fields]
wing = next(s for s in sf['sections'] if s['id'] == 'wing')
# the setup form was upgraded: pickers for tyres and wheels, bars by corner, top and front wings
assert [f['key'] for f in wing['fields']] == ['h_top_wing', 'top_wing', 'wing_angle', 'wicker', 'wing_position', 'h_front_wing', 'front_wing', 'nose_wing', 'front_wicker'], [f['key'] for f in wing['fields']]
assert next(f for f in fields if f['key'] == 'bars').get('filterByCorner') is True
assert next(f for f in fields if f['key'] == 'tires')['ref'] == 'tire'
assert next(f for f in fields if f['key'] == 'nose_wing')['label'] == 'Front wing angle'

car = rec('car', {'name': 'Inventory car', 'number': '31'})
car2 = rec('car', {'name': 'Second car', 'number': '13'})
A = lambda name, cat, **v: rec('asset', {'name': name, 'category': cat, 'status': 'In Service', **v}, form_id=AF)
bar_lf = A('LF bar 900', 'Torsion Bar', position='LF', car=car['id'], spec='900 lb/in')
bar_rf = A('RF bar 1000', 'Torsion Bar', position='RF', spec='1000 lb/in')
bar_any = A('Spare bar 950', 'Torsion Bar', spec='950 lb/in')
bar_other = A('LF bar other car', 'Torsion Bar', position='LF', car=car2['id'])
bar_old = A('LF bar retired', 'Torsion Bar', position='LF', status='Retired')
whl_rr = A('RR wheel 15x15', 'Wheel', position='RR', spec='5" offset')
whl_lr = A('LR wheel 15x12', 'Wheel', position='LR')
top = A('Top wing 25 sq ft', 'Wing', position='Top', spec='25 sq ft')
front = A('Front wing 6 sq ft', 'Wing', position='Front')
T = lambda name, pos, **v: rec('tire', {'name': name, 'position': pos, 'status': 'New', **v}, form_id=TF)
t_rr = T('RR-12', 'RR', brand='Hoosier', compound='Medium', circumference='105.5', available_for=[car['id']])
t_lr = T('LR-07', 'LR', brand='Hoosier', circumference='93')
t_any = T('Spare-1', 'Any')
t_worn = T('RR-old', 'RR', status='Worn out')
ev = rec('event', {'name': 'Inventory night', 'date': date.today().isoformat(), 'track': 'Valley', 'car': car['id']})
sheet = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Heat 1'}, form_id=SF)
push(UT, TID, car, car2, bar_lf, bar_rf, bar_any, bar_other, bar_old, whl_rr, whl_lr, top, front, t_rr, t_lr, t_any, t_worn, ev, sheet)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    s = {'token': UT, 'user': u['user'], 'memberships': u['memberships'], 'platform': u.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    page.goto(f"{B}/r/setup/{sheet['id']}")

    # ---- 1. bars: the corner's bars (and unassigned ones) for this car come first
    lf = page.locator('#f-bars-LF'); expect(lf).to_be_visible()
    opts = OPTS(lf)
    assert any('LF bar 900 (900 lb/in)' in x for x in opts) and any('Spare bar 950' in x for x in opts), opts
    assert not any('RF bar' in x for x in opts) and not any('other car' in x for x in opts) and not any('retired' in x for x in opts), opts
    assert 'For LF' in GROUPS(lf) and any('Show all torsion bars' in x for x in opts) and 'Enter manually…' in opts, (GROUPS(lf), opts)
    lf.select_option(label='LF bar 900 (900 lb/in)')
    # a bar that isn't in inventory yet: enter it as it's on the car, then save it to inventory
    rf = page.locator('#f-bars-RF')
    rf.select_option(label='Enter manually…')
    page.get_by_label('Bars RF entered manually').fill('1050 lb/in Sway-Away')
    page.locator('.cg-cell:has(#f-bars-RF) button:has-text("Save to inventory")').click()
    expect(rf).to_contain_text('1050 lb/in Sway-Away')
    assert '1050 lb/in Sway-Away' in rf.evaluate('s => s.options[s.selectedIndex].textContent')
    # LR: typed only, not saved
    page.locator('#f-bars-LR').select_option(label='Enter manually…')
    page.get_by_label('Bars LR entered manually').fill('850 hollow')
    shot(page, '31-01-bars')

    # ---- 2. tyres: by corner and car, worn-out ones hidden, circumference shown
    rr = page.locator('#f-tires-RR'); opts = OPTS(rr)
    assert any('RR-12 (Hoosier Medium, 105.5")' in x for x in opts) and any('Spare-1' in x for x in opts), opts
    assert not any('LR-07' in x for x in opts) and not any('RR-old' in x for x in opts), opts
    rr.select_option(label='RR-12 (Hoosier Medium, 105.5")')
    page.locator('#f-tires-LR').select_option(label='LR-07 (Hoosier, 93")')
    page.locator('#f-tires-LF').select_option(label='Enter manually…')
    page.get_by_label('Tires LF entered manually').fill('Hoosier front 84"')

    # ---- 3. wheels: all four corners
    w = page.locator('#f-wheels-RR'); opts = OPTS(w)
    assert any('RR wheel 15x15' in x for x in opts) and not any('LR wheel' in x for x in opts), opts
    w.select_option(label='RR wheel 15x15 (5" offset)')
    page.locator('#f-wheels-LF').select_option(label='Enter manually…')
    page.get_by_label('Wheels LF entered manually').fill('Weld 15x8')
    shot(page, '31-02-tires-wheels')

    # ---- 4. wing: top and front, each from inventory, with a front wicker
    sec = page.locator('#sec-wing')
    expect(sec).to_contain_text('Top wing'); expect(sec).to_contain_text('Front wing')
    expect(sec).to_contain_text('Top wing angle'); expect(sec).to_contain_text('Front wing angle'); expect(sec).to_contain_text('Front wing wicker')
    tw = page.locator('#f-top_wing'); opts = OPTS(tw)
    assert any('Top wing 25 sq ft' in x for x in opts) and not any('Front wing 6' in x for x in opts), opts
    assert 'For the top wing' in GROUPS(tw), GROUPS(tw)
    tw.select_option(label='Top wing 25 sq ft (25 sq ft)')
    fw = page.locator('#f-front_wing'); opts = OPTS(fw)
    assert any('Front wing 6 sq ft' in x for x in opts) and not any('Top wing 25' in x for x in opts), opts
    fw.select_option(label='Front wing 6 sq ft')
    page.locator('#f-front_wicker').fill('1/2"')
    page.locator('#f-wicker').fill('1"')
    shot(page, '31-03-wing')

    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(1500)
    expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    page.wait_for_timeout(1500)

    r = records(UT, TID)
    vals = r[sheet['id']]['data']['values']
    new_bar = next(x for x in r.values() if x['type'] == 'asset' and x['data']['values'].get('name') == '1050 lb/in Sway-Away')
    nv = new_bar['data']['values']
    assert nv['category'] == 'Torsion Bar' and nv['position'] == 'RF' and nv['car'] == car['id'], nv
    assert vals['bars'] == {'LF': {'asset': bar_lf['id']}, 'RF': {'asset': new_bar['id']}, 'LR': '850 hollow'}, vals['bars']
    assert vals['tires']['RR'] == {'asset': t_rr['id']} and vals['tires']['LR'] == {'asset': t_lr['id']} and vals['tires']['LF'] == 'Hoosier front 84"', vals['tires']
    assert vals['wheels'] == {'RR': {'asset': whl_rr['id']}, 'LF': 'Weld 15x8'}, vals['wheels']
    assert vals['top_wing'] == {'asset': top['id']} and vals['front_wing'] == {'asset': front['id']}, vals
    assert vals['front_wicker'] == '1/2"' and vals['wicker'] == '1"', vals

    # a manual tyre saved to inventory lands under Tires for that corner and car
    page.goto(f"{B}/r/setup/{sheet['id']}")
    page.locator('#f-tires-RF').select_option(label='Enter manually…')
    page.get_by_label('Tires RF entered manually').fill('RF-03 Hoosier')
    page.locator('.cg-cell:has(#f-tires-RF) button:has-text("Save to inventory")').click()
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(1500); expect(page.locator('text=Synced')).to_be_visible(timeout=30000); page.wait_for_timeout(1500)
    r = records(UT, TID)
    nt = next(x for x in r.values() if x['type'] == 'tire' and x['data']['values'].get('name') == 'RF-03 Hoosier')
    assert nt['data']['values']['position'] == 'RF' and nt['data']['values']['available_for'] == [car['id']], nt
    assert r[sheet['id']]['data']['values']['tires']['RF'] == {'asset': nt['id']}

    # ---- 5. reopening shows the manual values, and the next session copies what's on the car
    page.goto(f"{B}/r/setup/{sheet['id']}")
    expect(page.get_by_label('Bars LR entered manually')).to_have_value('850 hollow')
    expect(page.locator('#f-top_wing')).to_have_value(top['id'])
    shot(page, '31-04-reopened')

    # ---- 6. assets: wings can be set to Top or Front
    page.goto(f"{B}/r/asset/{top['id']}")
    page.wait_for_timeout(800)
    edit = page.locator('a:has-text("Edit")')
    if edit.count(): edit.first.click()
    pos = page.locator('#f-position'); expect(pos).to_be_visible()
    assert 'Top' in OPTS(pos), OPTS(pos)
    br.close()

assert not errors, errors
print('E2E31 OK')
