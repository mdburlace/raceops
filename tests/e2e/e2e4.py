import os
import json, sys, urllib.request
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []
TODAY = date.today()


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
    page.wait_for_timeout(500)

def pick(page, sel, text):
    """RefSearch: type the full label of an option."""
    opts = page.eval_on_selector_all(f'datalist#dl-{sel[1:]} option', 'els => els.map(e => e.value)')
    hit = next(o for o in opts if text in o)
    page.fill(sel, hit)
    return hit

o = api('/auth/login', body={'email': 'owner@test.com', 'password': 'password1'}, method='POST')
OT = o['token']; TID = o['memberships'][0]['tenant_id']
sess = {'token': OT, 'user': o['user'], 'memberships': o['memberships'], 'tenantId': TID}

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); page.wait_for_timeout(4000)

    # ---- tracks: classes drive "our tracks"
    page.goto(B + '/tracks'); page.wait_for_timeout(800)
    expect(page.locator('.page-header .sub')).to_contain_text('705 tracks')
    page.click('.card-head:has-text("Classes we race") button:has-text("Edit")')
    page.fill('input[aria-label="Add class"]', '410 Sprintcars'); page.press('input[aria-label="Add class"]', 'Enter')
    page.click('button:has-text("Save classes")'); page.wait_for_timeout(1500)
    # classes no longer add tracks: Our tracks holds only tracks raced at / linked (Archerfield from earlier events)
    n_mine = page.locator('.card.list .list-row').count(); print('our tracks:', n_mine)
    assert n_mine < 10, n_mine
    shot(page, 'p4-01-our-tracks', full=False)
    page.click('.tabs button:has-text("Directory")')
    page.check('label:has-text("Runs our classes") input'); page.select_option('select[aria-label=Status]', '')
    n_cls = int(page.locator('p.muted.small:has-text("tracks")').first.inner_text().split()[0]); print('directory, our classes:', n_cls)
    assert n_cls > 50, n_cls
    expect(page.locator('.card.list .list-row').first).to_contain_text('our class')
    page.uncheck('label:has-text("Runs our classes") input'); page.select_option('select[aria-label=Status]', 'Active')
    page.click('.tabs button:has-text("Our tracks")')

    # directory filter + link + home
    page.click('.tabs button:has-text("Directory")')
    page.select_option('select[aria-label=Country]', 'Australia'); page.select_option('select[aria-label="State or region"]', 'QLD')
    page.fill('input[type=search]', 'Archerfield'); page.wait_for_timeout(300)
    shot(page, 'p4-02-directory', full=False)
    page.click('.list-row:has-text("Archerfield")'); page.wait_for_timeout(500)
    page.click('button:has-text("Make home track")'); page.wait_for_timeout(500)
    track_url = page.url

    # ---- contacts: global promoter + team contacts, roles per entity
    page.goto(B + '/r/contact/new')
    page.check('text=Shared directory — visible to all teams')
    page.fill('#f-first_name', 'Jane'); page.fill('#f-last_name', 'Citizen'); page.fill('#f-organisation', 'Archerfield Promotions')
    page.fill('#f-position', 'Promoter'); page.fill('#f-mobile', '0400 111 222'); page.fill('#f-email', 'jane@example.com')
    page.fill('#f-address1', '1 Speedway Rd'); page.fill('#f-city', 'Archerfield'); page.fill('#f-state', 'QLD'); page.fill('#f-postcode', '4108'); page.fill('#f-country', 'Australia')
    save(page)
    page.goto(track_url); page.wait_for_timeout(500)
    page.click('button:has-text("+ Add contact")')
    pick(page, '#lk-contact', 'Jane Citizen'); page.fill('#lk-role', 'Track promoter')
    page.check('text=Share with all teams'); page.click('button:has-text("Add role")'); page.wait_for_timeout(500)
    expect(page.locator('.list-row:has-text("Jane Citizen")')).to_contain_text('Track promoter')
    shot(page, 'p4-03-track-detail')

    page.goto(B + '/r/supplier/new'); page.fill('#f-name', 'Kenco Shock Services'); page.select_option('#f-category', 'Shocks & suspension'); page.fill('#f-phone', '07 5555 0000'); save(page)
    page.goto(B + '/r/contact/new'); page.fill('#f-first_name', 'Peter'); page.fill('#f-last_name', 'Lack'); page.fill('#f-organisation', 'Kenco'); page.fill('#f-mobile', '0411 000 000'); save(page)
    page.click('button:has-text("+ Link to…")'); page.select_option('#lk-type', 'supplier'); pick(page, '#lk-entity', 'Kenco'); page.fill('#lk-role', 'Sales'); page.click('button:has-text("Add role")'); page.wait_for_timeout(400)
    page.click('button:has-text("+ Link to…")'); page.select_option('#lk-type', 'track'); pick(page, '#lk-entity', 'Archerfield'); page.fill('#lk-role', 'Technical / support'); page.click('button:has-text("Add role")'); page.wait_for_timeout(400)
    expect(page.locator('.role-pill')).to_have_count(2)
    shot(page, 'p4-04-contact-roles')

    # ---- series with a 2-day round at Archerfield
    page.goto(B + '/r/series/new'); page.fill('#f-name', 'QLD Sprintcar Championship'); page.fill('#f-season', '2026-27'); page.fill('#f-class', '410 Sprintcars'); save(page)
    page.click('a:has-text("Add round 1")')
    page.fill('#f-name', 'Easter Spectacular')
    pick(page, '#f-venue', 'Archerfield')
    d1 = (TODAY + timedelta(days=10)).isoformat(); d2 = (TODAY + timedelta(days=11)).isoformat()
    page.fill('#f-date', d1); page.check('#f-multi_day')            # two days from the date
    expect(page.get_by_label('Day 2 date')).to_have_value(d2)
    save(page)
    expect(page.locator('.tabs button')).to_have_count(2)
    page.click('.tabs button:has-text("Day 2")'); add_session(page, "Heat 1")
    expect(page.locator('#f-day')).to_have_value('2'); page.fill('#f-laps', '10'); save(page)
    expect(page.locator('.tabs button:has-text("Day 2") .tab-count')).to_have_text('1')
    shot(page, 'p4-05-multiday-event')
    page.goto(B + '/r/event/new'); page.fill('#f-name', 'Club night'); pick(page, '#f-venue', 'Archerfield'); page.fill('#f-date', (TODAY + timedelta(days=3)).isoformat()); save(page)
    page.goto(B + '/series'); page.click('.list-row:has-text("QLD Sprintcar")')
    expect(page.locator('tbody tr')).to_have_count(1)
    shot(page, 'p4-06-series')
    page.goto(B + '/events'); shot(page, 'p4-07-events', full=False)

    # ---- permissions: crew member can read but not change shared records
    mech = api('/auth/login', body={'email': 'crew@test.com', 'password': 'password2'}, method='POST')
    pulled = api(f'/t/{TID}/sync?since=0', mech['token'])['records']
    tr = next(r for r in pulled if r['type'] == 'track' and 'Archerfield' in r['data']['values']['name'])
    assert tr['global'] is True
    res = api(f'/t/{TID}/sync', mech['token'], 'POST', {'changes': [{'id': tr['id'], 'type': 'track', 'data': {**tr['data'], 'values': {**tr['data']['values'], 'name': 'HACKED'}}, 'client_updated_at': '2099-01-01T00:00:00Z'}]})
    assert res['results'][0]['status'] == 'denied', res
    print('mechanic sees', sum(1 for r in pulled if r['type'] == 'track'), 'tracks; global edit denied')

    # ---- admin re-import (fill blanks)
    data = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'aunz.json')))
    r = api('/admin/tracks/import', OT, 'POST', {'tracks': data['tracks'], 'mode': 'fill'})
    print('re-import:', r); assert r['added'] == 0

    # ---- mobile
    m = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    p3 = m.new_page(); p3.on('pageerror', lambda e: errors.append(str(e)))
    p3.goto(B); p3.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    p3.goto(B + '/tracks'); p3.wait_for_timeout(4000); shot(p3, 'p4-10-mobile-tracks', full=False)
    p3.goto(track_url); p3.wait_for_timeout(1000); shot(p3, 'p4-11-mobile-track')
    br.close()

print('errors:', errors[:10])
print('OK')
