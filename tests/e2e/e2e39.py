# Engine tunes and workshop engine checks: each engine's tune sheet in versions (one active), the jetting for the
# weather on a setup sheet, the tune on a workshop setup, engine checks compared with the tune and the last check,
# printing both, and an engine builder sharing a tune that the owner's team copies into its own tunes.
import json, os, sys, time, urllib.request, urllib.error, uuid
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
login = lambda e='owner@test.com', p='password1': call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
now = lambda: datetime.now(timezone.utc).isoformat()
d = lambda n: (date.today() - timedelta(days=n)).isoformat()

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Tune Racing', 'plan': 'pro', 'practice': True}); TID = t['id']
st, shopT = call('/admin/tenants', OT, 'POST', {'name': 'Hart Tune Shop', 'plan': 'engine_shop', 'team_type': 'engine_shop'}); SHOP = shopT['id']
o = login(); OT = o['token']
def recs(tid=TID, tok=OT): return [r for r in call(f'/t/{tid}/sync?since=0', tok)[1]['records'] if not r['global'] and not r['deleted']]
R = recs()
by = lambda type, rs=None, **kw: [r for r in (rs or R) if r['type'] == type and all(r['data']['values'].get(k) == x for k, x in kw.items())]
eng = by('asset', name='410 #3')[0]; eng2 = by('asset', name='410 #2')[0]
v1 = by('engine_tune', name='2026 v1')[0]; v2 = by('engine_tune', name='2026 v2')[0]
assert v2['data']['values']['active'] and not v1['data']['values']['active'], 'the newer practice tune is the active one'
assert by('shop_setup', name='Lakeside baseline')[0]['data']['values']['engine_tune'] == v2['id']
assert len(by('engine_check', engine=eng['id'])) == 2

# rights: a mechanic does engine checks and edits tunes; a driver reads tunes (for the jetting) but not checks
roles = call(f'/t/{TID}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
def member(email, role):
    r = next(x for x in roles if x['name'] == role)
    st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': email, 'role_id': r['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
    assert call(f'/invites/{tok}/accept', method='POST', body={'name': email.split('@')[0], 'password': 'password39'})[0] == 200
    return login(email, 'password39')['token']
MT = member('mech39@test.com', 'Mechanic'); DT = member('drv39@test.com', 'Viewer')
new = lambda tok, type, vals: call(f'/t/{TID}/sync', tok, 'POST', {'changes': [{'id': str(uuid.uuid4()), 'type': type, 'data': {'values': vals}, 'client_updated_at': now()}]})[1]['results'][0]['status']
assert new(MT, 'engine_check', {'engine': eng2['id'], 'date': d(1)}) == 'applied'
assert new(MT, 'engine_tune', {'engine': eng2['id'], 'name': 'Mech tune', 'active': False}) == 'applied'
assert new(DT, 'engine_tune', {'engine': eng2['id'], 'name': 'Nope'}) == 'denied'
assert new(DT, 'engine_check', {'engine': eng2['id'], 'date': d(1)}) == 'denied'
DR = recs(TID, DT)
assert any(r['type'] == 'engine_tune' for r in DR) and not any(r['type'] == 'engine_check' for r in DR), 'drivers read tunes, not engine checks'

# ---- the engine shop: a customer engine with a shared tune and a private one, linked to the team's 410 #2
def rec(tid, type, values):
    f = next(r['id'] for r in call(f'/t/{tid}/sync?since=0', OT)[1]['records'] if r['type'] == 'form' and r['data']['target'] == type)
    return {'id': str(uuid.uuid4()), 'type': type, 'data': {'form_id': f, 'values': values}, 'client_updated_at': now()}
cust = rec(SHOP, 'customer', {'name': 'Tune Racing'})
seng = rec(SHOP, 'asset', {'name': 'HTS 410 #9', 'category': 'Engine', 'status': 'In Service', 'customer': cust['id']})
stune = rec(SHOP, 'engine_tune', {'engine': seng['id'], 'name': 'Shop tune A', 'date': d(3), 'active': True, 'shared': True, 'source': 'Our team', 'fuel_by': 'ADR %',
                                  'fuel_chart': [{'from': '90', 'to': '95', 'main': '71', 'hs_psi': '109', 'hs': '70'}], 'plugs': 'NGK R7', 'plug_gap': '0.022', 'timing': '32°'})
ptune = rec(SHOP, 'engine_tune', {'engine': seng['id'], 'name': 'Private dyno tune', 'date': d(2), 'active': False, 'shared': False})
res = call(f'/t/{SHOP}/sync', OT, 'POST', {'changes': [cust, seng, stune, ptune]})[1]['results']
assert all(x['status'] == 'applied' for x in res), res
st, share = call(f'/t/{SHOP}/engines/{seng["id"]}/share', OT, 'POST'); assert st == 200, share
st, pack = call(f'/share/{share["token"]}')
assert [x['name'] for x in pack['tunes']] == ['Shop tune A'], 'only shared tunes reach the owner'
st, inv = call(f'/t/{SHOP}/engines/{seng["id"]}/link', OT, 'POST'); assert st == 200
st, acc = call(f'/t/{TID}/engine-invites/{inv["code"]}/accept', OT, 'POST', {'asset_id': eng2['id']}); assert st == 200, acc
LINK = acc['id']

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    s = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    shot = lambda n: page.screenshot(path=f'{OUT}/{n}.png', full_page=True)

    # ---- Engine Builds → Engine tunes
    page.click('.sidebar .nav-link[href="/tunes"]')
    expect(page.locator('h1')).to_have_text('Engine tunes')
    card = page.locator('[data-testid="tune-engine"]:has-text("410 #3")')
    expect(card).to_contain_text('Running 2026 v2')
    expect(card.locator('[data-testid="tune-row"]')).to_have_count(2)
    expect(card.locator('[data-testid="tune-row"]:has-text("2026 v2")')).to_contain_text('active')
    shot('39-01-tunes')
    # make the old version active, then back
    card.locator('[data-testid="tune-row"]:has-text("2026 v1") button:has-text("Make active")').click()
    expect(card).to_contain_text('Running 2026 v1')
    card.locator('[data-testid="tune-row"]:has-text("2026 v2") button:has-text("Make active")').click()
    expect(card).to_contain_text('Running 2026 v2')

    # ---- a new version starts from the newest and becomes the active one
    card.locator('a:has-text("New version")').click()
    expect(page.locator('.carry-bar')).to_contain_text('2026 v2')
    expect(page.locator('#f-plugs')).to_have_value('NGK R5671A-10')
    expect(page.locator('#f-ls_pill')).to_have_value('80')
    page.fill('#f-name', '2026 v3')
    page.fill('#f-timing', '31° BTDC')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.locator('h1')).to_have_text('Engine tunes')
    expect(card).to_contain_text('Running 2026 v3')
    time.sleep(1.5)
    R = recs()
    act = [r['data']['values']['name'] for r in by('engine_tune', R, engine=eng['id']) if r['data']['values'].get('active')]
    assert act == ['2026 v3'], act
    v3 = by('engine_tune', R, name='2026 v3')[0]

    # the tune sheet: versions under it, and the printout laid out like a builder's tune sheet
    card.locator('[data-testid="tune-row"]:has-text("2026 v1") a').click()
    expect(page.locator('.tune-versions')).to_contain_text('This isn’t the active version')
    page.click('.page-head a:has-text("Print")')
    pr = page.locator('[data-testid="tune-print"]')
    expect(pr).to_contain_text('Pill settings')
    expect(pr).to_contain_text('87–89')
    expect(pr).to_contain_text('Engler 2.9')
    expect(pr).to_contain_text('Not the active version')
    shot('39-02-tune-print')

    # ---- a setup sheet: the motor's active tune and the jetting for tonight's ADR
    tonight = by('event', R, name='Valley Speedway — Club night')[0]
    heat = next(r for r in by('setup', R) if r['data']['values'].get('event') == tonight['id'])
    page.goto(f'{B}/r/setup/{heat["id"]}')
    panel = page.locator('[data-testid="tune-panel"]')
    expect(panel).to_contain_text('2026 v3')
    expect(panel).to_contain_text('active')
    page.fill('#f-adr', '91')
    expect(page.locator('[data-testid="tune-advice"]')).to_contain_text('main pill 70')
    expect(page.locator('[data-testid="tune-advice"]')).to_contain_text('108 psi / 72')
    expect(page.locator('[data-testid="tune-row-match"]')).to_contain_text('90 – 93')
    shot('39-03-setup-jetting')
    panel.locator('button:has-text("Use this jetting")').click()
    expect(page.locator('#f-main_jet')).to_have_value('70')
    expect(page.locator('#f-hs_bypass')).to_have_value('108 psi / 72')
    expect(page.locator('#f-ls_bypass')).to_have_value('40–50 psi / 80')
    expect(page.locator('#f-engine_tune')).to_have_value(v3['id'])
    # a reading in the gap between two bands takes the nearest; off the end of the chart says so
    page.fill('#f-adr', '89.5')
    expect(page.locator('[data-testid="tune-advice"]')).to_contain_text('main pill 75')
    page.fill('#f-adr', '110')
    expect(page.locator('[data-testid="tune-advice"]')).to_contain_text('outside the chart')
    page.fill('#f-adr', '91')
    page.get_by_role('button', name='Save', exact=True).click()
    time.sleep(1.5)
    hv = next(r for r in recs() if r['id'] == heat['id'])['data']['values']
    assert hv['main_jet'] == '70' and hv['engine_tune'] == v3['id'], hv

    # ---- the workshop setup shows its (older) tune
    shop = by('shop_setup', R, name='Lakeside baseline')[0]
    page.goto(f'{B}/r/shop_setup/{shop["id"]}')
    expect(page.locator('[data-testid="tune-panel"]')).to_contain_text('2026 v2')
    expect(page.locator('[data-testid="tune-panel"]')).to_contain_text('not the active version')

    # ---- In the Workshop → Engine checks: the last check is compared with the tune and the check before
    page.goto(B + '/workshop')
    page.click('.sidebar .nav-link[href="/workshop/engine-checks"]')
    expect(page.locator('h1')).to_have_text('Engine checks')
    sec = page.locator('section:has(h3:text-is("410 #3"))')
    rows = sec.locator('[data-testid="engine-check-row"]')
    expect(rows).to_have_count(2)
    expect(rows.first).to_contain_text('to look at')
    expect(rows.nth(1)).to_contain_text('all good')
    shot('39-04-checks')
    rows.first.click()
    flags = page.locator('[data-testid="check-flags"]')
    expect(flags).to_contain_text('#5: intake spring down 12% since the last check (278 → 246 lb)')
    expect(flags).to_contain_text('#6: intake lash 0.015 in, tune says 0.012 in (cold)')
    expect(flags).to_contain_text('#6: plug reads lean')
    expect(page.locator('[data-testid="check-compare-against"]')).to_contain_text('2026 v2')
    shot('39-05-check-compare')

    # a new check: readings flagged as they're typed
    page.goto(B + '/workshop/engine-checks')
    sec.locator('a:has-text("New engine check")').click()
    expect(page.locator('#f-engine_tune')).to_have_value(v3['id'])   # the engine's active tune
    page.fill('[id="f-leakdown-#1"]', '12')
    page.fill('[id="f-spring_int-#5"]', '240')
    expect(page.locator('[data-testid="check-flags"]')).to_contain_text('#1: leak-down 12%')
    expect(page.locator('[data-testid="check-flags"]')).to_contain_text('#5: intake spring 240 lb, 14% under the tune’s 280 lb')
    page.locator('#f-filter_status').select_option('Metal found — action needed')
    expect(page.locator('[data-testid="check-flags"]')).to_contain_text('Metal found in the oil filter')
    page.get_by_role('button', name='Save', exact=True).click()
    expect(page.locator('h1')).to_have_text('Engine checks')
    expect(rows).to_have_count(3)

    # a blank check to print for the bench, with the tune's figures
    sec.locator('a:has-text("Print blank")').click()
    cp = page.locator('[data-testid="check-print"]')
    expect(cp).to_contain_text('Workshop engine check')
    expect(cp).to_contain_text('Tune: 2026 v3')
    expect(cp).to_contain_text('Cam drive')
    shot('39-06-check-print')

    # ---- the engine builder's shared tune on the linked engine: use it, and it becomes the active tune
    page.goto(f'{B}/engines/linked/{LINK}')
    bt = page.locator('[data-testid="builder-tune"]')
    expect(bt).to_have_count(1)
    expect(bt).to_contain_text('Shop tune A')
    expect(page.locator('[data-testid="pack-tunes"]')).to_contain_text('NGK R7')
    shot('39-07-builder-tunes')
    bt.locator('button:has-text("Use this tune")').click()
    expect(page.locator('.builder-tunes [role="status"]')).to_contain_text('now your active tune')
    expect(bt).to_contain_text('in your tunes')
    time.sleep(1.5)
    mine = by('engine_tune', recs(), engine=eng2['id'])
    copied = [r for r in mine if r['data']['values'].get('builder_tune') == stune['id']]
    assert len(copied) == 1 and copied[0]['data']['values']['active'] and copied[0]['data']['values']['source'] == 'Engine builder', copied
    assert copied[0]['data']['values']['builder'] == 'Hart Tune Shop'
    assert not any(r['data']['values'].get('active') for r in mine if r['id'] != copied[0]['id']), 'the mechanic’s tune is no longer active'

    # the public engine page shows the shared tune too
    page.goto(f'{B}/s/{share["token"]}')
    expect(page.locator('[data-testid="pack-tunes"]')).to_contain_text('Shop tune A')
    expect(page.locator('[data-testid="pack-tunes"]')).not_to_contain_text('Private dyno tune')

    br.close()

assert not errors, errors
print('e2e39 OK')
