# Sponsor payments, in kind, inventory links, trip costs and crew pay: the forms; amounts hidden from roles
# without money rights; the payment schedule (scheduled, received, outstanding, overdue, Mark received →
# linked income, Reminders); in kind recorded as income and a matching cost; the season report; Add to
# inventory from an expense (asset) and a received parts order (tyre); Spent on this on an asset (and a
# hauler service); trip fuel and tolls into Finance and updated; crew pay from contracts on the event page,
# not added twice; a phone.
import json, os, re, sys, time, uuid, urllib.request, urllib.error
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
day = lambda n: (date.today() + timedelta(days=n)).isoformat()

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Phase B Racing', 'plan': 'pro', 'practice': True}); assert st == 200, t; TID = t['id']
o = login(); OT = o['token']; ME = o['user']['id']
RUN = TID[:6]
# a role that can read finance and sponsors but not see amounts
st, viewer = call(f'/t/{TID}/roles', OT, 'POST', {'name': 'Money-blind reader', 'permissions': ['area.team', 'finance.view', 'partnerships.view']}); assert st == 200, viewer
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': f'viewer48+{RUN}@test.com', 'role_id': viewer['id']})
assert call(f'/invites/{inv["token"]}/accept', method='POST', body={'name': 'Viewer', 'password': 'password48'})[0] == 200
VW = login(f'viewer48+{RUN}@test.com', 'password48')
recs = lambda tok=OT: [r for r in call(f'/t/{TID}/sync?since=0', tok)[1]['records'] if not r['global'] and not r['deleted']]
rec = lambda id: next(r for r in recs() if r['id'] == id)
def push(r, vals, **kw):
    res = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [{'id': r['id'] if r else str(uuid.uuid4()), 'type': kw.get('type') or r['type'],
        'data': {**(r['data'] if r else {}), 'values': vals}, 'client_updated_at': now()}]})[1]['results'][0]
    assert res['status'] == 'applied', res
    return res['record']
def until(fn, secs=15):
    end = time.time() + secs
    while True:
        try:
            if fn(): return
        except (KeyError, TypeError, StopIteration): pass
        if time.time() > end: raise AssertionError('timed out waiting')
        time.sleep(0.5)
R = recs()
by = lambda type, **kw: [r for r in R if r['type'] == type and all(r['data']['values'].get(k) == x for k, x in kw.items())]
fields = lambda target: {f['key']: f for r in R if r['type'] == 'form' and r['data'].get('target') == target for s in r['data']['sections'] for f in s['fields']}
valley = by('sponsor', name='Valley Tyres')[0]
tonight = by('event', name='Valley Speedway — Club night')[0]
order = by('purchase', item='RR shock rebuild kit')[0]
hauler = next(r for r in R if r['type'] == 'asset' and r['data']['values'].get('name') == 'Hauler')
car = by('car', name='Car 17')[0]

# ---- the forms, and amounts hidden from a viewer
sf, ef, pf, cf = fields('sponsor'), fields('expense'), fields('purchase'), fields('contract')
assert [c['key'] for c in sf['payments']['columns']] == ['due', 'amount', 'invoice_no', 'invoiced', 'received', 'income']
assert [c['key'] for c in sf['in_kind']['columns']] == ['item', 'qty', 'value', 'category', 'received', 'income', 'expense']
assert ef['inventory_item']['type'] == 'asset' and ef['member']['type'] == 'member' and pf['inventory_item']['type'] == 'asset'
assert cf['per_diem']['money'] and cf['pay_per_event']['money'] and cf['member']['showIf'] == 'kind=Crew / contractor|Driver'
vv = next(r for r in recs(VW['token']) if r['id'] == valley['id'])['data']['values']
assert 'payments' not in vv and 'in_kind' not in vv and 'value' not in vv, list(vv)
vb = next(r for r in recs(VW['token']) if r['type'] == 'budget')['data']['values']
assert 'income_lines' not in vb and 'lines' not in vb, list(vb)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    def session(lg):
        s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': TID}
        page.goto(B); page.wait_for_load_state('networkidle'); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    shot = lambda n, full=True: page.screenshot(path=f'{OUT}/{n}.png', full_page=full)
    synced = lambda: expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    refresh = lambda: (page.goto(B + '/'), synced())
    session(o)

    # ---- the payment schedule
    page.goto(B + f'/partners/sponsors/{valley["id"]}')
    tot = page.locator('[data-testid="payment-totals"]')
    expect(tot).to_contain_text('Scheduled $12,000.00'); expect(tot).to_contain_text('Received $6,000.00'); expect(tot).to_contain_text('Outstanding $6,000.00')
    pays = page.locator('[data-testid="payments"]')
    expect(pays.locator('tr', has_text='INV-101')).to_contain_text('Received')
    row = pays.locator('tr', has_text='INV-102')
    expect(row).to_contain_text('Invoiced')
    row.get_by_role('button', name='Mark received').click()
    expect(row).to_contain_text('Received')
    expect(tot).to_contain_text('Outstanding $0.00')
    until(lambda: rec(valley['id'])['data']['values']['payments'][1].get('income'))
    p2 = rec(valley['id'])['data']['values']['payments'][1]
    inc = rec(p2['income'])['data']['values']
    assert p2['received'] == day(0) and inc['kind'] == 'Sponsorship' and inc['amount'] == '6000' and inc['reference'] == 'INV-102' and inc['sponsor'] == valley['id'] and inc['paid'], (p2, inc)
    # an instalment past due shows as overdue
    v = rec(valley['id'])['data']['values']
    push(rec(valley['id']), {**v, 'payments': v['payments'] + [{'due': day(-3), 'amount': '500', 'invoice_no': 'INV-103', 'invoiced': day(-20)}]})
    refresh()
    page.goto(B + f'/partners/sponsors/{valley["id"]}')
    expect(pays.locator('tr', has_text='INV-103')).to_contain_text('Overdue')
    expect(tot).to_contain_text('1 overdue')
    expect(tot).to_contain_text('not the deal value')
    page.goto(B + '/reminders')
    expect(page.locator('main')).to_contain_text('Valley Tyres: payment (invoice INV-103)')   # INV-102 (due in 10 days) is outside the week's lead
    page.goto(B + f'/partners/sponsors/{valley["id"]}')

    # ---- in kind: income and a matching cost
    kind = page.locator('[data-testid="in-kind"]')
    tyres = kind.locator('tr', has_text='Hoosier race tyres')
    expect(tyres).to_contain_text('$1,600.00'); expect(tyres).to_contain_text('not yet')
    tyres.get_by_role('button', name='Record in Finance').click()
    expect(tyres.get_by_role('link', name='Income')).to_be_visible()
    expect(tyres.get_by_role('link', name='Cost')).to_be_visible()
    shot('48-01-payments')
    until(lambda: rec(valley['id'])['data']['values']['in_kind'][0].get('expense'))
    k = rec(valley['id'])['data']['values']['in_kind'][0]
    ki, ke = rec(k['income'])['data']['values'], rec(k['expense'])['data']['values']
    assert ki['kind'] == 'In-kind sponsorship' and ki['amount'] == '1600' and ke['category'] == 'Tyres' and ke['amount'] == '1600' and k['received'] == day(0), (k, ki, ke)
    page.goto(B + f'/print/sponsor/{valley["id"]}')
    expect(page.locator('[data-testid="sponsor-print"]')).to_contain_text('Hoosier race tyres × 8 — received')
    expect(page.locator('[data-testid="sponsor-print"]')).not_to_contain_text('1,600')

    # ---- Add to inventory from an expense, and Spent on this
    exp = push(None, {'date': day(-1), 'category': 'Parts', 'description': 'LF shock (new)', 'supplier_name': 'Penske AU', 'amount': '1450', 'car': car['id'], 'paid': True}, type='expense')
    refresh()
    page.goto(B + f'/r/expense/{exp["id"]}')
    tools = page.locator('[data-testid="inventory-tools"]')
    tools.get_by_role('button', name='Add to inventory').click()
    tools.get_by_label('What is it').select_option('Shock')
    expect(tools.get_by_label('Name / ID')).to_have_value('LF shock (new)')
    tools.get_by_label('Name / ID').fill('LF Shock #5')
    tools.get_by_label('For car').select_option(car['id'])
    tools.get_by_role('button', name='Add to inventory').click()
    expect(tools).to_contain_text('Inventory item: LF Shock #5')
    until(lambda: (rec(exp['id'])['data']['values'].get('inventory_item') or {}).get('asset'))
    aid = rec(exp['id'])['data']['values']['inventory_item']['asset']
    av = rec(aid)['data']['values']
    assert av['category'] == 'Shock' and av['cost'] == '1450' and av['vendor'] == 'Penske AU' and av['car'] == car['id'] and av['purchase_date'] == day(-1), av
    tools.get_by_role('link', name='Open it').click()
    spend = page.locator('[data-testid="asset-spend"]')
    expect(spend).to_contain_text('Bought for$1,450.00')
    expect(page.locator('main')).to_contain_text('LF shock (new)')
    # a service on the hauler is spent on the hauler
    push(None, {'date': day(-2), 'category': 'Transport', 'description': 'Hauler 20,000 km service', 'amount': '640', 'inventory_item': {'asset': hauler['id']}, 'paid': True}, type='expense')
    refresh()
    page.goto(B + f'/assets/{hauler["id"]}')
    expect(page.locator('[data-testid="asset-spend"]')).to_contain_text('$640.00')
    expect(page.locator('main')).to_contain_text('Hauler 20,000 km service')

    # ---- a received parts order becomes a tyre (only once it's received)
    page.goto(B + f'/r/purchase/{order["id"]}')
    expect(page.locator('[data-testid="inventory-tools"]')).to_have_count(0)
    push(rec(order['id']), {**rec(order['id'])['data']['values'], 'status': 'Received'})
    refresh()
    page.goto(B + f'/r/purchase/{order["id"]}')
    tools.get_by_role('button', name='Add to inventory').click()
    tools.get_by_label('What is it').select_option('Tyre')
    tools.get_by_label('Name / ID').fill('RR-15')
    tools.get_by_role('button', name='Add to inventory').click()
    expect(tools).to_contain_text('Inventory item: RR-15')
    until(lambda: (rec(order['id'])['data']['values'].get('inventory_item') or {}).get('asset'))
    tid_ = rec(order['id'])['data']['values']['inventory_item']['asset']
    tr = rec(tid_)
    assert tr['type'] == 'tire' and tr['data']['values']['cost'] == '180' and tr['data']['values']['status'] == 'New', tr['data']['values']

    # ---- trip costs into Finance, and kept in step
    trip = push(None, {'event': tonight['id'], 'vehicle': {'asset': hauler['id']}, 'depart_date': day(0), 'fuel_stops': [{'place': 'Roadhouse', 'cost': '120'}, {'place': 'Town', 'cost': '80'}], 'tolls': '25'}, type='trip')
    refresh()
    page.goto(B + f'/r/trip/{trip["id"]}')
    tt = page.locator('[data-testid="trip-tools"]')
    expect(tt).to_contain_text('$225.00')
    tt.get_by_role('button', name='Add to Finance').click()
    expect(tt).to_contain_text('in Finance ✓')
    until(lambda: rec(trip['id'])['data']['values'].get('expense'))
    te = rec(rec(trip['id'])['data']['values']['expense'])['data']['values']
    assert te['category'] == 'Transport' and te['amount'] == '225' and te['event'] == tonight['id'] and te['inventory_item'] == {'asset': hauler['id']}, te
    page.fill('#f-tolls', '35')
    page.get_by_role('button', name='Save', exact=True).first.click()
    page.wait_for_timeout(800)
    page.goto(B + f'/r/trip/{trip["id"]}')
    expect(tt).to_contain_text('Finance has $225.00')
    tt.get_by_role('button', name='Update the expense').click()
    expect(tt).to_contain_text('in Finance ✓')
    until(lambda: rec(rec(trip['id'])['data']['values']['expense'])['data']['values']['amount'] == '235')
    assert len([e for e in recs() if e['type'] == 'expense' and e['data']['values'].get('category') == 'Transport' and e['data']['values'].get('event') == tonight['id']]) == 1

    # ---- crew pay from contracts
    push(None, {'name': 'Crew pay — owner', 'kind': 'Crew / contractor', 'member': ME, 'start': day(-200), 'end': day(200), 'per_diem': '50', 'pay_per_event': '100'}, type='contract')
    push(rec(tonight['id']), {**rec(tonight['id'])['data']['values'], 'crew': [{'member': ME, 'role': 'Car chief'}]})
    refresh()
    page.goto(B + f'/events/{tonight["id"]}')
    cc = page.locator('[data-testid="crew-costs"]')
    expect(cc).to_contain_text('Per diem × 1 day'); expect(cc).to_contain_text('$50.00')
    expect(cc).to_contain_text('Pay for the meeting'); expect(cc).to_contain_text('$100.00')
    shot('48-02-crew-pay')
    cc.get_by_role('button', name=re.compile('Add crew costs to Finance')).click()
    expect(cc).to_contain_text('2 crew costs already in Finance')
    expect(cc.get_by_role('button', name=re.compile('Add crew costs'))).to_have_count(0)
    until(lambda: len([e for e in recs() if e['type'] == 'expense' and e['data']['values'].get('member') == ME and e['data']['values'].get('event') == tonight['id']]) == 2)
    crew_exp = sorted([e['data']['values'] for e in recs() if e['type'] == 'expense' and e['data']['values'].get('member') == ME], key=lambda x: x['category'])
    assert [(x['category'], x['amount'], x['paid']) for x in crew_exp] == [('Per diems & catering', '50', False), ('Wages & contractors', '100', False)], crew_exp
    assert crew_exp[0]['due_date'] == day(7), crew_exp[0]
    page.goto(B + '/reminders')
    expect(page.locator('main')).to_contain_text('Per diem × 1 day')

    # ---- a phone
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(B + f'/partners/sponsors/{valley["id"]}'); page.wait_for_timeout(500)
    shot('48-03-sponsor-phone')
    sw = page.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, sw
    br.close()

assert not errors, errors
print('E2E48 OK')
