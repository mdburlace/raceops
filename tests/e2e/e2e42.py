# Team roles and the Business area: the new built-in roles and Add standard roles, more than one role per
# member, part rights on setup sheets (driver's debrief, car chief's change list) enforced by the server,
# costs hidden from roles without "See costs, prices and amounts", parts order approval, the crew list and
# race-night card, reminders, finance (event P&L, budget, export), transport (load list from the event and a
# template), partnerships (deliverables, hospitality check-in, the sponsor portal), marketing (results post),
# and region & currency.
import json, os, sys, uuid, urllib.request, urllib.error
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
errors = []

def call(path, token=None, method='GET', body=None, raw=False):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); data = r.read()
        return r.status, (data.decode() if raw else json.loads(data or b'{}'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
login = lambda e='owner@test.com', p='password1': call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
now = lambda: datetime.now(timezone.utc).isoformat()

o = login(); OT = o['token']
call('/admin/ai', OT, 'PUT', {'enabled': True})
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Business Racing', 'plan': 'pro', 'practice': True}); assert st == 200, t; TID = t['id']
o = login(); OT = o['token']

# ---- built-in roles, and Add standard roles
roles = lambda: call(f'/t/{TID}/roles', OT)[1]
names = [r['name'] for r in roles()]
for n in ['Crew Chief', 'Car Chief', 'Mechanic', 'Tire Specialist', 'Driver', 'Viewer', 'Transport', 'Business Manager', 'Partnerships Manager', 'Marketing Manager']:
    assert n in names, (n, names)
cc = next(r for r in roles() if r['name'] == 'Car Chief')
assert call(f'/t/{TID}/roles/{cc["id"]}', OT, 'DELETE')[0] == 200
st, added = call(f'/t/{TID}/roles/standard', OT, 'POST'); assert added['added'] == ['Car Chief'], added
assert call(f'/t/{TID}/roles/standard', OT, 'POST')[1]['added'] == []

def member(email, role):
    r = next(x for x in roles() if x['name'] == role)
    st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': email, 'role_id': r['id']})
    assert call(f'/invites/{inv["token"]}/accept', method='POST', body={'name': email.split('@')[0].title(), 'password': 'password42'})[0] == 200
    return login(email, 'password42')
DRV = member('driver42@test.com', 'Driver'); CAR = member('carchief42@test.com', 'Car Chief'); MEC = member('mech42@test.com', 'Mechanic')

recs = lambda tok=OT: [r for r in call(f'/t/{TID}/sync?since=0', tok)[1]['records'] if not r['global'] and not r['deleted']]
R = recs()
by = lambda type, **kw: [r for r in R if r['type'] == type and all(r['data']['values'].get(k) == x for k, x in kw.items())]
tonight = by('event', name='Valley Speedway — Club night')[0]
heat1 = [r for r in by('setup', session='Heat 1') if r['data']['values']['event'] == tonight['id']][0]
order = by('purchase', item='RR shock rebuild kit')[0]
sponsor = by('sponsor', name='Valley Tyres')[0]
push = lambda tok, rec, vals, **kw: call(f'/t/{TID}/sync', tok, 'POST', {'changes': [{'id': rec['id'] if rec else str(uuid.uuid4()), 'type': kw.get('type') or rec['type'],
    'data': {**(rec['data'] if rec else {}), 'values': vals}, 'client_updated_at': now()}]})[1]['results'][0]

# ---- part rights: the driver changes only the debrief; the rest of the sheet stays as it was
hv = heat1['data']['values']
res = push(DRV['token'], heat1, {**hv, 'driver_comments': 'Loose in 2, tight in 4', 'stagger_cold': '9'})
assert res['status'] == 'applied', res
assert res['record']['data']['values']['driver_comments'] == 'Loose in 2, tight in 4'
assert res['record']['data']['values']['stagger_cold'] == hv['stagger_cold'], 'the driver can’t change the stagger'
assert push(DRV['token'], None, {'event': tonight['id'], 'session': 'Feature'}, type='setup')['status'] == 'denied', 'no new sheets for a driver'
# the car chief ticks the change list, and nothing else
hv = [r for r in recs() if r['id'] == heat1['id']][0]['data']['values']
res = push(OT, heat1, {**hv, 'change_list': [{'change': 'RR rebound', 'was': '9', 'now': '8'}]}); assert res['status'] == 'applied'
hv = res['record']['data']['values']
res = push(CAR['token'], heat1, {**hv, 'change_list': [{'change': 'RR rebound', 'was': '9', 'now': '8', 'done': True, 'done_by': CAR['user']['id']}], 'wing_angle': '20'})
assert res['status'] == 'applied' and res['record']['data']['values']['change_list'][0]['done'] is True
assert res['record']['data']['values']['wing_angle'] == hv['wing_angle']

# ---- costs hidden, and approval only for those who can approve
mo = [r for r in recs(MEC['token']) if r['id'] == order['id']][0]
assert 'cost' not in mo['data']['values'] and 'unit_cost' not in mo['data']['values'], 'a mechanic doesn’t get the cost'
res = push(MEC['token'], mo, {**mo['data']['values'], 'notes': 'Urgent', 'cost': '1'}); assert res['status'] == 'applied'
assert 'cost' not in res['record']['data']['values']
assert [r for r in recs() if r['id'] == order['id']][0]['data']['values']['cost'] == '180', 'the stored cost is kept'
assert push(MEC['token'], mo, {**mo['data']['values'], 'status': 'Approved'})['status'] == 'denied'
hist = call(f'/t/{TID}/records/{order["id"]}/history', MEC['token'])[1]
assert all('cost' not in (h['data'].get('values') or {}) for h in hist)
assert not any(r['type'] == 'expense' for r in recs(MEC['token'])), 'no finance for a mechanic'

# ---- more than one role: the mechanic also does the tyres
mems = call(f'/t/{TID}/members', OT)[1]
mech = next(m for m in mems if m['email'] == 'mech42@test.com')
tyre = next(r for r in roles() if r['name'] == 'Tire Specialist')
assert call(f'/t/{TID}/members/{mech["id"]}', OT, 'PATCH', {'extra_role_ids': [tyre['id']]})[0] == 200
m = next(x for x in login('mech42@test.com', 'password42')['memberships'] if x['tenant_id'] == TID)
assert 'setups.part.tires' in m['role']['permissions'] and 'Tire Specialist' in m['role']['name'], m['role']
owner_role = next(r for r in roles() if r['name'] == 'Owner')
assert call(f'/t/{TID}/members/{mech["id"]}', OT, 'PATCH', {'extra_role_ids': [owner_role['id']]})[0] == 400

# ---- the sponsor portal shows no amounts
st, p = call(f'/t/{TID}/sponsors/{sponsor["id"]}/portal', OT, 'POST'); assert st == 200, p
token = p['portal']['token']
st, view = call(f'/public/sponsor/{token}'); assert st == 200, view
assert view['sponsor']['name'] == 'Valley Tyres' and '12000' not in json.dumps(view)
assert any(d['kind'] == 'Hospitality passes' for d in view['deliverables'])
assert call(f'/t/{TID}/sponsors/{sponsor["id"]}/portal', MEC['token'])[0] == 403

# ---- AI results post (mock)
st, post = call(f'/t/{TID}/ai/post', OT, 'POST', {'event': by('event', round='8')[0]['id'], 'sponsors': [sponsor['id']]})
assert st == 200 and 'Valley Tyres' in post['text'], post

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    def session(lg):
        s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': TID}
        # let the open page finish its own session refresh first, so it can't write the old session back
        page.goto(B); page.wait_for_load_state('networkidle'); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    shot = lambda n: page.screenshot(path=f'{OUT}/{n}.png', full_page=True)
    session(login())

    # ---- Home: reminders
    rem = page.locator('.reminders-card')
    expect(rem).to_contain_text('Tyres: 90% of budget spent')
    shot('42-01-home')
    page.goto(B + '/reminders')
    for t in ['Hauler: registration', 'Team T-shirt', 'Valley Tyres: deal renewal', 'Pat Driver']:
        expect(page.locator('[data-testid="reminder"]', has_text=t).first).to_be_visible()

    # ---- crew list → race-night card
    page.goto(B + f'/r/event/{tonight["id"]}')
    sec = page.locator('#sec-crew')
    sec.get_by_role('button', name='+ Row').click()
    sec.locator('select[aria-label^="Who row 1"]').select_option(label='Mark')
    sec.locator('input[aria-label^="Role row 1"]').fill('Car chief')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.locator('[data-testid="event-business"]')).to_contain_text('Car chief')
    expect(page.locator('[data-testid="event-pnl"]')).to_be_visible()
    shot('42-02-event')
    page.goto(B + '/')
    expect(page.locator('[data-testid="race-night-role"]')).to_contain_text('Car chief')
    expect(page.locator('.race-night a:has-text("Change list")')).to_be_visible()

    # ---- parts orders: approve
    page.goto(B + '/purchases')
    row = page.locator('[data-testid="purchase-row"]', has_text='RR shock rebuild kit')
    expect(row).to_contain_text('$180')
    row.get_by_role('button', name='Approve').click()
    page.get_by_role('button', name='Approved').click()
    expect(page.locator('[data-testid="purchase-row"]', has_text='RR shock rebuild kit')).to_contain_text('Approved')
    shot('42-03-orders')

    # ---- finance: budget, event P&L, export
    page.goto(B + '/finance?tab=budget')
    expect(page.locator('[data-testid="budget-table"] tr', has_text='Tyres')).to_contain_text('90%')
    page.goto(B + '/finance?tab=events')
    page.locator('.list-row', has_text='Hilltop Oval').first.click()
    expect(page.locator('[data-testid="pnl-table"]')).to_contain_text('Prize money')
    expect(page.locator('[data-testid="pnl-table"]')).to_contain_text('Tyres')
    shot('42-04-pnl')
    page.goto(B + '/finance?tab=export')
    page.locator('[data-testid="connector"]').select_option('xero')
    with page.expect_download() as dl:
        page.get_by_role('button', name='Download').click()
    text = open(dl.value.path()).read()
    assert text.startswith('*ContactName') and 'GST on Expenses' in text and 'Hoosier Tyres QLD' in text, text[:300]
    expect(page.locator('.notice', has_text='marked as exported')).to_be_visible()

    # ---- transport: a load list from round 9 and the template
    page.goto(B + '/r/load_list/new')
    page.locator('#f-event').select_option(label='Lakeside Raceway — Club Championship')
    page.locator('[data-testid="load-tools"] select').select_option(label='Sprint car race weekend')
    page.locator('[data-testid="load-tools"] button').click()
    expect(page.locator('#sec-items input[aria-label^="Item row"]')).to_have_count(9)  # the car, its engine, the spare engine and 6 template items
    page.locator('#sec-items input[type=checkbox][aria-label^="Loaded row 1"]').check()
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.locator('[data-testid="load-row"]', has_text='Lakeside')).to_contain_text('1 loaded')
    shot('42-05-load')

    # ---- partnerships: check a guest in, deliverables count it
    page.goto(B + f'/partners?tab=guests&event={tonight["id"]}')
    page.locator('[data-testid="guest-row"]', has_text='Chris Lee').get_by_role('button', name='Check in').click()
    expect(page.locator('[data-testid="guest-row"]', has_text='Chris Lee')).to_contain_text('Checked in')
    page.goto(B + f'/partners/sponsors/{sponsor["id"]}')
    expect(page.locator('[data-testid="deliverables"] tr', has_text='Hospitality passes')).to_contain_text('2 / 4')
    shot('42-06-sponsor')
    page.goto(B + f'/sp/{token}')
    expect(page.locator('[data-testid="sponsor-portal"]')).to_contain_text('Valley Tyres')

    # ---- marketing: draft a post from the result and approve it
    session(login())
    page.goto(B + '/r/social_post/new')
    page.locator('#f-event').select_option(label=by('event', round='8')[0]['data']['values']['name'])
    page.locator('[data-testid="post-tools"]').get_by_role('button', name='Draft from result').click()
    expect(page.locator('#f-text')).to_have_value(__import__('re').compile('Feature: P'))
    page.locator('[data-testid="post-tools"]').get_by_role('button', name='Approve').click()
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.locator('[data-testid="post-row"]').first).to_contain_text('Approved')

    # ---- region: the US gives CDL licence classes
    page.goto(B + '/team/members')
    page.locator('#rg-region').select_option('US')
    page.get_by_role('button', name='Save region & currency').click()
    expect(page.locator('text=Saved.')).to_be_visible()
    page.goto(B + '/r/licence/new')
    expect(page.locator('#dl-class option').first).to_have_attribute('value', 'Class D (car)')  # the region's classes come first

    # ---- the driver: only the debrief is open
    session(DRV)
    page.goto(B + f'/r/setup/{heat1["id"]}')
    expect(page.locator('[data-testid="part-notice"]')).to_contain_text('Track conditions & car feedback')
    expect(page.locator('#f-stagger_cold')).to_have_count(0)
    expect(page.locator('#f-driver_comments')).to_be_editable()
    shot('42-07-driver')
    # ---- the mechanic: no cost on a parts order
    session(login('mech42@test.com', 'password42'))
    page.goto(B + f'/r/purchase/{order["id"]}')
    expect(page.locator('#f-item')).to_be_visible()
    expect(page.locator('#f-cost')).to_have_count(0)
    br.close()

if errors: print('\n'.join(errors)); raise SystemExit('page errors')
print('E2E42 OK')
