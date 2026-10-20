import os
import json, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []

def api(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    return json.loads(urllib.request.urlopen(req).read())

def shot(page, name, full=True):
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def save(page):
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(400)

o = api('/auth/login', body={'email': 'owner@test.com', 'password': 'password1'}, method='POST')
sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'tenantId': o['memberships'][0]['tenant_id']}

KENCO = """10.0 in/s:1.002 in - KSS 1400 LR adj reb avg set 10
Speed:10.0 in/s Amplitude:1.002 in
Speed (in/s)  CC (lbs)  RO (lbs)  RC (lbs)  CO (lbs)
0.0 10.5 10.5 -435.0 -435.0
1.0 23.8 -89.3 -630.8 -62.1
2.0 41.5 -478.9 -715.5 20.9
3.0 63.5 -777.5 -761.8 55.0
5.0 109.2 -856.7 -824.4 107.6
7.0 138.5 -895.7 -877.6 136.1
9.8 163.5 -942.5 -942.5 162.8
10.0 NaN NaN NaN NaN
Constant Value
Amplitude 1.002 in
10.0 in/s:1.002 in - KSS 1400 LR adj reb avg set 20
Speed (in/s)  CC (lbs)  RO (lbs)  RC (lbs)  CO (lbs)
0.0 8.2 8.2 -37.3 -37.3
1.0 21.8 -59.8 -166.3 10.6
2.0 39.2 -169.2 -351.4 31.9
3.0 62.1 -335.3 -547.8 49.5
5.0 109.4 -759.4 -741.4 107.4
7.0 136.8 -834.9 -815.2 134.4
9.8 160.2 -890.0 -889.7 161.1
10.0 in/s:1.002 in - KSS 1400 LR adj reb avg set 30
Speed (in/s)  CC (lbs)  RO (lbs)  RC (lbs)  CO (lbs)
0.0 5.8 5.8 -29.8 -29.8
1.0 20.0 -48.2 -77.1 9.5
2.0 37.7 -104.9 -169.1 28.8
3.0 60.9 -192.1 -302.6 52.6
5.0 107.7 -503.5 -584.0 98.7
7.0 136.3 -780.1 -749.8 132.3
9.8 160.8 NaN NaN 159.5"""

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # car: assign gear list + R&P
    page.goto(B + '/cars'); page.click('a.grow:has-text("Primary")')
    page.select_option('#f-gear_list', label='10-Spline Quick Change (standard)'); page.fill('#f-rp_ratio', '4.86'); save(page)

    # gear chart: team owns 15A, 7, 19, 13; 13 not for car #17
    page.goto(B + '/track/gears?tab=chart'); page.wait_for_timeout(800)
    for s in ['15A', '7', '19', '13']:
        q = page.locator(f'input[aria-label="Team quantity for set {s}"]'); q.fill('1'); q.press('Enter'); page.wait_for_timeout(300)
    cb = page.locator('input[aria-label="Set 13 available for #17 Primary"]')
    if cb.is_checked(): cb.click()
    expect(cb).not_to_be_checked()
    expect(page.locator('tr.owned')).to_have_count(4)
    shot(page, 'p3-01-gear-chart', full=False)

    # calculator
    page.goto(B + '/track/gears'); page.wait_for_timeout(800)
    page.select_option('#cur-set', label='8 (22/26)'); page.select_option('#cur-pos', 'Low'); page.fill('#cur-rpm', '8000')
    page.fill('#t-ratio', '4.30')
    first = page.locator('table.gear-results tbody tr').first
    expect(first).to_contain_text('7'); expect(first).to_contain_text('4.297')
    assert page.locator('table.gear-results tbody tr').count() == 6, page.locator('table.gear-results tbody tr').count()  # 3 available sets x low/high
    shot(page, 'p3-02-calc-target-ratio')
    page.click('.seg button:has-text("Change rpm")'); page.fill('#t-rpm', '+200')
    expect(page.locator('table.gear-results tbody tr').first).to_contain_text('23/26')
    page.click('.seg button:has-text("Try a gear set")'); page.select_option('#try-set', label='15A (21/22)')
    txt = page.locator('.try-result').inner_text(); print('try 15A:', txt.replace('\n', ' | '))
    assert '4.636' in txt and '9025' in txt, txt
    shot(page, 'p3-03-calc-try')
    page.click('.seg button:has-text("Hit a final drive")'); page.select_option('select:near(:text("Ring & pinion"))', 'all')
    page.uncheck('text=Only sets available for this car'); page.fill('#t-ratio', '5.40'); page.wait_for_timeout(300)
    print('compare all R&P best:', page.locator('table.gear-results tbody tr').first.inner_text().replace('\t', ' '))

    # midget list by paste
    page.goto(B + '/track/gears?tab=lists'); page.click('a:has-text("New gear list")')
    page.fill('#f-name', 'Midget quick change')
    page.locator('.field:has(> .field-label > label:text-is("Sets")) button:has-text("Paste / import")').click()
    page.fill('.field:has(> .field-label > label:text-is("Sets")) textarea', '1 18/18\n2 17/19\n3 16/20\n4 15/21 low hp only')
    page.click('.field:has(> .field-label > label:text-is("Sets")) button:has-text("Replace")')
    page.fill('input[aria-label="Name row 1"]', '5.83'); page.fill('input[aria-label="Pinion teeth row 1"]', '6'); page.fill('input[aria-label="Ring teeth row 1"]', '35')
    save(page)
    expect(page.locator('.list-row:has-text("Midget")').first).to_contain_text('4 sets')

    # adjustable shock: mark the LR shock as four-way, then a sweep run from the Kenco printout
    page.goto(B + '/assets'); page.click('a.list-row:has-text("LR Shock")'); page.click('a:has-text("Edit")')
    page.select_option('#f-adjust_type', 'Single adjustable'); save(page)
    page.goto(B + '/workshop/dyno'); page.click('a:has-text("New shock run")')
    page.select_option('#f-asset', label='LR Shock #LR1')
    page.click('button[aria-label="Remove 3.00"]'); page.click('button[aria-label="Remove 6.00"]')
    expect(page.locator('#f-adjust_type')).to_have_value('Single adjustable')  # copied from the asset when chosen? (set via asset param only)
    page.fill('#f-label', 'KSS 1400 LR adj rebound sweep'); page.select_option('#f-adjust_unit', 'Set number')
    page.click('button:has-text("Paste whole printout")'); page.fill('.sweep textarea', KENCO); page.click('.sweep button:has-text("Replace")')
    expect(page.locator('.sweep-item')).to_have_count(3)
    for i, n in enumerate(['10', '20', '30']):
        page.fill(f'input[aria-label="Setting {i+1} Adjuster"]', n)
    page.fill('input[aria-label="Setting 1 note"]', 'Heavy / rough track')
    page.fill('input[aria-label="Setting 3 note"]', 'Slick track')

    expect(page.locator('.chart svg polyline')).to_have_count(6)
    shot(page, 'p3-04-adjustable-dyno')
    save(page)
    # four-way with CSI-style notes only
    page.goto(B + '/workshop/dyno'); page.click('a:has-text("New shock run")')
    page.select_option('#f-asset', label='RF Shock #RF1'); page.fill('#f-label', 'CSI 4-way guide'); page.select_option('#f-adjust_type', 'Four-way')
    page.click('button[aria-label="Remove 3.00"]'); page.click('button[aria-label="Remove 6.00"]')
    page.select_option('#f-adjust_unit', 'Clicks open')
    page.click('button:has-text("+ Setting")'); page.fill('input[aria-label="Setting 1 label"]', '3 CL OP')
    for a, val in [('LS comp', '3'), ('HS comp', '5'), ('LS reb', '2'), ('HS reb', '4')]:
        page.fill(f'input[aria-label="Setting 1 {a}"]', val)
    page.fill('input[aria-label="Setting 1 note"]', 'Good if rough, heavy')
    shot(page, 'p3-05-four-way')
    save(page)
    page.goto(B + '/workshop/dyno'); expect(page.locator('.list-row').first).to_contain_text('Four-way · 1 settings')

    # setup sheet shows new gear + adjuster fields
    page.goto(B + '/setups'); page.click('a:has-text("Heat 1")')
    page.select_option('#f-gear', label='7 (23/26)'); page.select_option('#f-gear_orientation', 'Low'); expect(page.locator('.field:has(> .field-label > label:text("Final drive")) .calc')).to_have_text('4.299')
    page.fill('#f-shock_adjust-LR-Adjuster', '20'); save(page)  # single adjustable → one labelled input

    # mobile
    m = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p3 = m.new_page(); p3.on('pageerror', lambda e: errors.append(str(e)))
    p3.goto(B); p3.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    p3.goto(B + '/track/gears'); p3.wait_for_timeout(2500)
    p3.select_option('#cur-set', label='8 (22/26)'); p3.fill('#t-ratio', '4.30'); shot(p3, 'p3-10-mobile-calc')
    p3.goto(B + '/workshop/dyno'); p3.wait_for_timeout(800); p3.locator('a.grow:has-text("KSS 1400")').click(); p3.wait_for_timeout(800)
    shot(p3, 'p3-11-mobile-sweep')
    br.close()

print('errors:', errors[:10])
print('OK')
