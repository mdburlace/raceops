import os
import json, sys, uuid, urllib.request
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []


def open_sec(page, sid='session'):
    page.wait_for_selector(f'#sec-{sid}', timeout=15000)
    t = page.locator(f'#sec-{sid} .sec-toggle[aria-expanded="false"]')
    if t.count(): t.click()

def api(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    return json.loads(urllib.request.urlopen(req).read())

def shot(page, name, full=True):
    page.wait_for_timeout(400)
    page.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def save(page):
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(600)

def pick(page, sel, text):
    page.wait_for_selector(f'datalist#dl-{sel[1:]} option', state='attached')
    page.wait_for_timeout(300)
    opts = page.eval_on_selector_all(f'datalist#dl-{sel[1:]} option', 'els => els.map(e => e.value)')
    hit = next(o for o in opts if text in o)
    page.fill(sel, hit)
    return hit

o = api('/auth/login', body={'email': 'owner@test.com', 'password': 'password1'}, method='POST')
T, TID = o['token'], o['memberships'][0]['tenant_id']
sess = {'token': T, 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': TID}

# an event made before events had a car
legacy = str(uuid.uuid4())
api(f'/t/{TID}/sync', T, 'POST', {'changes': [{'id': legacy, 'type': 'event', 'deleted': False, 'client_updated_at': '2026-10-18T00:00:00Z',
    'data': {'values': {'name': 'Old club night', 'track': 'Archerfield Speedway', 'date': (date.today() - timedelta(days=30)).isoformat()}}}]})

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- new event: track from the directory fills the details; car defaults to the only car ----
    page.goto(B + '/r/event/new')
    expect(page.locator('#f-name')).to_be_visible()
    expect(page.locator('#f-track')).to_have_count(1)          # free-text name only while no directory track is picked
    page.fill('#f-name', 'Lismore Sprintcar Spectacular')
    label = pick(page, '#f-venue', 'Lismore Speedway')
    expect(page.locator('#f-track')).to_have_count(0)
    expect(page.locator('#f-location')).to_have_value('Lismore, NSW, Australia')
    expect(page.locator('#f-track_length')).to_have_value('400m')
    expect(page.locator('#f-surface')).to_have_value('Clay oval')
    expect(page.locator('#f-car')).to_have_value(page.locator('#f-car option:has-text("#17")').get_attribute('value'))
    page.fill('#f-date', (date.today() + timedelta(days=10)).isoformat())
    shot(page, 'p7-01-new-event')
    save(page)

    # ---- event page: only the car, sessions added one at a time ----
    expect(page.locator('h1')).to_have_text('Lismore Sprintcar Spectacular')
    expect(page.locator('.car-chip')).to_contain_text('#17')
    expect(page.locator('.track-facts')).to_contain_text('Lismore, NSW, Australia · 400m · Clay oval')
    expect(page.locator('.event-car')).to_have_count(1)
    expect(page.locator('.session-cell')).to_have_count(0)
    expect(page.locator('.add-session select')).to_have_value('Hot Laps')      # next preset suggested
    shot(page, 'p7-02-event-empty', full=False)
    page.click('.add-session button:has-text("Add session")')
    expect(page.locator('#f-session')).to_have_value('Hot Laps')
    page.click('.start-opt:has-text("Blank sheet")'); page.fill('#f-temp', '27'); save(page)
    expect(page.locator('.add-session select')).to_have_value('Qualifying')
    # a session name that isn't in the list
    page.select_option('.add-session select', '__other')
    page.fill('input[aria-label="Session name"]', 'Test & tune')
    page.click('.add-session button:has-text("Add session")')
    expect(page.locator('#f-session')).to_have_value('Test & tune')
    expect(page.locator('select[aria-label="Session to copy"] option:checked')).to_have_text('Hot Laps (previous)')
    page.click('button:has-text("Copy this session")')
    expect(page.locator('#f-temp')).to_have_value('27'); page.fill('#f-temp', '30'); save(page)
    expect(page.locator('.session-cell .sn')).to_have_text(['Hot Laps', 'Test & tune'])

    # ---- choose which session to copy: default is the previous one, pick another ----
    page.select_option('.add-session select', 'Heat 1'); page.click('.add-session button:has-text("Add session")')
    expect(page.locator('select[aria-label="Session to copy"] option:checked')).to_have_text('Test & tune (previous)')
    shot(page, 'p7-04-copy-choice', full=False)
    page.select_option('select[aria-label="Session to copy"]', label='Hot Laps')
    page.click('button:has-text("Copy this session")')
    expect(page.locator('.carry-bar')).to_contain_text('Hot Laps')
    expect(page.locator('#f-temp')).to_have_value('27')
    save(page)
    expect(page.locator('.session-cell .sn')).to_have_text(['Hot Laps', 'Test & tune', 'Heat 1'])

    # ---- reorder: Heat 1 actually ran before the test session ----
    page.click('button:has-text("Reorder")')
    page.click('button[aria-label="Move Heat 1 earlier"]')
    expect(page.locator('.session-cell .sn')).to_have_text(['Hot Laps', 'Heat 1', 'Test & tune'])
    shot(page, 'p7-05-reorder', full=False)
    page.click('button:has-text("Done")')

    # ---- a missed standard session slots into place, and copies from the one before it ----
    page.select_option('.add-session select', 'Qualifying'); page.click('.add-session button:has-text("Add session")')
    expect(page.locator('select[aria-label="Session to copy"] option:checked')).to_have_text('Hot Laps (previous)')
    page.click('button:has-text("Copy this session")'); save(page)
    expect(page.locator('.session-cell .sn')).to_have_text(['Hot Laps', 'Qualifying', 'Heat 1', 'Test & tune'])
    expect(page.locator('.add-session option:has-text("Hot Laps — added")')).to_have_count(1)
    shot(page, 'p7-03-event-sessions')
    # a sheet's previous session follows the running order, not when it was entered
    page.click('a.session-cell:has-text("Heat 1")')
    expect(page.locator('select[aria-label="Copy from"] option:has-text("(previous)")')).to_have_text('Qualifying (previous)')
    page.go_back()

    # ---- the setup sheet's session accepts a typed name too ----
    page.click('a.session-cell:has-text("Test & tune")')
    page.fill('#f-session', 'Test & tune 2'); save(page)
    expect(page.locator('.session-cell .sn')).to_have_text(['Hot Laps', 'Qualifying', 'Heat 1', 'Test & tune 2'])

    # ---- changing the track on an existing event refreshes its details ----
    page.click('a:has-text("Edit event")')
    pick(page, '#f-venue', 'Archerfield')
    loc = page.input_value('#f-location'); assert 'QLD' in loc, loc
    page.fill('#f-location', loc + ' (Brisbane)')   # still editable
    save(page)
    expect(page.locator('.track-facts')).to_contain_text('(Brisbane)')

    # ---- an event without a car asks for one ----
    page.goto(B + f'/events/{legacy}')
    expect(page.locator('.card:has-text("Which car is racing")')).to_be_visible()
    page.select_option('select[aria-label="Car for this event"]', label='#17 Primary')
    page.click('button:has-text("Set car")')
    expect(page.locator('.car-chip')).to_contain_text('#17')
    expect(page.locator('.add-session')).to_be_visible()

    # event list shows the car
    page.goto(B + '/events'); expect(page.locator('a.list-row:has-text("Lismore Sprintcar")')).to_contain_text('#17')

    # mobile
    mp = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    mp.on('pageerror', lambda e: errors.append(str(e)))
    mp.goto(B); mp.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    mp.goto(B + '/events'); expect(mp.locator('text=Synced')).to_be_visible(timeout=30000)
    mp.click('a.list-row:has-text("Lismore Sprintcar")'); mp.select_option('.add-session select', '__other')
    mp.fill('input[aria-label="Session name"]', 'Last chance'); shot(mp, 'p7-10-mobile-event', full=False)
    w = mp.evaluate('document.documentElement.scrollWidth'); assert w <= 391, w
    mp.goto(B + '/r/event/new'); mp.wait_for_timeout(800); shot(mp, 'p7-11-mobile-new-event')
    br.close()

print('errors:', errors[:10])
print('OK')
