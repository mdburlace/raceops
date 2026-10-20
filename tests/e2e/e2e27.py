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
def shot(page, name, full=False):
    page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
now = datetime.now(timezone.utc).isoformat()
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
d = lambda n: (date.today() + timedelta(days=n)).isoformat()
login = lambda e, p: call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
def push(tok, tid, recs):
    st, r = call(f'/t/{tid}/sync', tok, 'POST', {'changes': recs}); assert st == 200, r
    assert {x['status'] for x in r['results']} == {'applied'}, r
def records(tok, tid):
    return {r['id']: r for r in call(f'/t/{tid}/sync?since=0', tok)[1]['records']}

o = login('owner@test.com', 'password1'); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Share Team', 'plan': 'pro'}); TID = t['id']
st, t2 = call('/admin/tenants', OT, 'POST', {'name': 'Watching Team', 'plan': 'pro'}); T2 = t2['id']
roles = call(f'/t/{TID}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
chief = next(r for r in roles if r['name'] == 'Crew Chief')
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': 'sharer@cal.com', 'role_id': chief['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
assert call(f'/invites/{tok}/accept', method='POST', body={'name': 'Sam Sharer', 'password': 'password6'})[0] == 200
o = login('owner@test.com', 'password1'); OT = o['token']
c = login('sharer@cal.com', 'password6'); CT = c['token']
start = date.today() - timedelta(days=35)
recs0 = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
form = lambda target: next(r['id'] for r in recs0 if r['type'] == 'form' and r['data']['target'] == target)
FF, EF, SF, TF, CF, PF = form('fixture'), form('event'), form('series'), form('track'), form('car'), form('season_plan')
YEAR = str(start.year)

# shared (global) records already there
G1 = rec('track', {'name': 'Global Valley Speedway', 'city': 'Valley', 'region': 'QLD', 'country': 'Australia', 'status': 'Active', 'surface': 'Dirt'}, form_id=TF, scope='global')
GS = rec('series', {'name': 'Coastal Club Series', 'season': YEAR, 'class': '410 Sprintcars', 'sanctioning': 'Speedway Australia'}, form_id=SF, scope='global')
GF1 = rec('fixture', {'name': 'Valley Spring Night', 'date': d(20), 'venue': G1['id'], 'status': 'Scheduled'}, form_id=FF, scope='global')
GF2 = rec('fixture', {'name': 'Coastal Rd 2 (official)', 'date': d(31), 'venue': G1['id'], 'series': GS['id'], 'round': 2, 'status': 'Scheduled'}, form_id=FF, scope='global')
push(OT, TID, [G1, GS, GF1, GF2])
# the team's own series, track and events
car = rec('car', {'number': '12', 'name': 'Main', 'class': '410 Sprintcars', 'active': True}, form_id=CF)
TS = rec('series', {'name': 'Coastal Club Series', 'season': YEAR, 'class': '410 Sprintcars', 'notes': 'Pit gate opens at 4 pm'}, form_id=SF)
TT = rec('track', {'name': 'Mudtown Raceway', 'city': 'Mudtown', 'region': 'QLD', 'country': 'Australia', 'status': 'Active', 'notes': 'Bring the wide tyres'}, form_id=TF)
E1 = rec('event', {'name': 'Coastal Rd 1', 'date': d(13), 'venue': TT['id'], 'series': TS['id'], 'round': 1, 'car': car['id'], 'intent': 'Planned'}, form_id=EF)
E2 = rec('event', {'name': 'Coastal Rd 2', 'date': d(27), 'venue': G1['id'], 'series': TS['id'], 'round': 2, 'car': car['id'], 'intent': 'Planned'}, form_id=EF)
E3 = rec('event', {'name': 'Night 1', 'date': d(41), 'end_date': d(42), 'venue': TT['id'], 'major': True, 'major_name': 'Mudtown Classic', 'car': car['id'], 'intent': 'Planned'}, form_id=EF)
E4 = rec('event', {'name': 'Spring night', 'date': d(20), 'venue': G1['id'], 'car': car['id'], 'intent': 'Planned'}, form_id=EF)
SP = rec('season_plan', {'series': TS['id'], 'season': YEAR, 'car': car['id'], 'class': '410 Sprintcars', 'participation': 'Full series'}, form_id=PF)
push(CT, TID, [car, TS, TT, E1, E2, E3, E4, SP])

def session(page, lg, tid):
    s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': tid}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

with sync_playwright() as pw:
    br = pw.chromium.launch(); page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    session(page, c, TID)
    # ---- 1. send the team's series with its dates ----
    page.goto(B + f'/series/{TS["id"]}')
    expect(page.locator('.event-meta')).to_contain_text('Our own series')
    page.click('a:has-text("Send to shared calendars")')
    sp = page.locator('[data-testid="send-panel"]')
    expect(sp.locator('select[aria-label="Series to send"]')).to_have_value(TS['id'])
    expect(sp.locator('.send-events input:checked')).to_have_count(2)
    sp.locator('input[placeholder^="e.g. Dates"]').fill('From the club fixture list')
    shot(page, '27-01-send-series')
    sp.locator('button:has-text("Send for approval")').click()
    rq = page.locator('[data-testid="requests"]')
    expect(rq.locator('.req-row')).to_have_count(1)
    expect(rq).to_contain_text('Series: Coastal Club Series'); expect(rq).to_contain_text('Waiting for approval')
    # ---- 2. send the team-only track with its major event ----
    page.goto(B + f'/tracks/{TT["id"]}')
    page.click('a:has-text("Send to shared calendars")')
    sp = page.locator('[data-testid="send-panel"]')
    expect(sp.locator('select[aria-label="Track to send"]')).to_have_value(TT['id'])
    sp.locator('.check-row:has-text("Coastal Rd 1") input').uncheck()   # already sent with the series
    expect(sp.locator('.send-events input:checked')).to_have_count(1)
    expect(sp).to_contain_text('★ Mudtown Classic')
    sp.locator('button:has-text("Send for approval")').click()
    expect(rq.locator('.req-row')).to_have_count(2)
    # ---- 3. one date from the calendar's quick edit ----
    page.goto(B + '/calendar')
    row = page.locator(f'[data-event="{E4["id"]}"]')
    row.locator('button:has-text("Edit")').click()
    row.locator('a:has-text("Send to shared calendars")').click()
    sp = page.locator('[data-testid="send-panel"]')
    expect(sp.locator('.send-events input:checked')).to_have_count(1)
    expect(sp.locator('.check-row:has(input:checked)')).to_contain_text('Spring night')
    sp.locator('button:has-text("Send for approval")').click()
    expect(rq.locator('.req-row')).to_have_count(3)
    # ---- 4. change requests: a shared track and a shared date ----
    page.goto(B + f'/tracks/{G1["id"]}')
    page.click('button:has-text("Request a change")')
    rc = page.locator('[data-testid="request-change"]')
    rc.locator('#f-surface').fill('Black clay')
    rc.locator('button:has-text("Send for approval")').click()
    expect(page.locator('.notice.info')).to_contain_text('Change sent')
    page.goto(B + '/calendar?tab=shared&show=all')
    fr = page.locator(f'[data-fixture="{GF1["id"]}"]')
    fr.locator('button:has-text("Suggest a change")').click()
    fr.locator('#f-date').fill(d(21))
    fr.locator('button:has-text("Send for approval")').click()
    expect(fr).to_contain_text('Your change — waiting for approval')
    expect(fr.locator('button:has-text("Suggest a change")')).to_have_count(0)
    expect(page.locator('[data-testid="waiting-notice"]')).to_contain_text('5 requests')
    # team notes on a shared date
    fr.locator('button:has-text("Notes")').click()
    fr.locator('button:has-text("Add our notes")').click()
    fr.locator('textarea[aria-label="Our notes"]').fill('Park behind turn 3')
    fr.locator('button:has-text("Save notes")').click()
    expect(fr.locator('[data-testid="team-notes"]')).to_contain_text('Park behind turn 3')
    shot(page, '27-02-shared-notes')
    # withdraw-able while waiting
    page.goto(B + '/calendar?tab=requests')
    expect(page.locator('[data-testid="requests"] .req-row button:has-text("Withdraw")')).to_have_count(5)

    # ---- 5. the platform admin is told, and moderates ----
    o = login('owner@test.com', 'password1')
    me = call('/me', o['token'])[1]; assert me['notices']['calendar_requests'] == 5, me['notices']
    ctx = br.new_context(viewport={'width': 1366, 'height': 900}); pa = ctx.new_page()
    pa.on('pageerror', lambda e: errors.append(str(e)))
    session(pa, o, T2)
    expect(pa.locator('[data-testid="request-notice"]')).to_contain_text('5 shared-calendar requests are waiting')
    expect(pa.locator('nav a:has-text("Shared calendars") .nav-badge')).to_have_text('5')
    pa.goto(B + '/admin/calendar?tab=requests')
    reqs = {r['title'].split(' (')[0]: r for r in call('/admin/calendar/requests', o['token'])[1]['requests']}
    rs = reqs['Series: Coastal Club Series ' + YEAR]
    card = pa.locator(f'[data-request="{rs["id"]}"]')
    root = card.locator('[data-testid="root-series"]')
    expect(root).to_contain_text('Same as Coastal Club Series')
    expect(root.locator('input[type=radio]').nth(1)).to_be_checked()     # link to the shared one by default
    rd2 = card.locator(f'[data-item="{E2["id"]}"]')
    expect(rd2).to_contain_text('Round 2 is already listed')
    rd2.locator('select').select_option('refuse')
    rd2.locator('input[aria-label^="Why"]').fill('Round 2 is on the official date already')
    shot(pa, '27-03-admin-review')
    card.locator('button:has-text("Approve the rest (1 refused)")').click()
    expect(card).to_have_count(0)
    rt = reqs['Track: Mudtown Raceway']
    card = pa.locator(f'[data-request="{rt["id"]}"]')
    expect(card.locator('[data-testid="root-track"] input[type=radio]').first).to_be_checked()   # nothing like it: add as new
    card.locator('button:has-text("Approve")').click(); expect(card).to_have_count(0)
    rdte = reqs['Date: Spring night']
    card = pa.locator(f'[data-request="{rdte["id"]}"]')
    expect(card).to_contain_text('Already listed: Valley Spring Night')
    expect(card.locator('select')).to_have_value(f'link:{GF1["id"]}')
    card.locator('button:has-text("Approve")').click(); expect(card).to_have_count(0)
    rtc = reqs['Change: Global Valley Speedway']
    card = pa.locator(f'[data-request="{rtc["id"]}"]')
    expect(card.locator('tr.diff')).to_contain_text('Black clay')
    card.locator('button:has-text("Approve")').click(); expect(card).to_have_count(0)
    rfc = reqs['Change: Valley Spring Night']
    card = pa.locator(f'[data-request="{rfc["id"]}"]')
    expect(card.locator('button:has-text("Reject all")')).to_be_disabled()
    card.locator('input[aria-label="Note to the team"]').fill('The track confirmed the 20th')
    card.locator('button:has-text("Reject all")').click(); expect(card).to_have_count(0)
    expect(pa.locator('text=Nothing waiting for review.')).to_be_visible()
    pa.click('.seg button:has-text("All")')
    expect(pa.locator('[data-testid="cal-requests"] .req-row:has-text("Share Team")')).to_have_count(5)
    ctx.close()

    # ---- 6. single source of truth: the team now uses the shared records ----
    mine = records(CT, TID)
    allg = {r['id']: r for r in mine.values() if r.get('global')}
    gtrack = next(r for r in allg.values() if r['type'] == 'track' and r['data']['values']['name'] == 'Mudtown Raceway')
    assert mine[TS['id']]['deleted'] and mine[TT['id']]['deleted'], 'team copies retired'
    v1, v2, v3, v4 = (mine[e['id']]['data']['values'] for e in (E1, E2, E3, E4))
    assert v1['series'] == GS['id'] and v2['series'] == GS['id'] and mine[SP['id']]['data']['values']['series'] == GS['id']
    f1 = allg[v1['fixture']]['data']['values']
    assert f1['series'] == GS['id'] and f1['round'] == 1 and f1['venue'] == gtrack['id'], f1   # linked up when the track was approved
    assert v1['venue'] == gtrack['id'] and v3['venue'] == gtrack['id']
    assert 'fixture' not in v2                              # refused: stays the team's own
    f3 = allg[v3['fixture']]['data']['values']; assert f3['major'] is True and f3['major_name'] == 'Mudtown Classic' and f3['end_date'] == d(42)
    assert v4['fixture'] == GF1['id'] and v4['name'] == 'Valley Spring Night'   # linked to the existing date, takes its details
    assert allg[G1['id']]['data']['values']['surface'] == 'Black clay'
    assert allg[GF1['id']]['data']['values']['date'] == d(20)   # change rejected
    notes = [r['data']['values'] for r in mine.values() if r['type'] == 'local_note' and not r['deleted']]
    assert any(n['entity'] == GS['id'] and 'Pit gate' in n['notes'] for n in notes) and any(n['entity'] == gtrack['id'] and 'wide tyres' in n['notes'] for n in notes), notes
    # every team sees the new shared records
    other = records(OT, T2)
    assert gtrack['id'] in other and v3['fixture'] in other
    # the admin moves a shared date: the team's entry follows
    assert call(f'/admin/calendar/fixtures/{v3["fixture"]}', o['token'], 'PUT', {'values': {**f3, 'date': d(43), 'end_date': d(44)}})[0] == 200
    assert records(CT, TID)[E3['id']]['data']['values']['date'] == d(43)

    # ---- 7. the team sees what happened ----
    c = login('sharer@cal.com', 'password6')
    assert next(m for m in c['memberships'] if m['tenant_id'] == TID)['calendar_notices'] == 5
    page.goto(B); page.reload(); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(page.locator('[data-testid="request-notice"]')).to_contain_text('5 requests your team sent')
    expect(page.locator('nav a:has-text("Calendar") .nav-badge')).to_have_text('5')
    page.click('[data-testid="request-notice"] a')
    rq = page.locator('[data-testid="requests"]')
    sr = rq.locator(f'[data-request="{rs["id"]}"]')
    expect(sr).to_contain_text('Partly approved'); expect(sr).to_contain_text('Series matched to one already shared')
    expect(sr.locator('li:has-text("Coastal Rd 2")')).to_contain_text('Refused: Round 2 is on the official date already')
    expect(sr.locator('li:has-text("Coastal Rd 1")')).to_contain_text('Added')
    expect(rq.locator(f'[data-request="{rfc["id"]}"]')).to_contain_text('Not approved')
    expect(rq.locator(f'[data-request="{rfc["id"]}"]')).to_contain_text('The track confirmed the 20th')
    expect(rq.locator(f'[data-request="{rdte["id"]}"]')).to_contain_text('Already shared — linked')
    shot(page, '27-04-team-requests')
    page.wait_for_timeout(1500); page.reload(); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(page.locator('nav a:has-text("Calendar") .nav-badge')).to_have_count(0)
    # the shared series page shows the team's notes moved over
    page.goto(B + f'/series/{GS["id"]}')
    expect(page.locator('[data-testid="team-notes"]')).to_contain_text('Pit gate opens at 4 pm')
    expect(page.locator('.event-meta')).to_contain_text('Shared series')
    page.goto(B + f'/tracks/{gtrack["id"]}')
    expect(page.locator('[data-testid="team-notes"]')).to_contain_text('Bring the wide tyres')
    # the series list has one Coastal Club Series, and nothing left to send
    page.goto(B + '/series')
    expect(page.locator('.list-row:has-text("Coastal Club Series")')).to_have_count(1)
    page.goto(B + '/calendar?tab=requests')
    page.click('button:has-text("Send to the shared calendars")')
    expect(page.locator('[data-testid="send-panel"]')).to_contain_text('A series (0)')
    expect(page.locator('[data-testid="send-panel"]')).to_contain_text('A track (0)')
    br.close()
errs = [e for e in errors if 'Synced' not in e]
assert not errs, errs
print('E2E27 OK')
