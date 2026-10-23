import json, sys, os, uuid, urllib.request, urllib.error
from datetime import datetime, timezone, date, timedelta
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
def raw(url):
    with urllib.request.urlopen(url) as r: return r.status, r.headers.get('content-type'), r.read().decode()
def shot(page, name, full=False):
    page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
now = datetime.now(timezone.utc).isoformat()
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
d = lambda n: (date.today() + timedelta(days=n)).isoformat()
login = lambda e, p: call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
def push(tok, tid, recs):
    st, r = call(f'/t/{tid}/sync', tok, 'POST', {'changes': recs}); assert st == 200, r
    return [x['status'] for x in r['results']]

o = login('owner@test.com', 'password1'); OT = o['token']
call('/admin/ai', OT, 'PUT', {'enabled': True})
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Cal Team', 'plan': 'pro'}); TID = t['id']
st, t2 = call('/admin/tenants', OT, 'POST', {'name': 'Other Cal Team', 'plan': 'pro'}); T2 = t2['id']
roles = call(f'/t/{TID}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
chief = next(r for r in roles if r['name'] == 'Crew Chief'); driver = next(r for r in roles if r['name'].startswith('Driver'))
assert {'calendar.view', 'calendar.edit'} <= set(chief['permissions']) and 'calendar.view' in driver['permissions'] and 'calendar.edit' not in driver['permissions']
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': 'chief@cal.com', 'role_id': chief['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
assert call(f'/invites/{tok}/accept', method='POST', body={'name': 'Cass Chief', 'password': 'password4'})[0] == 200
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': 'driver@cal.com', 'role_id': driver['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
assert call(f'/invites/{tok}/accept', method='POST', body={'name': 'Dee Driver', 'password': 'password5'})[0] == 200
o = login('owner@test.com', 'password1'); OT = o['token']
c = login('chief@cal.com', 'password4'); CT = c['token']
dr = login('driver@cal.com', 'password5'); DT = dr['token']

# racing year starts the month before today's, so every date below is in this racing year
start = date.today() - timedelta(days=35); SM = start.month; YEAR = start.year
settings = next(m for m in o['memberships'] if m['tenant_id'] == TID).get('settings') or {}
assert call(f'/t/{TID}', OT, 'PATCH', {'settings': {**settings, 'calendar_season_start': SM}})[0] == 200
recs = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
form = lambda target: next(r['id'] for r in recs if r['type'] == 'form' and r['data']['target'] == target)
FF, EF, SF, TF, CF = form('fixture'), form('event'), form('series'), form('track'), form('car')
ev_secs = {s['id']: [f['key'] for f in s['fields']] for s in next(r for r in recs if r['type'] == 'form' and r['data']['target'] == 'event')['data']['sections']}
assert ev_secs['plan'] == ['intent', 'outcome', 'withdraw_reason', 'withdraw_session', 'outcome_notes', 'public_note'] and 'fixture' in ev_secs['event'], ev_secs

# shared (global) track, series and dates — published by the platform admin
trk = rec('track', {'name': 'Calvale Speedway', 'city': 'Calvale', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TF, scope='global')
trk2 = rec('track', {'name': 'Brookfield Raceway', 'city': 'Brookfield', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TF, scope='global')
ser = rec('series', {'name': 'Coastal Sprint Series', 'season': str(YEAR), 'class': '410 Sprintcars'}, form_id=SF, scope='global')
fx = lambda name, n, rnd=None, classes=None, venue=trk, series=ser: rec('fixture', {k: x for k, x in {'name': name, 'date': d(n), 'venue': venue['id'], 'series': series and series['id'], 'round': rnd,
                                                                                  'classes': classes, 'status': 'Scheduled'}.items() if x}, form_id=FF, scope='global')
R1 = fx('Coastal Rd 1', 12, 1, ['410 Sprintcars']); R2 = fx('Coastal Rd 2', 26, 2, ['410 Sprintcars', '360 Sprintcars']); R3 = fx('Coastal Rd 3', 40, 3)
TD = fx('Brookfield Club Night', 19, None, ['360 Sprintcars'], venue=trk2, series=None)
MOD = fx('Modified Mayhem', 22, None, ['Super Modifieds'], venue=trk2, series=None)
assert set(push(OT, TID, [trk, trk2, ser, R1, R2, R3, TD, MOD])) == {'applied'}
# a team can't publish to the shared calendar itself
assert push(CT, TID, [rec('fixture', {'name': 'Sneaky', 'date': d(5)}, form_id=FF, scope='global')]) == ['denied']
assert push(DT, TID, [rec('fixture', {'name': 'Driver idea', 'date': d(5), 'review': 'pending'}, form_id=FF)]) == ['denied']
# the other team sees the shared dates too
assert sum(1 for r in call(f'/t/{T2}/sync?since=0', OT)[1]['records'] if r['type'] == 'fixture') == 5

cars = [rec('car', {'number': '12', 'name': 'Main', 'class': '410 Sprintcars', 'active': True}, form_id=CF),
        rec('car', {'number': '7', 'name': 'Spare', 'class': '360 Sprintcars', 'active': True}, form_id=CF)]
past = rec('event', {'name': 'Season Opener', 'date': d(-6), 'venue': trk['id'], 'car': cars[0]['id'], 'intent': 'Planned'}, form_id=EF)
club = rec('series', {'name': 'Club Championship', 'season': str(YEAR), 'class': '360 Sprintcars'}, form_id=SF)  # a team-only series
assert set(push(CT, TID, cars + [past, club])) == {'applied'}

def session(page, lg, tid=TID):
    s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': tid}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

ics_path = f'{OUT}/club.ics'
open(ics_path, 'w').write('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a1\r\nDTSTART;VALUE=DATE:' + d(33).replace('-', '') + '\r\nDTEND;VALUE=DATE:'
                          + d(35).replace('-', '') + '\r\nSUMMARY:Calvale Twin 20s\r\nLOCATION:Calvale Speedway\\, Calvale QLD\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n')

with sync_playwright() as pw:
    br = pw.chromium.launch(); page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    session(page, c)
    # ---- the calendar starts empty apart from the event already entered ----
    page.click('nav a:has-text("Calendar")')
    expect(page.locator('h1')).to_have_text('Calendar')
    expect(page.locator('[data-testid="cal-list"] .cal-row')).to_have_count(1)
    # ---- shared calendars: dates matching our cars' classes and series ----
    page.click('.tabs button:has-text("Shared calendars")')
    fl = page.locator('[data-testid="fx-list"]')
    expect(fl.locator('.fx-row')).to_have_count(4)   # R1, R2, R3 (series class 410), club night (360) — not the Modifieds
    expect(fl).not_to_contain_text('Modified Mayhem')
    page.click('.cal-views .seg button:has-text("All dates")'); expect(fl.locator('.fx-row')).to_have_count(5)
    page.click('.cal-views .seg button:has-text("Matching us")')
    shot(page, '25-01-shared')
    # one matching car: picked for you
    row = fl.locator(f'[data-fixture="{R1["id"]}"]')
    row.locator('button:has-text("Add to our calendar")').click()
    af = row.locator('[data-testid="add-fx"]')
    expect(af.locator('input[type=checkbox]:checked')).to_have_count(1)
    expect(af.locator('label:has(input:checked)')).to_contain_text('#12 Main')
    af.locator('button:has-text("Add to our calendar")').click()
    expect(row).to_contain_text('On our calendar — #12 Main')
    # two of our classes run at round 2: choose the car
    row = fl.locator(f'[data-fixture="{R2["id"]}"]')
    row.locator('button:has-text("Add to our calendar")').click()
    af = row.locator('[data-testid="add-fx"]')
    expect(af).to_contain_text('More than one of your cars fits')
    expect(af.locator('button.primary')).to_be_disabled()
    af.locator('label:has-text("#7 Spare") input').check()
    af.locator('button.primary').click()
    expect(row).to_contain_text('On our calendar — #7 Spare')
    shot(page, '25-02-added')
    # ---- enter the full series with #12: the missing rounds go on the calendar ----
    page.click('.cal-views .seg button:has-text("Series")')
    expect(page.locator('[data-testid="series-index"]')).to_contain_text('3 dates')
    page.click(f'[data-cal="{ser["id"]}"]')
    expect(page.locator('[data-testid="cal-title"]')).to_have_text('Coastal Sprint Series')
    expect(fl.locator('.fx-row')).to_have_count(3)
    page.click('button:has-text("Enter this series")')
    ee = page.locator('[data-testid="entry-editor"]')
    ee.locator('#f-car').select_option(label='#12 Main')
    expect(ee.locator('#f-class')).to_have_value('410 Sprintcars')
    expect(ee).to_contain_text('All 3 rounds go on the calendar')
    ee.locator('button:has-text("Save entry")').click(); page.wait_for_timeout(800)
    expect(fl.locator(f'[data-fixture="{R3["id"]}"]')).to_contain_text('On our calendar — #12 Main')
    expect(fl.locator(f'[data-fixture="{R2["id"]}"] .pill-ok')).to_have_count(2)  # #7 and #12
    page.click('.tabs button:has-text("Series entries")')
    expect(page.locator('[data-testid="entries"]')).to_contain_text('3 of 3 rounds on our calendar')
    expect(page.locator('[data-testid="entries"]')).to_contain_text('Full series')
    # ---- suggest a new date (team-only series) and a change to round 3 ----
    page.click('.tabs button:has-text("Shared calendars")')
    page.click('.cal-views .seg button:has-text("All dates")')
    page.click('button:has-text("Suggest a date")')
    ed = page.locator('[data-testid="fx-editor"]')
    ed.locator('#f-name').fill('Club Rd 1'); ed.locator('#f-date').fill(d(47))
    ed.locator('#f-series').select_option(label=f'Club Championship {YEAR}')
    ed.locator('#f-track').fill('Mudtown Raceway')
    ed.locator('#f-classes').fill('360 Sprintcars'); ed.locator('#f-classes').press('Enter')
    ed.locator('button:has-text("Send for approval")').click()
    expect(page.locator('[data-testid="waiting-notice"]')).to_contain_text('One request from your team')
    row = fl.locator(f'[data-fixture="{R3["id"]}"]')
    row.locator('button:has-text("Suggest a change")').click()
    ed = page.locator('[data-testid="fx-editor"]')
    expect(ed.locator('#f-name')).to_have_value('Coastal Rd 3')
    ed.locator('#f-date').fill(d(42))
    ed.locator('input[placeholder^="e.g. Source"]').fill('Series Facebook page')
    ed.locator('button:has-text("Send for approval")').click()
    expect(fl.locator(f'[data-fixture="{R3["id"]}"]')).to_contain_text('Your change — waiting for approval')
    expect(fl.locator('.fx-row:has-text("Coastal Rd 3")')).to_have_count(1)
    expect(page.locator('[data-testid="waiting-notice"]')).to_contain_text('2 requests from your team')
    shot(page, '25-03-suggested')
    # ---- import: pasted text (AI) and an iCal file ----
    page.click('button:has-text("Import a calendar")')
    im = page.locator('[data-testid="import-cal"]')
    im.locator('.seg button:has-text("Paste text")').click()
    im.locator('textarea').fill(f'{d(54)} Brookfield Spring Cup @ Brookfield Raceway\n{d(12)} Coastal Rd 1 @ Calvale Speedway\n{d(61)} Bush Bash @ Nowhere Park')
    im.locator('button:has-text("Read dates")').click()
    rows = im.locator('[data-testid="import-rows"] tbody tr')
    expect(rows).to_have_count(3)
    expect(rows.nth(0).locator('select')).to_have_value(trk2['id'])          # track matched from the directory
    expect(rows.nth(1)).to_contain_text('already listed')                     # round 1 is already shared
    expect(rows.nth(1).locator('input[aria-label^="Add "]')).not_to_be_checked()
    expect(rows.nth(2).locator('select option').first).to_contain_text('Nowhere Park')
    shot(page, '25-04-import-review')
    im.locator('button:has-text("Send 2 dates for approval")').click()
    expect(page.locator('[data-testid="import-cal"]')).to_have_count(0)
    page.click('button:has-text("Import a calendar")')
    im = page.locator('[data-testid="import-cal"]')
    im.locator('.seg button:has-text("File or screenshot")').click()
    im.locator('input[type=file]').set_input_files(ics_path)
    im.locator('button:has-text("Read dates")').click()
    expect(im.locator('.notice.info')).to_contain_text('iCal')
    rows = im.locator('[data-testid="import-rows"] tbody tr')
    expect(rows).to_have_count(1)
    expect(rows.nth(0).locator('input[type=date]').nth(1)).to_have_value(d(34))   # DTEND is the day after
    expect(rows.nth(0).locator('select')).to_have_value(trk['id'])
    im.locator('button:has-text("Cancel")').click()
    # a Facebook link needs a screenshot instead
    st, r = call(f'/t/{TID}/calendar/import', CT, 'POST', {'url': 'https://www.facebook.com/somespeedway/posts/1'})
    assert st == 422 and 'screenshot' in r['error'], r
    # ---- record what happened at the past event ----
    page.click('.tabs button:has-text("Our calendar")')
    cl = page.locator('[data-testid="cal-list"]')
    expect(cl.locator('.cal-row')).to_have_count(5)   # opener + R1 #12, R2 #7, R2 #12, R3 #12
    op = cl.locator(f'[data-event="{past["id"]}"]')
    op.locator('select[aria-label="What happened at Season Opener"]').select_option('Withdrew during the event')
    op.locator('select[aria-label="Why we withdrew from Season Opener"]').select_option('Engine')
    sm = page.locator('[data-testid="cal-summary"]')
    expect(sm.locator('.kpi:has-text("Withdrew")')).to_contain_text('Engine 1')
    expect(sm.locator('.kpi:has-text("Ran") .kpi-value')).to_have_text('1')
    expect(sm.locator('.kpi:has-text("Planned") .kpi-value')).to_have_text('5')
    # mark round 2 for the spare as tentative
    r2spare = cl.locator('.cal-row:has-text("Coastal Rd 2"):has-text("#7 Spare")')
    r2spare.locator('select[aria-label="Going to Coastal Rd 2?"]').select_option('Tentative')
    expect(sm.locator('.kpi:has-text("Planned")')).to_contain_text('1 tentative')
    shot(page, '25-05-ours')
    page.click('.seg button:has-text("Month")')
    expect(page.locator('[data-testid="cal-month"] .mg-d.has').first).to_be_visible()
    expect(page.locator('[data-testid="cal-month"]')).to_contain_text('Coastal Rd 1')
    shot(page, '25-06-month')
    page.click('.seg button:has-text("List")')
    # event page shows plan & result
    op.locator('a.row-title').click()
    expect(page.locator('[data-testid="entry-card"] select[aria-label="Why we withdrew from Season Opener"]')).to_have_value('Engine')
    page.goto(B + '/calendar')
    # the driver can see the calendar but not change it
    ctx2 = br.new_context(viewport={'width': 1366, 'height': 900}); p2 = ctx2.new_page()
    session(p2, dr)
    # Calendar sits under Team Management, and a driver (no Team Management area) still reaches it
    expect(p2.locator('nav a.nav-link:has-text("Calendar")')).to_be_visible()
    expect(p2.locator('nav a:has-text("Members & invites")')).to_have_count(0)
    p2.locator('nav a.nav-link:has-text("Calendar")').click()
    expect(p2.locator('[data-testid="cal-list"] .cal-row')).to_have_count(5)
    expect(p2.locator('[data-testid="cal-list"] select')).to_have_count(0)
    expect(p2.locator('[data-testid="cal-list"]')).to_contain_text('Withdrew — Engine')
    p2.click('.tabs button:has-text("Shared calendars")')
    expect(p2.locator('button:has-text("Suggest a date")')).to_have_count(0)
    ctx2.close()

    # ---- the platform admin reviews the suggestions ----
    ctx3 = br.new_context(viewport={'width': 1366, 'height': 900}); p3 = ctx3.new_page()
    p3.on('pageerror', lambda e: errors.append(str(e)))
    session(p3, o, T2)
    p3.goto(B + '/admin/calendar')
    p3.click('.tabs button:has-text("Requests (3)")')
    sg = p3.locator('[data-testid="cal-requests"]')
    expect(sg.locator('.req-review')).to_have_count(3)
    ch = sg.locator('.req-review:has-text("Change: Coastal Rd 3")')
    expect(ch.locator('tr.diff')).to_contain_text('date')
    expect(ch).to_contain_text('Series Facebook page')
    club_rq = sg.locator('.req-review:has-text("Series: Club Championship")')
    expect(club_rq.locator('[data-testid="root-series"]')).to_contain_text('Club Championship')
    expect(club_rq).to_contain_text('Club Rd 1')
    shot(p3, '25-07-admin')
    ch.locator('button:has-text("Approve")').click()
    expect(sg.locator('.req-review')).to_have_count(2)
    club_rq.locator('button:has-text("Approve")').click()
    expect(sg.locator('.req-review')).to_have_count(1)
    imp = sg.locator('.req-review:has-text("Import")')
    bb = imp.locator('tr:has-text("Bush Bash")')
    bb.locator('select').select_option('refuse')
    bb.locator('input[aria-label^="Why"]').fill('Couldn’t confirm this date')
    imp.locator('button:has-text("Approve the rest (1 refused)")').click()
    expect(sg.locator('.req-review')).to_have_count(0)
    # ---- Shared calendars (platform admin): series, tracks and major-event views; add, edit, delete ----
    p3.click('.tabs button:has-text("Calendars")')
    si = p3.locator('[data-testid="series-index"]')
    expect(si).to_contain_text('Coastal Sprint Series'); expect(si).to_contain_text('Club Championship')
    si.locator(f'[data-cal="{ser["id"]}"]').click()
    expect(p3.locator('[data-testid="cal-title"]')).to_have_text('Coastal Sprint Series')
    expect(p3.locator('[data-testid="fx-list"] .fx-row')).to_have_count(3)
    p3.click('button:has-text("‹ All series")')
    p3.click('button:has-text("New series")')
    se = p3.locator('[data-testid="series-editor"]')
    expect(se.locator('#f-season')).to_have_value(str(YEAR))
    se.locator('#f-name').fill('Australian Sprintcar Championship'); se.locator('#f-class').fill('410 Sprintcars')
    se.locator('button:has-text("Save series")').click()
    expect(si).to_contain_text('Australian Sprintcar Championship')
    expect(si.locator('.cal-index-row:has-text("Australian Sprintcar Championship")')).to_contain_text('0 dates')
    p3.click('.cal-views .seg button:has-text("Major events")')
    expect(p3.locator('text=No major events listed')).to_be_visible()
    p3.click('button:has-text("Add a date")')
    ed = p3.locator('[data-testid="fx-editor"]')
    expect(ed.locator('#f-major')).to_be_checked()
    expect(ed.locator('text=Publish to every team now')).to_have_count(0)
    ed.locator('#f-name').fill('Australian Sprintcar Title'); ed.locator('#f-date').fill(d(50)); ed.locator('#f-multi_day').check(); expect(ed.get_by_label('Day 2 date')).to_have_value(d(51))
    ed.locator('#f-track').fill('Premier Speedway')
    ed.locator('#f-classes').fill('410 Sprintcars'); ed.locator('#f-classes').press('Enter')
    ed.locator('button.primary:has-text("Save")').click()
    fl3 = p3.locator('[data-testid="fx-list"]')
    expect(fl3.locator('.fx-row')).to_have_count(1); expect(fl3).to_contain_text('★ Major event'); expect(fl3).to_contain_text('Premier Speedway')
    fl3.locator('button:has-text("Edit")').click()
    ed.locator('#f-start_time').fill('Gates 3 pm'); ed.locator('button.primary:has-text("Save")').click()
    expect(fl3).to_contain_text('Gates 3 pm')
    shot(p3, '25-07b-admin-major')
    p3.click('.cal-views .seg button:has-text("Tracks")')
    ti = p3.locator('[data-testid="tracks-index"]')
    expect(ti).to_contain_text('Calvale Speedway'); expect(ti).to_contain_text('Brookfield Raceway')
    ti.locator(f'[data-cal="{trk2["id"]}"]').click()
    expect(p3.locator('[data-testid="cal-title"]')).to_have_text('Brookfield Raceway')
    p3.click('.cal-views .seg button:has-text("All dates")')
    p3.once('dialog', lambda dlg: dlg.accept())
    p3.locator('.fx-row:has-text("Modified Mayhem") button:has-text("Delete")').click()
    expect(p3.locator('.fx-row:has-text("Modified Mayhem")')).to_have_count(0)
    ctx3.close()
    rec3 = {r['data']['values'].get('name'): r for r in call(f'/t/{TID}/sync?since=0', CT)[1]['records'] if r['type'] == 'fixture'}
    assert rec3['Modified Mayhem']['deleted'] and rec3['Australian Sprintcar Title']['data']['values']['major'] is True
    # a team can't use the admin calendar routes
    assert call('/admin/calendar/fixtures/new', CT, 'PUT', {'values': {'name': 'x', 'date': d(3), 'track': 'y'}})[0] == 403
    # the team series was shared, and every team now sees the approved dates
    recs2 = call(f'/t/{T2}/sync?since=0', OT)[1]['records']
    gfx = {r['data']['values']['name']: r for r in recs2 if r['type'] == 'fixture' and not r['deleted']}
    assert {'Club Rd 1', 'Brookfield Spring Cup'} <= set(gfx) and 'Bush Bash' not in gfx and gfx['Coastal Rd 3']['data']['values']['date'] == d(42), sorted(gfx)
    # the team's own series went up with its date: shared now, and the team's copy retired
    gser = next(r for r in recs2 if r['type'] == 'series' and r['global'] and r['data']['values']['name'] == 'Club Championship')
    assert gfx['Club Rd 1']['data']['values']['series'] == gser['id'] and gfx['Club Rd 1']['global']
    mine = {r['id']: r for r in call(f'/t/{TID}/sync?since=0', CT)[1]['records']}
    assert mine[club['id']]['deleted']

    # ---- back on the team: round 3 moved; the rejected date says why ----
    page.reload(); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    cl = page.locator('[data-testid="cal-list"]')
    # the approved change flowed into the team's entry by itself
    r3 = cl.locator('.cal-row:has-text("Coastal Rd 3")')
    expect(r3.locator('.date-block b')).to_have_text(str(int(d(42)[8:])))
    expect(cl.locator('[data-testid="fixture-moved"]')).to_have_count(0)
    shot(page, '25-08-moved')
    page.click('.tabs button:has-text("Shared calendars")')
    page.click('.cal-views .seg button:has-text("All dates")')
    fl = page.locator('[data-testid="fx-list"]')
    page.click('.cal-views .seg button:has-text("Major events")')
    expect(fl.locator('.fx-row')).to_have_count(1); expect(fl).to_contain_text('Australian Sprintcar Title')
    shot(page, '25-08b-major')
    page.click('.cal-views .seg button:has-text("All dates")')
    expect(fl).not_to_contain_text('Bush Bash')
    expect(fl.locator('.fx-row:has-text("Club Rd 1")')).not_to_contain_text('waiting')
    page.click('.tabs button:has-text("Requests")')
    imr = page.locator('[data-testid="requests"] .req-row:has-text("Import")')
    expect(imr).to_contain_text('Partly approved')
    expect(imr.locator('li:has-text("Bush Bash")')).to_contain_text('Refused: Couldn’t confirm this date')
    # the series list now shows the shared Coastal series the team runs (and its own club series once)
    page.goto(B + '/series')
    expect(page.locator('.list-row:has-text("Coastal Sprint Series")')).to_have_count(1)
    expect(page.locator('.list-row:has-text("Club Championship")')).to_have_count(0)   # shared now, and the team has no rounds in it
    # track page lists what's coming up
    page.goto(B + f'/tracks/{trk["id"]}')
    expect(page.locator('section:has-text("Coming up at this track")')).to_contain_text('Coastal Rd 1')

    # ---- publish (owner): public page, iCal feed, print ----
    ctx4 = br.new_context(viewport={'width': 1366, 'height': 900}); p4 = ctx4.new_page()
    p4.on('pageerror', lambda e: errors.append(str(e)))
    o = login('owner@test.com', 'password1')
    session(p4, o, TID)
    p4.goto(B + '/calendar')
    p4.click('button:has-text("Publish")')
    pp = p4.locator('[data-testid="publish-cal"]')
    pp.locator('button:has-text("Publish calendar")').click()
    link = pp.locator('input[aria-label="Public page link"]'); expect(link).to_have_value(__import__('re').compile(r'/c/'))
    url = link.input_value(); ics = pp.locator('input[aria-label="Subscribe link"]').input_value()
    shot(p4, '25-09-publish')
    pp.locator('label:has-text("Show results") input').check(); p4.wait_for_timeout(800)
    st, ctype, body = raw(ics)
    assert st == 200 and 'text/calendar' in ctype and 'BEGIN:VCALENDAR' in body and 'SUMMARY:Coastal Rd 1' in body and 'STATUS:TENTATIVE' not in body, body
    assert 'Season Opener' in body and 'Result: Withdrew' in body and 'Engine' not in body, body
    assert 'SUMMARY:Coastal Rd 2' in body and body.count('Coastal Rd 2') == 1, body   # the tentative entry stays private by default
    # importing a published iCal link works too
    st, r = call(f'/t/{TID}/calendar/import', CT, 'POST', {'url': ics})
    assert st == 200 and r['source'] == 'ical' and len(r['items']) == 4, r
    pub = br.new_context(viewport={'width': 390, 'height': 844}); pg = pub.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(url)
    sh = pg.locator('[data-testid="cal-sheet"]')
    expect(sh.locator('h1')).to_contain_text('Cal Team — race calendar')
    expect(sh.locator('tr')).to_have_count(4)
    expect(sh).to_contain_text('#12 Main'); expect(sh).to_contain_text('Withdrew'); expect(sh).not_to_contain_text('Engine')
    expect(pg.locator('a:has-text("Subscribe")')).to_have_attribute('href', __import__('re').compile(r'^webcal://'))
    shot(pg, '25-10-public', True)
    # turning it off kills the link
    pp.locator('button:has-text("Stop publishing")').click(); p4.wait_for_timeout(800)
    pg.reload(); expect(pg.locator('h1')).to_have_text('Calendar not available')
    # settings saved elsewhere can't wipe or forge the link
    p4.click('button:has-text("Publish calendar")'); p4.wait_for_timeout(800)
    s2 = call(f'/t/{TID}', OT, 'PATCH', {'settings': {'calendar_season_start': SM, 'calendar_publish': {'token': 'forged'}}})[1]['settings']
    assert s2['calendar_publish']['token'] != 'forged'
    st, _, _ = raw(f'{B}/api/public/calendar/{s2["calendar_publish"]["token"]}.ics'); assert st == 200
    try: raw(f'{B}/api/public/calendar/forged.ics'); assert False
    except urllib.error.HTTPError as e: assert e.code == 404
    # printable calendar
    p4.goto(B + f'/print/calendar?year={YEAR}')
    expect(p4.locator('[data-testid="cal-sheet"] tr')).to_have_count(5)
    p4.locator('label:has-text("Tentative events") input').uncheck()
    expect(p4.locator('[data-testid="cal-sheet"] tr')).to_have_count(4)
    shot(p4, '25-11-print', True)
    # mobile calendar
    p4.set_viewport_size({'width': 390, 'height': 844})
    p4.goto(B + '/calendar')
    expect(p4.locator('[data-testid="cal-list"] .cal-row')).to_have_count(5)
    shot(p4, '25-12-mobile', True)
    br.close()

errs = [e for e in errors if 'Synced' not in e]
assert not errs, errs
print('E2E25 OK')
