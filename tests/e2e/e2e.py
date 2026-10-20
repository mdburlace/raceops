import os
import json, sys, time, urllib.request
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
TODAY = date.today().isoformat()
errors = []

def add_session(p, name):
    p.select_option('.add-session select', name)
    p.click('.add-session button:has-text("Add session")')

def shot(page, name):
    page.wait_for_timeout(400)
    page.screenshot(path=f'{OUT}/{name}.png', full_page=True)

def save(page):
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(300)

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(B)
    page.fill('input[type=email]', 'owner@test.com')
    page.fill('input[type=password]', 'password1')
    page.click('button:has-text("Sign in")')
    expect(page.locator('h1')).to_contain_text("G'day")
    shot(page, '01-dashboard-empty')

    # car
    page.goto(B + '/r/car/new'); page.fill('#f-number', '17'); page.fill('#f-name', 'Primary'); page.fill('#f-class', '410 Sprintcars')
    page.fill('#f-driver', 'M. Burlace'); save(page)
    expect(page.locator('.list-row')).to_contain_text('Primary')

    # assets
    def asset(name, cat, spec='', unit='Laps', limit=''):
        page.goto(B + '/r/asset/new'); page.fill('#f-name', name); page.select_option('#f-category', cat)
        page.select_option('#f-car', label='#17 Primary')
        if spec: page.fill('#f-spec', spec)
        page.select_option('#f-life_unit', unit)
        if limit: page.fill('#f-life_limit', str(limit))
        save(page)
    for c in ['LF', 'RF', 'LR', 'RR']:
        asset(f'{c} Shock #{c}1', 'Shock', 'Schatz 4-2', 'Laps', 40)
    for r in ['1000', '1050']:
        asset(f'Bar {r}', 'Torsion Bar', f'{r} lb/in', 'Laps', 400)
    asset('Engine 410-A', 'Engine', 'Fresh', 'Laps', 600)

    # event
    page.goto(B + '/r/event/new'); page.fill('#f-name', 'Spring Classic'); page.fill('#f-track', 'Archerfield Speedway'); page.fill('#f-date', TODAY)
    save(page)
    expect(page.locator('h1')).to_have_text('Spring Classic')
    add_session(page, "Hot Laps")
    page.fill('#f-temp', '24'); page.fill('#f-baro', '62'); page.fill('#f-alt', '120')
    page.select_option('#f-engine', label='Engine 410-A (Fresh)')
    page.fill('#f-main_jet', '42')
    for c in ['LF', 'RF', 'LR', 'RR']:
        page.select_option(f'#f-shocks-{c}', label=f'{c} Shock #{c}1 (Schatz 4-2)')
    page.select_option('#f-bars-LF', label='Bar 1000 (1000 lb/in)'); page.select_option('#f-bars-RF', label='Bar 1050 (1050 lb/in)')
    for i, val in enumerate(['4.5', '4.25', '5', '5.25']):
        page.fill(f'#f-ride_height-{["LF","RF","LR","RR"][i]}', val)
    page.fill('#f-wing_angle', '14')
    page.fill('#f-stagger_cold', '6')
    page.fill('#f-laps', '8'); page.fill('#f-fuel_start', '10'); page.fill('#f-fuel_finish', '8.5')
    expect(page.locator('.field:has(> .field-label > label:text("Fuel used")) .calc')).to_contain_text('1.5')
    shot(page, '02-setup-sheet-desktop')
    save(page)
    # carry forward into Heat 1
    add_session(page, "Heat 1")
    page.click('button:has-text("Copy this session")')
    expect(page.locator('.carry-bar')).to_contain_text('Started from')
    assert page.input_value('#f-ride_height-LF') == '4.5', 'carry forward failed'
    assert page.input_value('#f-temp') == '24', 'weather now carries'
    assert page.input_value('#f-laps') == '', 'race should not carry'
    page.fill('#f-ride_height-LF', '4.75'); page.fill('#f-wing_angle', '16'); page.fill('#f-laps', '10'); page.fill('#f-start', '6'); page.fill('#f-finish', '2')
    save(page)
    shot(page, '03-event-detail')
    page.click('a:has-text("Compare sessions")')
    expect(page.locator('tr.diff').first).to_be_visible()
    shot(page, '04-compare')

    # maintenance checklist
    page.goto(B + '/maintenance'); page.click('a:has-text("+ Every 2nd race")')
    page.fill('#f-completed_by', 'Jono')
    boxes = page.locator('.check-item input[type=checkbox]')
    for i in range(0, 12): boxes.nth(i).check()
    page.locator('.check-item:has-text("Toe out") input.num').fill('0.125')
    shot(page, '05-checklist-desktop')
    save(page)
    expect(page.locator('.list-row').first).to_contain_text('Every 2nd race')

    # schedule on LF shock
    page.goto(B + '/r/schedule/new'); page.fill('#f-name', 'Rebuild LF shock'); page.select_option('#f-applies_to', 'Asset')
    page.select_option('#f-asset', label='LF Shock #LF1'); page.fill('#f-interval', '2'); page.select_option('#f-interval_unit', 'Races')
    page.fill('#f-last_done', (date.today() - timedelta(days=30)).isoformat()); save(page)
    shot(page, '06-schedules')

    # measurements on LF shock
    page.goto(B + '/assets'); page.click('a.list-row:has-text("LF Shock #LF1")')
    for d, val in [(60, '152'), (30, '149'), (0, '141')]:
        page.click('a:has-text("+ Measurement")')
        page.fill('#f-date', (date.today() - timedelta(days=d)).isoformat()); page.select_option('#f-kind', 'Shock gas pressure')
        page.fill('#f-value', val); page.fill('#f-unit', 'psi'); page.fill('#f-spec_min', '145'); page.fill('#f-spec_max', '155')
        save(page)
    expect(page.locator('.chart svg')).to_be_visible()
    shot(page, '07-asset-detail')
    page.goto(B + '/assets'); shot(page, '08-assets')
    page.goto(B + '/'); shot(page, '09-dashboard')
    page.goto(B + '/roles'); page.click('button.list-row:has-text("Mechanic")'); shot(page, '10-roles')
    page.goto(B + '/forms'); page.click('a.list-row:has-text("Setup Sheet")'); shot(page, '11-form-builder')

    # form builder: add a field to the setup sheet and confirm it renders
    page.locator('.builder-section:has(.section-title[value="Chassis"]) button:has-text("+ Field")').click()
    page.locator('.builder-field.open .bf-label').fill('Front torsion stop')
    page.locator('.builder-field.open select').first.select_option('number')
    page.click('button:has-text("Save form")')
    page.wait_for_timeout(500)

    # invite flow
    page.goto(B + '/team/members')
    page.fill('input[type=email]', 'crew@test.com'); page.select_option('select:near(input[type=email])', label='Mechanic')
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    page.click('button:has-text("Create invite link")')
    page.wait_for_timeout(800)
    token = page.evaluate('navigator.clipboard.readText()').split('/invite/')[1]

    # ---- offline: queue a change, reload with no network, sync when back ----
    page.goto(B + '/maintenance'); page.wait_for_timeout(1500)
    ctx.set_offline(True)
    page.reload()  # app shell from service worker
    expect(page.locator('.sync-badge')).to_contain_text('Offline')
    page.click('a:has-text("+ Weekly")')
    page.fill('#f-completed_by', 'Offline Ollie'); page.locator('.check-item input[type=checkbox]').first.check()
    save(page)
    expect(page.locator('.sync-badge')).to_contain_text('queued')
    shot(page, '12-offline-queued')
    ctx.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    expect(page.locator('.sync-badge')).to_have_text('Synced', timeout=15000)
    sess = json.loads(page.evaluate("localStorage.getItem('raceops.session')"))

    # ---- mobile & tablet ----
    for name, vp in [('mobile', {'width': 390, 'height': 844}), ('tablet', {'width': 820, 'height': 1180})]:
        m = br.new_context(viewport=vp, device_scale_factor=2, is_mobile=name == 'mobile', has_touch=True)
        mp = m.new_page(); mp.on('pageerror', lambda e: errors.append(str(e)))
        mp.goto(B); mp.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
        mp.goto(B); mp.wait_for_timeout(2500)
        shot(mp, f'20-{name}-dashboard')
        mp.goto(B + '/setups'); mp.click('a:has-text("Heat 1")'); mp.wait_for_timeout(600)
        mp.screenshot(path=f'{OUT}/21-{name}-setup.png')
        shot(mp, f'21-{name}-setup-full')
        mp.goto(B + '/maintenance'); mp.locator('a.list-row').last.click(); shot(mp, f'22-{name}-checklist')
        mp.goto(B + '/assets'); shot(mp, f'23-{name}-assets')
        if name == 'mobile':
            mp.click('.menu-btn'); mp.wait_for_timeout(300); mp.screenshot(path=f'{OUT}/24-mobile-drawer.png')
        m.close()

    # ---- accept invite as new crew member (Mechanic: setups read-only) ----
    c2 = br.new_context(viewport={'width': 390, 'height': 844}); p2 = c2.new_page()
    p2.on('pageerror', lambda e: errors.append(str(e)))
    p2.goto(f'{B}/invite/{token}')
    p2.fill('input:not([type=password])', 'Crew Member'); p2.fill('input[type=password]', 'password2')
    p2.click('button:has-text("Join team")')
    expect(p2.locator('h1')).to_contain_text("G'day", timeout=10000)
    p2.wait_for_timeout(2000)
    p2.goto(B + '/setups'); p2.click('a:has-text("Heat 1")')
    expect(p2.locator('.notice')).to_contain_text('read-only')
    assert p2.locator('.save-bar').count() == 0
    shot(p2, '25-mechanic-readonly-setup')
    br.close()

print('console/page errors:', errors[:10])
print('OK')
