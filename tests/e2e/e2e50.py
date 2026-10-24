# Season forecast, cash flow, what's owed and depreciation, with numbers worked out here independently:
# the forecast by category (spent + on order + planned meetings × per-meeting average) against the budget,
# tentative meetings apart, the income side and the season net; the 8-week cash flow with a running balance
# and the below-zero warning; receivables and payables by age and orders not billed; straight-line and
# per-lap depreciation, a sale's gain, the asset register, the asset page and Season P&L after depreciation;
# the new fields hidden from a role without money rights; a phone.
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
TODAY = date.today()
day = lambda n: (TODAY + timedelta(days=n)).isoformat()
money = lambda x: f"{'-' if x < 0 else ''}${abs(x):,.2f}"

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Forecast Racing', 'plan': 'pro'}); assert st == 200, t; TID = t['id']
o = login(); OT = o['token']
RUN = TID[:6]
st, role = call(f'/t/{TID}/roles', OT, 'POST', {'name': 'Money-blind', 'permissions': ['area.team', 'area.workshop', 'finance.view', 'assets.view']}); assert st == 200, role
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': f'blind49+{RUN}@test.com', 'role_id': role['id']})
assert call(f'/invites/{inv["token"]}/accept', method='POST', body={'name': 'Blind', 'password': 'password49'})[0] == 200
BL = login(f'blind49+{RUN}@test.com', 'password49')
recs = lambda tok=OT: [r for r in call(f'/t/{TID}/sync?since=0', tok)[1]['records'] if not r['global'] and not r['deleted']]
forms = {r['data']['target']: r['id'] for r in recs() if r['type'] == 'form' and r['data'].get('base')}
def add(type, vals):
    res = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [{'id': str(uuid.uuid4()), 'type': type, 'data': {'form_id': forms.get(type), 'values': vals}, 'client_updated_at': now()}]})[1]['results'][0]
    assert res['status'] == 'applied', res
    return res['record']

# ---- a small, known season
car = add('car', {'number': '9', 'name': 'Car 9', 'active': True})
engine = add('asset', {'name': 'Engine A', 'category': 'Engine', 'status': 'In Service', 'cost': '30000', 'depreciation': 'Per lap', 'life_unit': 'Laps', 'life_limit': '600'})
chassis = add('asset', {'name': 'Chassis 2', 'category': 'Chassis', 'status': 'In Service', 'cost': '12000', 'residual': '2000', 'depreciation': 'Straight line', 'useful_life': '4', 'purchase_date': day(-365)})
oldcar = add('asset', {'name': 'Old car', 'category': 'Chassis', 'status': 'Retired', 'cost': '8000', 'depreciation': 'Straight line', 'useful_life': '2', 'purchase_date': day(-500),
                       'disposed_on': day(-30), 'disposal': 'Sold', 'disposal_value': '3000'})
budget = add('budget', {'season': 'Test season', 'start': day(-60), 'end': day(120), 'alert_pct': '80', 'cash_on_hand': '500', 'cash_date': day(0),
                        'lines': [{'category': 'Tyres', 'amount': '1000'}, {'category': 'Entry fees', 'amount': '300'}], 'income_lines': [{'kind': 'Prize money', 'amount': '2000'}]})
past = [add('event', {'name': f'Past {i}', 'date': day(d), 'track': 'Test Park', 'car': car['id'], 'intent': 'Planned'}) for i, d in ((1, -20), (2, -10))]
for e in past:
    add('expense', {'date': e['data']['values']['date'], 'category': 'Tyres', 'description': 'Tyres', 'amount': '200', 'event': e['id'], 'paid': True})
    add('expense', {'date': e['data']['values']['date'], 'category': 'Entry fees', 'description': 'Entry', 'amount': '50', 'event': e['id'], 'paid': True})
    add('income', {'date': e['data']['values']['date'], 'kind': 'Prize money', 'description': 'Feature', 'amount': '300', 'event': e['id'], 'paid': True})
    add('setup', {'event': e['id'], 'car': car['id'], 'session': 'Feature', 'laps': '30', 'engine': {'asset': engine['id']}})
future = [add('event', {'name': f'Next {i}', 'date': day(d), 'track': 'Test Park', 'car': car['id'], 'intent': 'Planned'}) for i, d in ((1, 5), (2, 15), (3, 25))]
add('event', {'name': 'Maybe', 'date': day(40), 'track': 'Test Park', 'car': car['id'], 'intent': 'Tentative'})
add('event', {'name': 'Skipping', 'date': day(50), 'track': 'Test Park', 'car': car['id'], 'intent': 'Not going'})
add('purchase', {'item': 'Wing post', 'qty': '1', 'cost': '100', 'status': 'Approved'})
add('expense', {'date': day(-5), 'category': 'Insurance', 'description': 'Season insurance', 'supplier_name': 'Track Cover', 'amount': '700', 'paid': False, 'due_date': day(3)})
add('expense', {'date': day(-95), 'category': 'Workshop', 'description': 'Old welding gas', 'supplier_name': 'Gas Co', 'amount': '80', 'paid': False, 'due_date': day(-95)})
add('income', {'date': day(-40), 'kind': 'Appearance money', 'description': 'Club appearance', 'payer': 'Club', 'amount': '200', 'paid': False})
add('sponsor', {'name': 'Acme Fuel', 'stage': 'Signed', 'value': '1000', 'payments': [{'due': day(10), 'amount': '1000', 'invoice_no': 'A-1', 'invoiced': day(-2)}]})

# ---- the expected numbers, worked out here
per_meeting = (400 + 100) / 2                                     # tyres + entries over the 2 costed meetings
forecast = {'Tyres': 400 + 200 * 3, 'Entry fees': 100 + 50 * 3, 'Parts': 100, 'Insurance': 700}
total_forecast = sum(forecast.values()); over_by = total_forecast - 1300
income_forecast = 600 + 200 + 1000 + 300 * 3                      # received + unreceived income + instalment + prize per meeting × 3
net = income_forecast - total_forecast
w0_in, w0_out = 200, 700 + 80 + per_meeting                        # overdue income; insurance, overdue gas, Next 1
bal0 = 500 + w0_in - w0_out; bal1 = bal0 + 1000; bal2 = bal1 - per_meeting; bal3 = bal2 - per_meeting
def sl(cost, residual, years, bought, upto):
    days = (date.fromisoformat(upto) - date.fromisoformat(bought)).days + 1
    return min(cost - residual, (cost - residual) * days / (years * 365.25))
ch_book = round(12000 - sl(12000, 2000, 4, day(-365), day(0)), 2)
eng_book = round(30000 - 30000 * 60 / 600, 2)
old_book_then = round(8000 - sl(8000, 0, 2, day(-500), day(-30)), 2); old_gain = round(3000 - old_book_then, 2)
period = round(round(sl(12000, 2000, 4, day(-365), day(0)) - sl(12000, 2000, 4, day(-365), day(-61)), 2) + 3000 + round(sl(8000, 0, 2, day(-500), day(-30)) - sl(8000, 0, 2, day(-500), day(-61)), 2), 2)   # each asset rounded, as the register does

# ---- the new fields are hidden from a role that can't see amounts
blind = {r['id']: r['data'].get('values', {}) for r in recs(BL['token'])}
assert 'cash_on_hand' not in blind[budget['id']] and 'residual' not in blind[chassis['id']] and 'disposal_value' not in blind[oldcar['id']], (blind[budget['id']], blind[chassis['id']])

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
    session(o)

    # ---- the forecast
    page.goto(B + '/finance?tab=forecast')
    summary = page.locator('[data-testid="forecast-summary"]')
    expect(summary).to_contain_text(f'Heading over budget by {money(over_by)}')
    expect(summary).to_contain_text('2 meetings so far · 3 still planned (+1 tentative)')
    expect(summary).to_contain_text(f'{money(per_meeting)} a meeting on average')
    ft = page.locator('[data-testid="forecast-table"]')
    tyres = ft.locator('tr', has_text='Tyres')
    expect(tyres).to_contain_text(money(400)); expect(tyres).to_contain_text(money(200)); expect(tyres).to_contain_text(money(1000))
    expect(tyres).to_contain_text(f'{money(0)} spare')
    expect(ft.locator('tr', has_text='Entry fees')).to_contain_text(f'{money(50)} spare')
    expect(ft.locator('tr', has_text='Parts')).to_contain_text(money(100))
    expect(ft.locator('tr', has_text='Total')).to_contain_text(money(total_forecast))
    expect(page.locator('main')).to_contain_text(f'would add about {money(per_meeting)}')
    inc = page.locator('[data-testid="forecast-income"]')
    expect(inc).to_contain_text(f'Income forecast{money(income_forecast)}')
    expect(inc).to_contain_text(money(net))
    # the cash flow
    cf = page.locator('[data-testid="cash-flow"] tbody tr')
    expect(cf.nth(0)).to_contain_text(money(500))                    # now
    expect(cf.nth(1)).to_contain_text(money(bal0)); expect(cf.nth(1)).to_contain_text(money(w0_in)); expect(cf.nth(1)).to_contain_text(money(w0_out))
    expect(cf.nth(2)).to_contain_text(money(bal1))
    expect(cf.nth(3)).to_contain_text(money(bal2)); expect(cf.nth(4)).to_contain_text(money(bal3))
    expect(page.locator('[data-testid="cash-warning"]')).to_be_visible()
    shot('49-01-forecast')

    # ---- what's owed
    page.goto(B + '/finance?tab=owed')
    ra = page.locator('[data-testid="receivable-ages"]')
    expect(ra.locator('td').nth(0)).to_have_text(money(1000))       # not due: the sponsor instalment
    expect(ra.locator('td').nth(2)).to_have_text(money(200))        # 31–60 days: the appearance money
    expect(page.locator('[data-testid="receivables"]')).to_contain_text('Acme Fuel — Invoice A-1')
    expect(page.locator('[data-testid="receivables"]')).to_contain_text('40 days late')
    pa = page.locator('[data-testid="payable-ages"]')
    expect(pa.locator('td').nth(0)).to_have_text(money(700)); expect(pa.locator('td').nth(4)).to_have_text(money(80))
    expect(page.locator('[data-testid="payables"]')).to_contain_text('95 days late')
    expect(page.locator('[data-testid="on-order"]')).to_contain_text('Wing post')
    shot('49-02-owed')

    # ---- depreciation and the asset register
    page.goto(B + '/finance?tab=assets')
    reg = page.locator('[data-testid="asset-register"]')
    expect(reg.locator('tr', has_text='Chassis 2')).to_contain_text(money(ch_book))
    expect(reg.locator('tr', has_text='Engine A')).to_contain_text(money(eng_book))
    expect(reg.locator('tr', has_text='Engine A')).to_contain_text(f'{money(50)}/lap')
    old = reg.locator('tr', has_text='Old car')
    expect(old).to_contain_text(f'Sold'); expect(old).to_contain_text(f'for {money(3000)}'); expect(old).to_contain_text(f'gain {money(old_gain)}')
    expect(reg.locator('tr', has_text='Total')).to_contain_text(money(period))
    shot('49-03-assets')
    page.goto(B + f'/assets/{chassis["id"]}')
    expect(page.locator('[data-testid="asset-value"]')).to_contain_text(f'Book value today{money(ch_book)}')
    expect(page.locator('[data-testid="asset-value"]')).to_contain_text(f'{money(2500)} a year')
    page.goto(B + f'/assets/{oldcar["id"]}')
    expect(page.locator('[data-testid="asset-value"]')).to_contain_text(f'Book value then{money(old_book_then)}')
    page.goto(B + '/finance?tab=season')
    page.locator('input[type=date]').nth(0).fill(day(-60)); page.locator('input[type=date]').nth(1).fill(day(120))
    expect(page.locator('main')).to_contain_text(f'Depreciation')
    expect(page.locator('main')).to_contain_text(money(period))
    expect(page.locator('main')).to_contain_text(f'Gain on assets sold or scrapped{money(old_gain)}')
    cash_net = (600 + 200) - (400 + 100 + 700)          # income recorded (incl. the unreceived appearance money) less spent
    expect(page.locator('[data-testid="pnl-after-dep"]')).to_contain_text(money(round(cash_net - period + old_gain, 2)))

    # ---- the form
    page.goto(B + f'/r/asset/{chassis["id"]}')
    expect(page.locator('main')).to_contain_text('Value & depreciation')
    expect(page.locator('#f-useful_life')).to_have_value('4')

    # ---- a phone
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(B + '/finance?tab=forecast'); page.wait_for_timeout(600)
    shot('49-04-forecast-phone')
    sw = page.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, sw
    br.close()

assert not errors, errors
print('E2E50 OK')
