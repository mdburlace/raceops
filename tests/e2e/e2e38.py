# Workshop setup sheets: each car's shop-floor setup (In the Workshop → Workshop setups), linked to an event as
# its baseline, and At the Track setup sheets starting from it (front/rear fields merged into the four corners).
import json, os, sys, time, urllib.request, urllib.error, uuid
from datetime import datetime, timezone
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

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Workshop Racing', 'plan': 'pro', 'practice': True}); TID = t['id']
o = login(); OT = o['token']
recs = lambda tok=OT: [r for r in call(f'/t/{TID}/sync?since=0', tok)[1]['records'] if not r['global'] and not r['deleted']]
R = recs()
by = lambda type, **kw: [r for r in R if r['type'] == type and all(r['data']['values'].get(k) == x for k, x in kw.items())]
car17 = by('car', name='Car 17')[0]; car71 = by('car', name='Car 71')[0]
shop = by('shop_setup', name='Lakeside baseline')[0]
rd9 = by('event', round='9')[0]
tonight = by('event', name='Valley Speedway — Club night')[0]
assert rd9['data']['values']['shop_setup'] == shop['id'], 'round 9 is linked to the workshop setup'
bars = {r['data']['values']['position']: r['id'] for r in by('asset', category='Torsion Bar') if r['data']['values'].get('position') in ('LF', 'RF', 'LR', 'RR')}

# rights: a mechanic can make and edit workshop setups, a driver can't
roles = call(f'/t/{TID}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
def member(email, role):
    r = next(x for x in roles if x['name'] == role)
    st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': email, 'role_id': r['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
    assert call(f'/invites/{tok}/accept', method='POST', body={'name': email.split('@')[0], 'password': 'password38'})[0] == 200
    return login(email, 'password38')['token']
MT = member('mech38@test.com', 'Mechanic'); DT = member('drv38@test.com', 'Driver / Viewer')
new = lambda tok, vals: call(f'/t/{TID}/sync', tok, 'POST', {'changes': [{'id': str(uuid.uuid4()), 'type': 'shop_setup', 'data': {'values': vals}, 'client_updated_at': now()}]})[1]['results'][0]['status']
assert new(MT, {'car': car71['id'], 'name': 'Car 71 shop setup'}) == 'applied'
assert new(DT, {'car': car71['id'], 'name': 'Nope'}) == 'denied'
assert not any(r['type'] == 'shop_setup' for r in recs(DT)), 'drivers don’t see workshop setups'

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    s = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    shot = lambda n: page.screenshot(path=f'{OUT}/{n}.png', full_page=True)

    # ---- In the Workshop → Workshop setups
    page.click('.sidebar .nav-link[href="/workshop/setups"]')
    expect(page.locator('h1')).to_have_text('Workshop setups')
    row = page.locator('[data-testid="shop-setup-row"]:has-text("Lakeside baseline")')
    expect(row).to_contain_text('1 event')
    expect(page.locator('[data-testid="shop-setup-row"]:has-text("Car 71 shop setup")')).to_be_visible()
    shot('38-01-list')
    row.click()
    expect(page.locator('#f-arm_length-RF')).to_have_value('13.5')
    expect(page.locator('#f-block_heights-RR')).to_have_value('4.75')
    expect(page.locator('#f-temp')).to_have_count(0)        # no weather
    expect(page.locator('#f-pressure_hot-RR')).to_have_count(0)  # nothing measured after a session
    expect(page.locator('[data-testid="shop-linked-events"]')).to_contain_text('Lakeside Raceway')
    shot('38-02-sheet')

    # ---- a new workshop setup for Car 17 starts from the car's latest; link it to tonight's event
    page.goto(B + '/workshop/setups')
    page.locator('section:has-text("Car 17") a:has-text("New workshop setup")').click()
    expect(page.locator('.carry-bar')).to_contain_text('Lakeside baseline')
    expect(page.locator('#f-arm_length-RF')).to_have_value('13.5')   # copied
    page.fill('#f-name', 'Valley tacky')
    page.fill('#f-front_ride_height-LF', '9')
    page.fill('#f-wing_angle', '14')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.locator('[data-testid="shop-setup-row"]:has-text("Valley tacky")')).to_contain_text('Not linked')
    page.locator('[data-testid="shop-setup-row"]:has-text("Valley tacky")').click()
    page.get_by_label('Event to link').select_option(label=page.locator('[aria-label="Event to link"] option', has_text='Valley Speedway — Club night').first.inner_text())
    page.locator('[data-testid="shop-link-event"] button:has-text("Link")').click()
    expect(page.locator('.notice:has-text("Linked to Valley Speedway — Club night")')).to_be_visible()
    expect(page.locator('[data-testid="shop-linked-events"]')).to_contain_text('Valley Speedway')
    page.wait_for_timeout(1500)
    tn = next(r for r in recs() if r['id'] == tonight['id'])
    valley = next(r for r in recs() if r['type'] == 'shop_setup' and r['data']['values'].get('name') == 'Valley tacky')
    assert tn['data']['values']['shop_setup'] == valley['id']
    page.goto(B + f"/events/{tonight['id']}")
    expect(page.locator('[data-testid="event-shop-setup"]')).to_contain_text('Valley tacky')

    # ---- the event form only offers the event car's workshop setups
    page.goto(B + f"/r/event/{rd9['id']}")
    expect(page.locator('#f-shop_setup option', has_text='Lakeside baseline')).to_have_count(1)
    opts = page.locator('#f-shop_setup option').all_inner_texts()
    assert any('Lakeside baseline' in x for x in opts) and not any('Car 71 shop setup' in x for x in opts), opts

    # ---- round 9: a new sheet starts from the event's workshop setup
    page.goto(B + f"/events/{rd9['id']}")
    expect(page.locator('[data-testid="event-shop-setup"]')).to_contain_text('Lakeside baseline')
    page.locator('button:has-text("Start from workshop setup")').click()
    expect(page.locator('text=workshop setup “Lakeside baseline”').first).to_be_visible(timeout=15000)
    expect(page.locator('#f-ride_height-LF')).to_have_value('9.25')
    expect(page.locator('#f-ride_height-RR')).to_have_value('4.75')
    expect(page.locator('#f-blocked-RF')).to_have_value('1')
    expect(page.locator('#f-pressure_cold-RR')).to_have_value('17')
    expect(page.locator('#f-stagger_cold')).to_have_value('6')
    expect(page.locator('#f-wing_angle')).to_have_value('12')
    shot('38-03-track-sheet')
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(1500)
    sheet = [r for r in recs() if r['type'] == 'setup' and r['data']['values'].get('event') == rd9['id']]
    assert len(sheet) == 1, sheet
    sv = sheet[0]['data']['values']
    assert {c: x['asset'] for c, x in sv['bars'].items()} == bars, (sv['bars'], bars)
    assert set(sv['shocks']) == {'LF', 'RF', 'LR', 'RR'} and sv['shock_adjust']['RR'].startswith('LS comp 3')
    assert sv['copied_from'] == shop['id']
    for k in ('arm_length', 'block_heights', 'caster', 'jacobs_ladder', 'fuel_load', 'name'):
        assert k not in sv, k

    # ---- the next session: the chooser offers the workshop setup (this event's) alongside copying a session
    page.goto(B + f"/events/{rd9['id']}")
    page.select_option('.add-session select', 'Heat 1')
    page.click('.add-session button:has-text("Add session")')
    opt = page.locator('[data-testid="start-shop"]')
    expect(opt).to_be_visible()
    expect(opt.get_by_label('Workshop setup')).to_contain_text('Lakeside baseline (this event’s)')
    shot('38-04-start-from')
    opt.locator('button:has-text("Use workshop setup")').click()
    expect(page.locator('#f-ride_height-LR')).to_have_value('4.5')
    br.close()

assert not errors, errors
print('E2E38 OK')
