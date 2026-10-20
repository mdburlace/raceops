import os
import json, sys, uuid, urllib.request, urllib.error
from datetime import datetime, timezone, date, timedelta
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

d = lambda n: (date.today() - timedelta(days=n)).isoformat()
now = datetime.now(timezone.utc).isoformat()
def rec(type, values, **extra):
    return {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **extra}, 'client_updated_at': now}
def push(tid, *recs):
    res = call(f'/t/{tid}/sync', OT, 'POST', {'changes': list(recs)})[1]['results']
    assert all(r['status'] == 'applied' for r in res), res
def form(tid, target):
    return next(r['id'] for r in call(f'/t/{tid}/sync?since=0', OT)[1]['records'] if r['type'] == 'form' and r['data']['target'] == target)

st, o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})
OT = o['token']
TEAM = next(m for m in o['memberships'] if m['tenant_name'] == 'Burlace Racing')['tenant_id']
st, shop = call('/admin/tenants', OT, 'POST', {'name': 'Torque Bros Engines', 'plan': 'engine_shop', 'team_type': 'engine_shop'})
SHOP = shop['id']
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]

# ---- shop records: customer, engine, a collected job, a build sheet ----
cust = rec('customer', {'name': 'Burlace Racing'}, form_id=form(SHOP, 'customer'))
cust2 = rec('customer', {'name': 'New Owner Pty Ltd'}, form_id=form(SHOP, 'customer'))
eng = rec('asset', {'name': 'TB 410 #7', 'category': 'Engine', 'status': 'In Service', 'customer': cust['id'], 'serial_number': 'TB7', 'life_unit': 'Laps', 'life_limit': '60'}, form_id=form(SHOP, 'asset'))
eng2 = rec('asset', {'name': 'TB 360 #2', 'category': 'Engine', 'status': 'In Service', 'customer': cust['id']}, form_id=form(SHOP, 'asset'))
job = rec('job', {'job_no': 'J-0001', 'customer': cust['id'], 'engine': eng['id'], 'status': 'Collected', 'job_type': 'Freshen / refresh', 'date_in': d(14), 'date_out': d(10),
                  'work_done': 'Rings, bearings, valve job', 'notes': 'SECRET internal note', 'tax_rate': '10',
                  'parts': [{'description': 'Ring set', 'qty': '1', 'unit_cost': '300', 'unit_price': '420'}], 'labour': [{'description': 'Assembly', 'hours': '5', 'rate': '120'}]}, form_id=form(SHOP, 'job'))
build = rec('engine_build', {'engine': eng['id'], 'job': job['id'], 'date': d(11), 'build_type': 'Freshen', 'stroke': '3.75', 'rod_length': '6.0', 'head_tq': '75', 'hp': '880'}, form_id=form(SHOP, 'engine_build'))
push(SHOP, cust, cust2, eng, eng2, job, build)

# ---- the team's own engine and race nights (only laps after the last service count) ----
teng = rec('asset', {'name': 'Our 410', 'category': 'Engine', 'status': 'In Service'}, form_id=form(TEAM, 'asset'))
car = rec('car', {'name': 'Link car', 'number': '3'})
ev_old = rec('event', {'name': 'Before service', 'date': d(20), 'track': 'X', 'car': car['id']})
ev_new = rec('event', {'name': 'After service', 'date': d(5), 'track': 'X', 'car': car['id']})
SF = form(TEAM, 'setup')
s_old = rec('setup', {'event': ev_old['id'], 'car': car['id'], 'session': 'Feature', 'engine': {'asset': teng['id']}, 'laps': '30', 'finish': '2', 'notes': 'PRIVATE setup note'}, form_id=SF)
s1 = rec('setup', {'event': ev_new['id'], 'car': car['id'], 'session': 'Heat 1', 'order': 10, 'engine': {'asset': teng['id']}, 'laps': '15'}, form_id=SF)
s2 = rec('setup', {'event': ev_new['id'], 'car': car['id'], 'session': 'Feature', 'order': 20, 'engine': {'asset': teng['id']}, 'laps': '20', 'finish': '1'}, form_id=SF)
push(TEAM, teng, car, ev_old, ev_new, s_old, s1, s2)

# ---- no-login engine page ----
st, r = call(f'/t/{SHOP}/engines/{eng["id"]}/share', OT, 'POST'); assert st == 200, r
TOKEN = r['token']
st, pack = call(f'/share/{TOKEN}')                        # no auth header
assert st == 200 and pack['engine']['name'] == 'TB 410 #7' and pack['owner'] == 'Burlace Racing', pack
txt = json.dumps(pack)
assert 'SECRET' not in txt and 'unit_cost' not in txt and '300' not in txt, txt   # no internal notes, no costs
assert 'totals' not in pack['jobs'][0] and 'amount' not in pack['jobs'][0]['parts'][0], pack['jobs'][0]
assert pack['builds'][0]['job_no'] == 'J-0001' and any(s['label'] == 'Head torque' for s in pack['builds'][0]['specs'])
assert pack['service']['last_service'] == d(10) and pack['service']['used'] is None
job['data']['values']['share_prices'] = True; job['client_updated_at'] = datetime.now(timezone.utc).isoformat(); push(SHOP, job)
pack = call(f'/share/{TOKEN}')[1]
assert pack['jobs'][0]['totals']['total'] == 1122.0 and pack['jobs'][0]['parts'][0]['amount'] == 420, pack['jobs'][0]
assert call('/share/not-a-token')[0] == 404

# ---- plan cap ----
plans = call('/admin/plans', OT)[1]
p = plans['plans']['engine_shop'] if 'plans' in plans else plans['engine_shop']
call('/admin/plans/engine_shop', OT, 'PUT', {**p, 'share_limit': 1})
st, r = call(f'/t/{SHOP}/engines/{eng2["id"]}/share', OT, 'POST'); assert st == 409 and 'allows 1' in r['error'], (st, r)
assert call(f'/t/{SHOP}/engines/{eng["id"]}/share', OT, 'POST')[0] == 200     # replacing the same engine's link is fine
TOKEN2 = call(f'/t/{SHOP}/engines/{eng["id"]}/sharing', OT)[1]['share']['token']
assert TOKEN2 != TOKEN and call(f'/share/{TOKEN}')[0] == 404                  # old link stops working
call('/admin/plans/engine_shop', OT, 'PUT', {**p, 'share_limit': None})

# ---- link to the team: invite, accept, laps flow back ----
st, inv = call(f'/t/{SHOP}/engines/{eng["id"]}/link', OT, 'POST'); assert st == 200 and inv['status'] == 'pending', inv
CODE = inv['code']
assert call(f'/t/{SHOP}/engine-invites/{CODE}', OT)[0] == 400                # not to yourself
st, pv = call(f'/t/{TEAM}/engine-invites/{CODE}', OT); assert st == 200 and pv['engine'] == 'TB 410 #7', pv
st, acc = call(f'/t/{TEAM}/engine-invites/{CODE}/accept', OT, 'POST', {'asset_id': teng['id']}); assert st == 200, acc
assert call(f'/t/{TEAM}/engine-invites/{CODE}/accept', OT, 'POST', {'asset_id': teng['id']})[0] == 404   # one use
sh = call(f'/t/{SHOP}/engines/{eng["id"]}/sharing', OT)[1]
assert sh['usage']['laps'] == 35 and sh['usage']['sessions'] == 2 and sh['usage']['team'] == 'Burlace Racing', sh['usage']
assert 'PRIVATE' not in json.dumps(sh)
assert call(f'/share/{TOKEN2}')[1]['service']['used'] == 35
le = call(f'/t/{TEAM}/linked-engines', OT)[1]
assert len(le) == 1 and le[0]['status'] == 'active' and le[0]['pack']['service']['used'] == 35, le
# ---- lifecycle: off by default; the team turns it on per engine ----
assert le[0]['feed_lifecycle'] is False
assert call(f'/t/{SHOP}/engine-usage', OT)[1] == {}
assert call(f'/t/{TEAM}/linked-engines/{le[0]["id"]}', OT, 'PATCH', {'feed_lifecycle': 'yes'})[0] == 400
assert call(f'/t/{SHOP}/linked-engines/{le[0]["id"]}', OT, 'PATCH', {'feed_lifecycle': True})[0] == 404   # only the team can
st, r = call(f'/t/{TEAM}/linked-engines/{le[0]["id"]}', OT, 'PATCH', {'feed_lifecycle': True}); assert st == 200 and r['feed_lifecycle'], r
u = call(f'/t/{SHOP}/engine-usage', OT)[1]
assert u[eng['id']]['laps'] == 35 and u[eng['id']]['team'] == 'Burlace Racing' and 'PRIVATE' not in json.dumps(u), u
assert any(l['feed_lifecycle'] for l in call(f'/t/{SHOP}/engines/{eng["id"]}/sharing', OT)[1]['links'])

# ---- owner changes: link page off, team link ended, team keeps a copy ----
eng['data']['values']['customer'] = cust2['id']; eng['client_updated_at'] = datetime.now(timezone.utc).isoformat(); push(SHOP, eng)
assert call(f'/share/{TOKEN2}')[0] == 404
le = call(f'/t/{TEAM}/linked-engines', OT)[1]
assert le[0]['status'] == 'ended' and le[0]['ended_reason'] == 'Engine changed owner' and le[0]['pack']['jobs'][0]['job_no'] == 'J-0001', le
sh = call(f'/t/{SHOP}/engines/{eng["id"]}/sharing', OT)[1]
assert sh['share'] is None and all(l['status'] == 'ended' for l in sh['links'])

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': SHOP}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- shop: customer access panel on the engine (now owned by New Owner) ----
    page.goto(B + f'/assets/{eng["id"]}')
    ca = page.locator('section.customer-access')
    expect(ca).to_contain_text('Was linked to Burlace Racing')
    expect(ca).to_contain_text('Engine changed owner')
    ca.locator('button:has-text("Create engine page link")').click()
    link_input = ca.locator('input[aria-label="Engine page link"]')
    expect(link_input).to_be_visible()
    share_url = link_input.input_value(); assert '/s/' in share_url
    ca.locator('button:has-text("Invite the owner’s team")').click()
    inv_url = ca.locator('input[aria-label="Team invite link"]').input_value(); assert '/link-engine/' in inv_url
    shot(page, 'p16-01-customer-access')

    # ---- the customer's page, signed out ----
    pub = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True).new_page()
    pub.on('pageerror', lambda e: errors.append(str(e)))
    pub.goto(share_url)
    expect(pub.locator('.pack h1')).to_have_text('TB 410 #7')
    expect(pub.locator('.pack')).to_contain_text('New Owner Pty Ltd')
    expect(pub.locator('.pack')).to_contain_text('Rings, bearings, valve job')
    expect(pub.locator('.pack')).to_contain_text('Head torque')
    expect(pub.locator('.pack')).not_to_contain_text('SECRET')
    w = pub.evaluate('document.documentElement.scrollWidth'); assert w <= 391, w
    shot(pub, 'p16-02-public-mobile')

    # ---- the team accepts in the app, adding a new engine record ----
    tsess = dict(sess, tenantId=TEAM)
    tp = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    tp.on('pageerror', lambda e: errors.append(str(e)))
    tp.goto(B); tp.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(tsess))})")
    tp.goto(B); expect(tp.locator('text=Synced')).to_be_visible(timeout=30000)
    tp.goto(inv_url)
    expect(tp.locator('section')).to_contain_text('Torque Bros Engines wants to link TB 410 #7')
    tp.select_option('#le-pick', '__new'); tp.fill('#le-name', 'TB 410 #7 (ours)')
    expect(tp.locator('.feed-option input')).not_to_be_checked()
    tp.locator('.feed-option input').check()
    tp.click('button:has-text("Link engine")')
    tp.wait_for_url('**/engines?linked=1')
    le_sec = tp.locator('section.linked-engines')
    expect(le_sec.locator('.list-row')).to_have_count(2)                       # the active one + the ended copy
    expect(le_sec.locator('.list-row', has_text='Linked since')).to_contain_text('TB 410 #7')
    le_sec.locator('.list-row', has_text='Link ended').click()
    expect(tp.locator('.notice')).to_contain_text('This is a copy as at')
    expect(tp.locator('.pack')).to_contain_text('J-0001')
    tp.goto(B + '/engines'); le_sec.locator('.list-row', has_text='Linked since').click()
    expect(tp.locator('.pack')).to_contain_text('Work history')
    fo = tp.locator('.feed-option input')
    expect(fo).to_be_checked()
    # shop: the engine page counts the team's laps (none yet on the new engine) and says it's on
    page.reload(); expect(ca).to_contain_text('The team counts these laps on your service tracker')
    expect(page.locator('section.card:has(h3:text-is("Lifecycle"))')).to_contain_text('From Burlace Racing')
    fo.uncheck(); expect(fo).not_to_be_checked(); tp.wait_for_timeout(500)
    page.reload(); expect(ca).to_contain_text('hasn’t chosen to count these laps')
    expect(page.locator('section.card:has(h3:text-is("Lifecycle"))')).not_to_contain_text('From Burlace Racing')
    tp.reload(); expect(tp.locator('.feed-option input')).not_to_be_checked()
    shot(tp, 'p16-03-team-linked')
    tp.once('dialog', lambda dlg: dlg.accept())
    tp.click('button:has-text("End link")'); tp.wait_for_url('**/engines')
    expect(le_sec.locator('.list-row', has_text='Linked since')).to_have_count(0)
    # the new engine record exists in the team
    tp.goto(B + '/assets?category=Engine'); expect(tp.locator('text=TB 410 #7 (ours)')).to_be_visible(timeout=15000)

    # shop sees the ended link
    page.reload(); expect(ca).to_contain_text('Ended by the team')
    br.close()

errs = [e for e in errors if 'favicon' not in e]
print('errors:', errs)
assert not errs
print('E2E16 OK')
