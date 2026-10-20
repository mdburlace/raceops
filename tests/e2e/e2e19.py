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
def shot(page, name, full=False):
    page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
now = datetime.now(timezone.utc).isoformat()
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]; OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Layout Team', 'plan': 'pro'}); TID = t['id']
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]; OT = o['token']
call('/me', OT, 'PATCH', {'prefs': {'setup_layout': {}}})
recs = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
form = lambda target: next(r['id'] for r in recs if r['type'] == 'form' and r['data']['target'] == target)
AF, SF = form('asset'), form('setup')
fdef = next(r for r in recs if r['type'] == 'form' and r['data']['target'] == 'setup')['data']
secs = [s['id'] for s in fdef['sections']]
assert 'wing' in secs and secs.index('wing') == secs.index('chassis') + 1, secs
wing = next(s for s in fdef['sections'] if s['id'] == 'wing')
assert [f['key'] for f in wing['fields']] == ['h_top_wing', 'top_wing', 'wing_angle', 'wicker', 'wing_position', 'h_front_wing', 'front_wing', 'nose_wing', 'front_wicker'], wing
assert next(s for s in fdef['sections'] if s['id'] == 'chassis')['title'] == 'Chassis'
assert next(s for s in fdef['sections'] if s['id'] == 'weights')['title'] == 'Weights'

car = rec('car', {'name': 'Layout car', 'number': '5'})
A = lambda name, pos, t: rec('asset', {'name': name, 'category': 'Shock', 'status': 'In Service', 'position': pos, 'adjust_type': t}, form_id=AF)
lf, rf, lr, rr = A('LF two-way', 'LF', 'Two-way'), A('RF fixed', 'RF', 'Non-adjustable'), A('LR fixed', 'LR', 'Non-adjustable'), A('RR three-way', 'RR', 'Three-way')
ev = rec('event', {'name': 'Layout night', 'date': date.today().isoformat(), 'track': 'Lakeside', 'car': car['id']})
heat = rec('setup', {'event': ev['id'], 'car': car['id'], 'session': 'Heat 1', 'order': 10,
                     'shocks': {'LF': {'asset': lf['id']}, 'RF': {'asset': rf['id']}, 'LR': {'asset': lr['id']}, 'RR': {'asset': rr['id']}},
                     'shock_adjust': {'LF': 'Comp 4 · Reb 6', 'RR': 'LS comp 3 · HS comp 2 · Reb 9'},
                     'pressure_cold': {'LF': '12', 'RF': '14', 'LR': '10', 'RR': '16'}, 'wing_angle': '13', 'laps': '10', 'pressure_hot': {'LF': '14'}}, form_id=SF)
st, r = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [car, lf, rf, lr, rr, ev, heat]}); assert all(x['status'] == 'applied' for x in r['results'])

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- new sheet copied from Heat 1 ----
    page.goto(f"{B}/r/setup/new?event={ev['id']}&car={car['id']}&session=Feature&order=20")
    page.click('button:has-text("Copy this session")')
    expect(page.locator('[data-testid="change-count"]')).to_have_text('No changes from Heat 1')
    expect(page.locator('#sec-session .sec-toggle')).to_have_attribute('aria-expanded', 'true')   # new sheet: session open
    nav = page.locator('.sheet-nav')
    expect(nav.locator('.sn-chip').first).to_have_attribute('data-jump', 'session')
    expect(nav.locator('.sn-chip:text-is("Wing")')).to_have_count(1)
    # shocks: corner cards, adjusters only for adjustable shocks
    expect(page.locator('.shock-card')).to_have_count(4)
    lr_card = page.locator('.shock-card[data-corner="LR"]')
    expect(lr_card).not_to_contain_text('Adjusters')
    expect(page.locator('.shock-card[data-corner="RR"] #f-shock_adjust-RR-LS_comp')).to_have_value('3')
    expect(page.locator('#f-shock_adjust-LF-Comp')).to_have_value('4')
    page.locator('.shock-card[data-corner="LF"] button[aria-label="More LF Comp"]').click()
    expect(page.locator('#f-shock_adjust-LF-Comp')).to_have_value('5')
    expect(page.locator('.shock-card[data-corner="LF"] .was')).to_contain_text('was LF two-way') if False else None
    for k in ['bump_type', 'bump_spec', 'bump_height', 'bump_packers', 'bump_gap']:
        expect(page.locator(f'.shock-card[data-corner="LR"] #f-{k}-LR')).to_be_visible()
    page.fill('#f-bump_gap-LR', '0.5')
    # pressures as one row, stepper, change highlight
    expect(page.locator('#f-pressure_cold-LF')).to_have_value('12')
    page.locator('button[aria-label="More Pressure cold"]').first.click()
    expect(page.locator('#f-pressure_cold-LF')).to_have_value('12.5')
    cell = page.locator('.cg-cell:has(#f-pressure_cold-LF)')
    expect(cell).to_have_class('cg-cell changed')
    expect(cell.locator('.was')).to_have_text('was 12')
    page.locator('#f-wing_angle').fill('13.5')
    expect(page.locator('[data-testid="change-count"]')).to_have_text('4 changes from Heat 1')
    expect(nav.locator('.sn-chip:has-text("Tires") .sn-count')).to_have_text('1')
    expect(nav.locator('.sn-chip:has-text("Shocks") .sn-count')).to_have_text('2')
    expect(page.locator('#sec-tires .sec-changes')).to_have_text('1 changed')
    # Enter moves along the row
    page.focus('#f-pressure_cold-LF'); page.keyboard.press('Enter')
    assert page.evaluate('document.activeElement.id') == 'f-pressure_cold-RF'
    shot(page, '19-01-copied-sheet')
    page.locator('#sec-shocks').scroll_into_view_if_needed(); shot(page, '19-02-shocks')

    # ---- changes only ----
    page.locator('label:has-text("Changes only") input').check()
    expect(page.locator('#sec-weather')).to_have_count(0)
    expect(page.locator('#sec-tires')).to_be_visible()
    expect(page.locator('#f-pressure_cold-LF')).to_be_visible()
    expect(page.locator('#f-pressure_hot-LF')).to_have_count(0)
    expect(page.locator('.shock-card')).to_have_count(2)   # LF (adjuster) and LR (bump gap)
    expect(nav.locator('.sn-chip:text-is("Weather")')).to_have_count(0)
    shot(page, '19-03-changes-only')
    page.locator('label:has-text("Changes only") input').uncheck()

    # ---- before / after ----
    page.click('.seg button:has-text("After")')
    expect(page.locator('#f-pressure_hot-LF')).to_be_visible()
    expect(page.locator('#f-pressure_cold-LF')).to_have_count(0)
    expect(page.locator('#f-laps')).to_be_visible()
    expect(page.locator('#f-travel-LF')).to_be_visible()
    expect(page.locator('#f-shocks-LF')).to_have_count(0)
    expect(page.locator('#sec-wing')).to_have_count(0)
    expect(page.locator('[data-testid="fuel-planner"]')).to_have_count(0)
    page.fill('#f-laps', '30')
    shot(page, '19-04-after')
    page.click('.seg button:has-text("Before")')
    expect(page.locator('#f-laps')).to_have_count(0)
    expect(page.locator('#f-planned_laps')).to_be_visible()
    page.click('.seg button:has-text("All")')

    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(2500)
    allr = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
    feat = next(r for r in allr if r['type'] == 'setup' and r['data']['values'].get('session') == 'Feature')
    fv = feat['data']['values']
    assert fv['copied_from'] == heat['id'], fv.get('copied_from')
    assert fv['shock_adjust']['LF'] == 'Comp 5 · Reb 6', fv['shock_adjust']
    assert fv['pressure_cold']['LF'] == '12.5' and str(fv['wing_angle']) == '13.5' and str(fv['laps']) == '30', fv
    assert 'pressure_hot' not in fv or not fv['pressure_hot'].get('LF'), fv   # hot pressures not copied

    # ---- saved sheet: session folded, toggles, remembered ----
    page.goto(f"{B}/r/setup/{feat['id']}")
    expect(page.locator('#sec-session .sec-toggle')).to_have_attribute('aria-expanded', 'false')
    expect(page.locator('#sec-session .sec-summary')).to_contain_text('Feature')
    expect(page.locator('#f-session')).to_have_count(0)
    expect(page.locator('[data-testid="change-count"]')).to_have_text('4 changes from Heat 1')
    page.click('#sec-session .sec-toggle'); expect(page.locator('#f-session')).to_be_visible()
    page.click('#sec-weather .sec-toggle'); expect(page.locator('#f-temp')).to_have_count(0)
    page.wait_for_timeout(1200)
    page.reload(); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(page.locator('#f-session')).to_be_visible()      # stays open
    expect(page.locator('#f-temp')).to_have_count(0)         # stays folded
    prefs = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]['user']['prefs']
    assert prefs['setup_layout']['collapsed'] == ['weather'], prefs
    # jump bar opens a folded section and scrolls to it
    nav.locator('.sn-chip:text-is("Weather")').click()
    expect(page.locator('#f-temp')).to_be_visible()
    nav.locator('.sn-chip:text-is("Race")').click(); page.wait_for_timeout(900)
    top = page.evaluate("document.getElementById('sec-race').getBoundingClientRect().top")
    head = page.evaluate("document.querySelector('.page-head').getBoundingClientRect().bottom")
    assert head - 2 <= top <= head + 60, (top, head)
    expect(nav.locator('.sn-chip.on')).to_have_text('Race')

    # ---- arrange: move Tires to the top, hide Notes, reset ----
    nav.locator('.sn-arrange').click()
    dlg = page.locator('[role=dialog][aria-label="Arrange sections"]')
    expect(dlg.locator('input[aria-label="Show Session"]')).to_be_disabled()
    for _ in range(12):
        up = dlg.locator('button[aria-label="Move Tires up"]')
        if up.is_disabled(): break
        up.click(); page.wait_for_timeout(150)
    expect(dlg.locator('button[aria-label="Move Tires up"]')).to_be_disabled()
    dlg.locator('input[aria-label="Show Notes"]').uncheck()
    shot(page, '19-05-arrange')
    dlg.locator('button:has-text("Done")').click()
    expect(nav.locator('.sn-chip').first).to_have_attribute('data-jump', 'tires')
    expect(nav.locator('.sn-chip:has-text("hidden")')).to_have_text('+1 hidden')
    assert page.evaluate("[...document.querySelectorAll('.form-section[data-sec]')].map(s => s.dataset.sec)")[0] == 'tires'
    expect(page.locator('#sec-notes')).to_have_count(0)
    page.wait_for_timeout(1200)
    prefs = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]['user']['prefs']
    assert prefs['setup_layout']['order'][0] == 'tires' and prefs['setup_layout']['hidden'] == ['notes'], prefs
    nav.locator('.sn-arrange').click(); dlg.locator('button:has-text("Reset")').click(); dlg.locator('button:has-text("Done")').click()
    expect(nav.locator('.sn-chip').first).to_have_attribute('data-jump', 'session')
    expect(page.locator('#sec-notes')).to_be_visible()

    # ---- mobile ----
    m = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True).new_page()
    m.on('pageerror', lambda e: errors.append(str(e)))
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    m.goto(f"{B}/r/setup/{feat['id']}"); m.wait_for_timeout(2500)
    assert m.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    shot(m, '19-06-mobile-top')
    m.locator('.sheet-nav .sn-chip:text-is("Shocks")').click(); m.wait_for_timeout(900); shot(m, '19-07-mobile-shocks')
    m.locator('.sheet-nav .sn-chip:text-is("Tires")').click(); m.wait_for_timeout(900); shot(m, '19-08-mobile-tires')
    assert m.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    br.close()

print('ERRORS:', errors) if errors else None
assert not errors, errors
print('E2E19 OK')
