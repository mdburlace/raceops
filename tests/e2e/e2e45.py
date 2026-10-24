# Setup sheet changes and the quick add screen: Block height (was Blocked) and Turns per corner, chassis rake
# and tilt, RR radius rod, the Jacobs ladder and birdcage angles, the three rpm readings; the quick add screen
# opened by a long press (and by right-click) on a setup sheet number box — keypad, sixteenths, common values,
# the keyboard, Pick for angles and the angle finder (tilt sensor, Zero, Flip) — saving to the sheet; no
# quick add on a read-only sheet; a workshop setup's block heights and turns going to a track sheet; a phone.
import json, os, re, sys, time, urllib.request, urllib.error
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

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Quick Add Racing', 'plan': 'pro', 'practice': True}); assert st == 200, t; TID = t['id']
o = login(); OT = o['token']
RUN = TID[:6]
roles = call(f'/t/{TID}/roles', OT)[1]
viewer = next(r for r in roles if r['name'] == 'Viewer')
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': f'viewer45+{RUN}@test.com', 'role_id': viewer['id']})
assert call(f'/invites/{inv["token"]}/accept', method='POST', body={'name': 'Viewer', 'password': 'password45'})[0] == 200
VW = login(f'viewer45+{RUN}@test.com', 'password45')
recs = lambda tok=OT: [r for r in call(f'/t/{TID}/sync?since=0', tok)[1]['records'] if not r['global'] and not r['deleted']]
R = recs()
tonight = next(r for r in R if r['type'] == 'event' and r['data']['values'].get('name') == 'Valley Speedway — Club night')
heat1 = next(r for r in R if r['type'] == 'setup' and r['data']['values'].get('event') == tonight['id'] and r['data']['values'].get('session') == 'Heat 1')
rec = lambda id: next(r for r in recs() if r['id'] == id)
def until(fn, secs=15):
    end = time.time() + secs
    while True:
        try:
            if fn(): return
        except (KeyError, TypeError, StopIteration): pass
        if time.time() > end: raise AssertionError('timed out waiting')
        time.sleep(0.5)

# the form: the new and renamed fields (every team's setup form is upgraded)
form = next(r for r in R if r['type'] == 'form' and r['data'].get('target') == 'setup')
fields = {f['key']: f for s in form['data']['sections'] for f in s['fields']}
assert fields['blocked']['label'] == 'Block height' and fields['blocked']['unit'] == 'in'
assert fields['turns']['type'] == 'corners' and fields['turns']['corners'] == ['LF', 'RF', 'LR', 'RR']
assert fields['birdcage_angle']['corners'] == ['LR', 'RR'] and fields['birdcage_angle']['unit'] == '°'
for k in ('rake', 'tilt', 'rr_radius_rod', 'jl_length', 'jl_upper_strap', 'jl_lower_strap', 'jl_mount_upper', 'jl_mount_lower', 'jl_birdcage_mount', 'rpm_max'):
    assert k in fields, k
assert fields['tach_high']['label'] == 'High RPM (straights)' and fields['tach_low']['label'] == 'Low RPM (corners)' and fields['rpm_max']['stage'] == 'after'
chassis = [f['key'] for s in form['data']['sections'] if s['id'] == 'chassis' for f in s['fields']]
assert chassis.index('turns') == chassis.index('blocked') + 1 and chassis.index('rr_radius_rod') == chassis.index('lr_radius_rod') + 1, chassis
shop_form = next(r for r in R if r['type'] == 'form' and r['data'].get('target') == 'shop_setup')
sf = {f['key']: f for s in shop_form['data']['sections'] for f in s['fields']}
assert sf['front_turns']['maps'] == 'turns' and sf['rear_turns']['maps'] == 'turns' and sf['block_heights']['maps'] == 'blocked'
assert 'rr_radius_rod' in sf and 'jl_length' in sf and 'birdcage_angle' in sf and 'rake' in sf

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    def session(lg):
        s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': TID}
        page.goto(B); page.wait_for_load_state('networkidle'); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    shot = lambda n: page.screenshot(path=f'{OUT}/{n}.png', full_page=True)
    def hold(sel, ms=750):
        page.locator(sel).scroll_into_view_if_needed()
        box = page.locator(sel).bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.mouse.down(); page.wait_for_timeout(ms); page.mouse.up()
    qa = page.locator('[data-testid="quick-add"]')
    disp = page.locator('[data-testid="qa-display"]')
    session(o)

    page.goto(B + f'/r/setup/{heat1["id"]}')
    main = page.locator('main')
    for label in ('Block height', 'Turns', 'Chassis rake', 'Chassis tilt', 'RR radius rod (front mount)', 'Jacobs ladder length', 'Upper strap length',
                  'Lower strap length', 'Chassis mount (upper)', 'Chassis mount (lower)', 'Birdcage mount', 'Birdcage angle',
                  'Low RPM (corners)', 'High RPM (straights)', 'Highest RPM (overall)'):
        expect(main).to_contain_text(label)
    expect(main).not_to_contain_text('Blocked')

    # ---- a long press on LF Block height: keypad, sixteenths and the team's common values
    hold('#f-blocked-LF')
    expect(qa).to_be_visible()
    expect(qa.locator('.qa-title')).to_contain_text('Enter LF Block height')
    expect(page.locator('[data-testid="qa-common"]')).to_contain_text('1.5')
    expect(disp).to_contain_text('1.5')                 # the box's value to start with
    qa.get_by_role('button', name='Clear').click()
    qa.get_by_role('button', name='1', exact=True).click()
    qa.get_by_role('button', name='plus 3/8').click()
    expect(disp).to_contain_text('1.375')
    expect(page.locator('[data-testid="qa-frac"]')).to_contain_text('1 3/8')
    qa.get_by_role('button', name='plus 1/4').click()       # sets the fraction, keeps the whole number
    expect(disp).to_contain_text('1.25')
    expect(qa.locator('.qa-fbtn')).to_have_count(15)
    shot('45-01-fractions')
    qa.get_by_role('button', name='OK').click()
    expect(qa).to_have_count(0)
    expect(page.locator('#f-blocked-LF')).to_have_value('1.25')

    # ---- right-click RR Turns; typing on the keyboard works too
    page.locator('#f-turns-RR').click(button='right')
    expect(qa.locator('.qa-title')).to_contain_text('Enter RR Turns')
    qa.get_by_role('button', name='Clear').click()
    page.keyboard.type('4'); qa.get_by_role('button', name='plus 1/2').click()
    expect(disp).to_contain_text('4.5')
    page.keyboard.press('Enter')
    expect(page.locator('#f-turns-RR')).to_have_value('4.5')
    # Cancel leaves the box as it was; a common value fills it in
    hold('#f-turns-LF')
    expect(page.locator('[data-testid="qa-common"]')).to_contain_text('3')
    qa.get_by_role('button', name='Clear').click(); page.keyboard.type('9')
    qa.get_by_role('button', name='Cancel').click()
    expect(page.locator('#f-turns-LF')).to_have_value('3')

    # ---- a plain number: the keypad, backspace and +/−
    hold('#f-rpm_max')
    expect(qa.locator('.qa-title')).to_contain_text('Enter Highest RPM (overall)')
    expect(qa.locator('.qa-fbtn')).to_have_count(0)        # no fractions for rpm
    for k in '87500': qa.get_by_role('button', name=k, exact=True).click()
    qa.get_by_role('button', name='Backspace').click()
    expect(disp).to_contain_text('8750')
    qa.get_by_role('button', name='OK').click()
    expect(page.locator('#f-rpm_max')).to_have_value('8750')

    # ---- wing angle: Pick from the list
    hold('#f-wing_angle')
    expect(qa.locator('.qa-title')).to_contain_text('Enter Top wing angle')
    expect(page.locator('[data-testid="qa-pick"]')).to_be_visible()
    page.locator('[data-testid="qa-pick"] button', has_text=re.compile(r'^14\.5°$')).click()
    expect(disp).to_contain_text('14.5')
    shot('45-02-pick')
    qa.get_by_role('button', name='OK').click()
    expect(page.locator('#f-wing_angle')).to_have_value('14.5')

    # ---- chassis rake: the angle finder reads the tilt sensor; Zero sets level
    tilt = lambda b: page.evaluate(f"window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {{ alpha: 0, beta: {b}, gamma: 0 }}))")
    hold('#f-rake')
    qa.get_by_role('button', name='Angle finder').click()
    finder = page.locator('[data-testid="angle-finder"]')
    expect(finder).to_be_visible()
    tilt(2)
    expect(page.locator('[data-testid="angle-reading"]')).to_have_text('2.0°')
    finder.get_by_role('button', name='Zero').click()
    expect(page.locator('[data-testid="angle-reading"]')).to_have_text('0.0°')
    for _ in range(40): tilt(3.5)
    expect(page.locator('[data-testid="angle-reading"]')).to_have_text('1.5°')
    finder.get_by_role('button', name='Flip +/−').click()
    expect(page.locator('[data-testid="angle-reading"]')).to_have_text('-1.5°')
    finder.get_by_role('button', name='Flip +/−').click()
    shot('45-03-angle-finder')
    finder.get_by_role('button', name='Use this angle').click()
    expect(qa).to_have_count(0)
    expect(page.locator('#f-rake')).to_have_value('1.5')
    # the zero is kept while the app is open: LR birdcage angle reads from it too
    hold('#f-birdcage_angle-LR')
    qa.get_by_role('button', name='Angle finder').click()
    for _ in range(40): tilt(-1)
    expect(page.locator('[data-testid="angle-reading"]')).to_have_text('-3.0°')
    finder.get_by_role('button', name='Reset zero').click()
    expect(page.locator('[data-testid="angle-reading"]')).to_have_text('-1.0°')
    finder.get_by_role('button', name='Use this angle').click()
    expect(page.locator('#f-birdcage_angle-LR')).to_have_value('-1')

    # ---- typed straight in, the new text fields
    page.fill('#f-rr_radius_rod', 'hole 2')
    page.fill('#f-jl_mount_upper', 'hole 3')
    page.get_by_role('button', name='Save', exact=True).first.click()
    until(lambda: rec(heat1['id'])['data']['values'].get('rpm_max') == '8750')
    v = rec(heat1['id'])['data']['values']
    assert v['blocked']['LF'] == '1.25' and v['blocked']['RF'] == '1.375', v['blocked']
    assert v['turns']['RR'] == '4.5' and v['turns']['LF'] == '3', v['turns']
    assert v['wing_angle'] == '14.5' and v['rake'] == '1.5' and v['birdcage_angle']['LR'] == '-1', v
    assert v['rr_radius_rod'] == 'hole 2' and v['jl_mount_upper'] == 'hole 3', v

    # ---- a phone: the quick add screen fills the bottom of the screen
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(B + f'/r/setup/{heat1["id"]}')
    page.locator('#f-ride_height-RR').scroll_into_view_if_needed()
    hold('#f-ride_height-RR')
    expect(qa.locator('.qa-title')).to_contain_text('Enter RR Ride height')
    page.screenshot(path=f'{OUT}/45-04-phone.png')
    sw = page.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, sw
    qa.get_by_role('button', name='Cancel').click()
    page.set_viewport_size({'width': 1366, 'height': 900})

    # ---- a viewer's read-only sheet has no quick add
    session(VW)
    page.goto(B + f'/r/setup/{heat1["id"]}')
    expect(page.locator('main')).to_contain_text('Block height')
    expect(page.locator('input[data-quick]')).to_have_count(0)
    br.close()

assert not errors, errors
print('E2E45 OK')
