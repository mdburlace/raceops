import os
import json, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []


def open_sec(page, sid='session'):
    page.wait_for_selector(f'#sec-{sid}', timeout=15000)
    t = page.locator(f'#sec-{sid} .sec-toggle[aria-expanded="false"]')
    if t.count(): t.click()

def add_session(p, name):
    p.select_option('.add-session select', name)
    p.click('.add-session button:has-text("Add session")')

def api(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    return json.loads(urllib.request.urlopen(req).read())

def shot(page, name, full=True):
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def save(page):
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(600)

def add_tag(page, key, tag):
    page.locator(f'.field:has(#f-{key}) .quick-tags button:has-text("+ {tag}")').first.click()

o = api('/auth/login', body={'email': 'owner@test.com', 'password': 'password1'}, method='POST')
sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'tenantId': o['memberships'][0]['tenant_id']}

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B + '/profile'); page.wait_for_timeout(1500)
    page.click('button:has-text("Re-download all data")'); page.wait_for_timeout(5000)

    # tracks
    page.goto(B + '/tracks?tab=all'); page.wait_for_timeout(800)
    expect(page.locator('.page-header .sub')).to_contain_text('705 tracks')
    page.select_option('select[aria-label=Status]', ''); page.fill('input[type=search]', 'Brobenah')
    expect(page.locator('.card.list .list-row')).to_have_count(1)
    page.fill('input[type=search]', 'Lismore')
    print('Lismore rows:', page.locator('.card.list .list-row').all_inner_texts())

    # previous sheet: fill feedback, gear, hot values, baseline
    page.goto(B + '/events'); page.click('a.list-row:has-text("Easter Spectacular")'); page.click('.tabs button:has-text("Day 2")')
    page.click('a.session-cell.has:has-text("Heat 1")'); page.wait_for_timeout(500)
    page.select_option('#f-gear', label='7 (23/26)'); page.select_option('#f-gear_orientation', 'Low')
    expect(page.locator('.field:has(> .field-label > label:text("Final drive")) .calc')).to_have_text('4.299')
    page.fill('#f-temp', '22'); page.fill('#f-ride_height-LF', '4.6'); page.fill('#f-pressure_hot-LF', '15'); page.fill('#f-stagger_hot', '6.5'); page.fill('#f-travel-LF', '3.1')
    page.fill('#f-start', '7'); page.fill('#f-finish', '3')
    add_tag(page, 'track_conditions', 'Slick'); add_tag(page, 'track_conditions', 'Rubbered up')
    add_tag(page, 'driver_feel', 'Loose exit'); add_tag(page, 'driver_feel', 'No drive off')
    add_tag(page, 'crew_feel', 'Loose exit')
    page.fill('#f-driver_comments', 'Car pushes into 3 then steps out on exit, no bite off the cushion')
    page.fill('#f-crew_comments', 'Wheel spin off 2, RR looks hot')
    page.fill('#f-changes_next', 'Softer RR bar, +1 stagger')
    page.check('#f-baseline'); page.fill('#f-baseline_name', 'Archerfield slick')
    shot(page, 'p5-01-feedback-baseline')
    save(page)

    # new sheet in the same event -> chooser -> previous session
    add_session(page, "Feature")
    expect(page.locator('.start-from')).to_be_visible()
    shot(page, 'p5-02-start-from', full=False)
    page.click('button:has-text("Copy this session")')
    checks = {
        'ride_height-LF': '4.6', 'temp': '22', 'pressure_hot-LF': '', 'stagger_hot': '', 'travel-LF': '', 'start': '', 'finish': '',
    }
    for k, want in checks.items():
        got = page.input_value(f'#f-{k}')
        assert got == want, (k, got, want)
    assert not page.is_checked('#f-baseline')
    assert page.locator('.field:has(#f-track_conditions) .tags-input .chip.active').count() == 0
    expect(page.locator('.field:has(> .field-label > label:text("Final drive")) .calc')).to_have_text('4.299')
    expect(page.locator('.carry-bar')).to_contain_text('hot values, travel, race, feedback and notes left blank')
    save(page)

    # recall baseline at another event
    page.goto(B + '/events'); page.click('a.list-row:has-text("Club night")')
    page.select_option('select.baseline-pick', label='Archerfield slick')
    expect(page.locator('.carry-bar')).to_contain_text('baseline')
    assert page.input_value('#f-ride_height-LF') == '4.6'
    save(page)

    # search
    page.goto(B + '/setups?tab=search')
    page.click('.chips button:has-text("Slick")')
    expect(page.locator('.search-hit')).to_have_count(1)
    page.click('.chips button:has-text("Loose exit")')
    page.fill('input[placeholder^="Search comments"]', 'cushion')
    expect(page.locator('.search-hit mark')).to_have_text('cushion')
    shot(page, 'p5-03-search')
    page.goto(B + '/setups?tab=baselines'); expect(page.locator('.list-row')).to_have_count(1)

    # mobile
    m = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p3 = m.new_page(); p3.on('pageerror', lambda e: errors.append(str(e)))
    p3.goto(B); p3.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    p3.goto(B + '/events'); p3.wait_for_timeout(5000); p3.click('a.list-row:has-text("Easter Spectacular")'); p3.click('.tabs button:has-text("Day 2")')
    add_session(p3, "Dash"); p3.wait_for_timeout(800); shot(p3, 'p5-10-mobile-start', full=False)
    p3.click('button:has-text("Copy this session")'); p3.locator('#f-track_conditions').scroll_into_view_if_needed(); p3.wait_for_timeout(300)
    p3.screenshot(path=f'{OUT}/p5-11-mobile-feedback.png')
    br.close()

print('errors:', errors[:10])
print('OK')
