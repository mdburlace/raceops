import json, sys, uuid, urllib.request, urllib.error, os
from datetime import datetime, timezone, date, timedelta
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
errors = []
def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
def shot(page, name, full=True):
    page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
d = lambda n: (date.today() - timedelta(days=n)).isoformat()
now = datetime.now(timezone.utc).isoformat()
def rec(type, values, **extra):
    return {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **extra}, 'client_updated_at': now}
def push(tid, *recs):
    res = call(f'/t/{tid}/sync', OT, 'POST', {'changes': list(recs)})[1]['results']
    assert all(r['status'] == 'applied' for r in res), res
def form(tid, target):
    return next(r['id'] for r in call(f'/t/{tid}/sync?since=0', OT)[1]['records'] if r['type'] == 'form' and r['data']['target'] == target)

o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
OT = o['token']
TEAM = next(m for m in o['memberships'] if m['tenant_name'] == 'Burlace Racing')['tenant_id']
call(f'/admin/tenants/{TEAM}', OT, 'PATCH', {'plan': 'pro', 'features': {}, 'ai_budget_usd': None})
call('/admin/ai', OT, 'PUT', {'enabled': True})
AF, SF = form(TEAM, 'asset'), form(TEAM, 'setup')
car = rec('car', {'name': 'Fuel car', 'number': '17', 'fuel_min': '1.5'})
car2 = rec('car', {'name': 'Spare car', 'number': '71'})
eng = rec('asset', {'name': 'Fuel 410', 'category': 'Engine', 'status': 'In Service'}, form_id=AF)
lf = rec('asset', {'name': 'LF Penske 2-way', 'category': 'Shock', 'status': 'In Service', 'position': 'LF', 'adjust_type': 'Two-way', 'car': car['id']}, form_id=AF)
rf = rec('asset', {'name': 'RF Fixed', 'category': 'Shock', 'status': 'In Service', 'position': 'RF', 'adjust_type': 'Non-adjustable'}, form_id=AF)
lr = rec('asset', {'name': 'LR Fixed', 'category': 'Shock', 'status': 'In Service', 'position': 'LR', 'adjust_type': 'Non-adjustable'}, form_id=AF)
rr = rec('asset', {'name': 'RR Fixed', 'category': 'Shock', 'status': 'In Service', 'position': 'RR', 'adjust_type': 'Non-adjustable'}, form_id=AF)
spare = rec('asset', {'name': 'Spare 3-way', 'category': 'Shock', 'status': 'In Service', 'adjust_type': 'Three-way'}, form_id=AF)
other = rec('asset', {'name': 'LF other car', 'category': 'Shock', 'status': 'In Service', 'position': 'LF', 'car': car2['id']}, form_id=AF)
ev_old = rec('event', {'name': 'Valley June', 'date': d(60), 'track': 'Valley Speedway', 'car': car['id']})
ev_far = rec('event', {'name': 'Other track', 'date': d(30), 'track': 'Far Raceway', 'car': car['id']})
ev = rec('event', {'name': 'Valley Oct', 'date': d(0), 'track': 'valley speedway ', 'car': car['id']})
s_old = rec('setup', {'event': ev_old['id'], 'car': car['id'], 'session': 'Feature', 'engine': {'asset': eng['id']}, 'laps': '30', 'fuel_start': '10', 'fuel_finish': '4'}, form_id=SF)
s_far = rec('setup', {'event': ev_far['id'], 'car': car['id'], 'session': 'Feature', 'engine': {'asset': eng['id']}, 'laps': '10', 'fuel_start': '10', 'fuel_finish': '0'}, form_id=SF)
s_heat = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Heat 1', 'order': 10, 'engine': {'asset': eng['id']}, 'laps': '10', 'fuel_start': '5', 'fuel_finish': '3'}, form_id=SF)
s_feat = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Feature', 'order': 20, 'engine': {'asset': eng['id']}}, form_id=SF)
DF = next(r['id'] for r in call(f'/t/{TEAM}/sync?since=0', OT)[1]['records'] if r['type'] == 'form' and r['data']['target'] == 'dyno_run' and r['data'].get('dyno_kind') == 'shock')
dyno = rec('dyno_run', {'asset': rf['id'], 'date': d(1), 'label': 'Import test', 'adjust_type': 'Non-adjustable', 'test_speeds': ['10.00']}, form_id=DF)
push(TEAM, car, car2, eng, lf, rf, lr, rr, spare, other, ev_old, ev_far, ev, s_old, s_far, s_heat, s_feat, dyno)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': TEAM}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- 1. spreadsheet into a dyno table (second sheet picked) ----
    page.goto(f"{B}/r/dyno_run/{dyno['id']}")
    page.click('button:has-text("Paste / import")')
    page.set_input_files('input[aria-label="Spreadsheet to import"]', f'{HERE}/dyno.xlsx')
    sel = page.locator('select[aria-label="Sheet"]'); expect(sel).to_be_visible()
    sel.select_option(label='Dyno')
    expect(page.locator('textarea[aria-label="Paste data"]')).to_have_value(lambda: None) if False else None
    assert '345' in page.locator('textarea[aria-label="Paste data"]').input_value()
    shot(page, '17-01-dyno-xlsx')
    page.click('.paste-panel button:has-text("Replace")')
    expect(page.locator('input[value="345"]').first).to_be_visible()
    # bad file
    page.click('button:has-text("Paste / import")')
    open(f'{OUT}/bad.xls', 'wb').write(b'nope')
    page.set_input_files('input[aria-label="Spreadsheet to import"]', f'{OUT}/bad.xls')
    expect(page.locator('.paste-panel .notice.error')).to_be_visible()
    page.click('.paste-panel button:has-text("Cancel")')

    # ---- 2. AI fill from a CSV ----
    page.goto(f"{B}/r/setup/{s_feat['id']}")
    expect(page.locator('button:has-text("Fill from photo, PDF or Excel")')).to_be_visible()
    page.set_input_files('input[aria-label="Photos to read"]', f'{HERE}/sheet.csv')
    expect(page.locator('text=Read from spreadsheet').first).to_be_visible(timeout=15000)
    shot(page, '17-02-ai-csv')
    page.keyboard.press('Escape')
    page.goto(f"{B}/r/setup/{s_feat['id']}")

    # ---- 3. shocks filtered by corner & car ----
    lfsel = page.locator('#f-shocks-LF'); expect(lfsel).to_be_visible()
    OPTS = lambda l: l.evaluate("s => [...s.options].map(o => o.textContent)")
    opts = OPTS(lfsel)
    assert any('LF Penske' in x for x in opts) and any('Spare 3-way' in x for x in opts), opts
    assert not any('RF Fixed' in x for x in opts) and not any('LF other car' in x for x in opts), opts
    assert any('Show all' in x for x in opts), opts
    lfsel.select_option(label=next(x for x in opts if 'Show all' in x))
    opts2 = OPTS(lfsel)
    assert any('RF Fixed' in x for x in opts2) and any('LF other car' in x for x in opts2), opts2
    lfsel.select_option(label=next(x for x in opts2 if 'LF Penske' in x))
    # ---- 4. adjusters follow the shock type ----
    expect(page.locator('#f-shock_adjust-LF-Comp')).to_be_visible()
    page.fill('#f-shock_adjust-LF-Comp', '3'); page.fill('#f-shock_adjust-LF-Reb', '5')
    page.locator('#f-shocks-RF').select_option(label='RF Fixed')
    page.locator('#f-shocks-LR').select_option(label='LR Fixed')
    page.locator('#f-shocks-RR').select_option(label='RR Fixed')
    for c in ['RF', 'LR', 'RR']:   # non-adjustable shocks: no adjuster row on their card
        expect(page.locator(f'.shock-card[data-corner="{c}"]')).not_to_contain_text('Adjusters')
    expect(page.locator('.shock-card[data-corner="LF"]')).to_contain_text('Adjusters')
    # spare 3-way at LF → three inputs
    page.locator('#f-shocks-LF').select_option(label='Spare 3-way')
    expect(page.locator('#f-shock_adjust-LF-LS_comp')).to_be_visible()
    expect(page.locator('#f-shock_adjust-LF-HS_comp')).to_be_visible()
    page.locator('#f-shocks-LF').select_option(label=next(x for x in OPTS(page.locator('#f-shocks-LF')) if 'LF Penske' in x))
    expect(page.locator('#f-shock_adjust-LF-Comp')).to_have_value('3')
    # ---- 5. bump rubbers ----
    for k in ['bump_type', 'bump_spec', 'bump_height', 'bump_packers', 'bump_gap']:
        expect(page.locator(f'#f-{k}-LF')).to_be_visible()
    page.fill('#f-bump_type-LF', 'Penske'); page.fill('#f-bump_spec-LF', '70A'); page.fill('#f-bump_height-LF', '1.25')
    page.fill('#f-bump_packers-LF', '2'); page.fill('#f-bump_gap-LF', '0.75')
    page.locator('#f-shocks-LF').scroll_into_view_if_needed(); shot(page, '17-03-shocks', full=False)
    # ---- 6. fuel planner ----
    fp = page.locator('[data-testid="fuel-planner"]')
    fp.scroll_into_view_if_needed()
    expect(fp).to_contain_text('0.200 gal/lap')  # (6+2)/(30+10); other track ignored
    expect(fp).to_contain_text('this event (1 session')
    expect(fp).to_contain_text('Minimum kept in the tank: 1.5')
    page.fill('#f-planned_laps', '25')
    expect(page.locator('[data-testid="fuel-predicted"]')).to_have_text('6.5 gal')
    page.fill('#f-fuel_start', '5')
    expect(fp).to_contain_text('below the predicted 6.5')
    fp.locator('button:has-text("Use as fuel started")').click()
    expect(page.locator('#f-fuel_start')).to_have_value('6.5')
    page.fill('#f-fuel_finish', '1')
    expect(fp).to_contain_text('below the minimum of 1.5')
    shot(page, '17-04-fuel', full=False)
    page.click('button:has-text("Save")')
    page.wait_for_timeout(2500)
    recs = {r['id']: r for r in call(f'/t/{TEAM}/sync?since=0', OT)[1]['records']}
    vals = recs[s_feat['id']]['data']['values']
    assert vals['shock_adjust']['LF'] == 'Comp 3 · Reb 5', vals.get('shock_adjust')
    assert vals['shocks']['RF'] == {'asset': rf['id']}, vals['shocks']
    assert vals['bump_gap']['LF'] in (0.75, '0.75') and vals['bump_packers']['LF'] in (2, '2'), vals
    assert str(vals['planned_laps']) == '25' and str(vals['fuel_start']) == '6.5', vals

    # all shocks non-adjustable → adjuster field hidden
    s2 = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Dash', 'order': 15, 'shocks': {c: {'asset': x['id']} for c, x in zip(['LF','RF','LR','RR'], [rf, rf, lr, rr])}}, form_id=SF)
    push(TEAM, s2)
    page.goto(B); page.wait_for_timeout(1500)
    page.goto(f"{B}/r/setup/{s2['id']}")
    expect(page.locator('#f-shocks-LF')).to_be_visible()
    expect(page.locator('.shock-card')).to_have_count(4)
    expect(page.locator('#sec-shocks')).not_to_contain_text('Adjusters')
    # fallback: no laps-with-fuel at this event/track for the spare car → rate from nothing
    # car minimum on the car form
    page.goto(f"{B}/r/car/{car['id']}")
    expect(page.locator('#f-fuel_min')).to_have_value('1.5')

    # mobile look
    mp = br.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True).new_page()
    mp.goto(B); mp.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    mp.goto(f"{B}/r/setup/{s_feat['id']}"); mp.wait_for_timeout(2500)
    mp.locator('#f-shock_adjust-LF-Comp').scroll_into_view_if_needed(); shot(mp, '17-05-mobile-shocks', full=False)
    mp.locator('[data-testid="fuel-planner"]').scroll_into_view_if_needed(); shot(mp, '17-06-mobile-fuel', full=False)
    assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    br.close()

print('ERRORS:', errors) if errors else None
assert not errors, errors
print('E2E17 OK')
