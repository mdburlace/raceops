# Events in more than one series, round prefixes and locked setup sheets: a shared date in two series (the
# admin's Edit series → Dates in this series / Add shared dates, and Take out), the team's entry following it,
# a team event added to its own series from the series page (main series, or Also counts towards when it
# already has one), a chip per series on the event, prefixes in lists instead of "Rd", and locking a setup
# sheet (read-only for everyone, no delete, only roles with Unlock locked setup sheets can unlock, the
# running order still changes, the server refusing everything else).
import json, os, re, sys, time, uuid, urllib.request, urllib.error
from datetime import date, datetime, timedelta, timezone
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
now = lambda: datetime.now(timezone.utc).isoformat()
d = lambda n: (date.today() + timedelta(days=n)).isoformat()

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Parallel Racing', 'plan': 'pro'}); assert st == 200, t; TID = t['id']
o = login(); OT = o['token']
roles = lambda: call(f'/t/{TID}/roles', OT)[1]
RUN = TID[:6]
def member(email, role):
    email = email.replace('@', f'+{RUN}@')
    r = next(x for x in roles() if x['name'] == role)
    st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': email, 'role_id': r['id']})
    assert call(f'/invites/{inv["token"]}/accept', method='POST', body={'name': email.split('@')[0].title(), 'password': 'password44'})[0] == 200
    return login(email, 'password44')
# a role that edits setup sheets but can't unlock them
cc_perms = next(r for r in roles() if r['name'] == 'Crew Chief')['permissions']
assert call(f'/t/{TID}/roles', OT, 'POST', {'name': 'Setup Hand', 'permissions': [p for p in cc_perms if p != 'setups.unlock']})[0] == 200
CC = member('chief44@test.com', 'Crew Chief'); MEC = member('mech44@test.com', 'Setup Hand')
assert 'setups.unlock' in next(r for r in roles() if r['name'] == 'Crew Chief')['permissions']
assert 'setups.unlock' not in next(r for r in roles() if r['name'] == 'Mechanic')['permissions'] + next(r for r in roles() if r['name'] == 'Setup Hand')['permissions']

recs = lambda tok=OT: [r for r in call(f'/t/{TID}/sync?since=0', tok)[1]['records'] if not r['deleted']]
rec = lambda id, tok=OT: next(r for r in recs(tok) if r['id'] == id)
def until(fn, secs=15):   # wait for the device's push to reach the server
    end = time.time() + secs
    while True:
        try:
            if fn(): return
        except (KeyError, TypeError, StopIteration): pass
        if time.time() > end: raise AssertionError('timed out waiting')
        time.sleep(0.5)
def push(tok, r, vals, deleted=False, **kw):
    return call(f'/t/{TID}/sync', tok, 'POST', {'changes': [{'id': r['id'] if r else kw.get('id') or str(uuid.uuid4()), 'type': kw.get('type') or r['type'],
        'data': {**(r['data'] if r else {}), 'values': vals}, 'deleted': deleted, 'client_updated_at': now()}]})[1]['results'][0]

# ---- shared calendar: two parallel series and two dates
shared = lambda: call('/admin/calendar/data', OT)[1]['records']
for f in shared():   # so the suite can run again on the same server
    if f.get('type') == 'fixture' and f['data']['values'].get('name') in ('Twin Series Night', 'Season Opener Warm-up'): call(f'/admin/calendar/fixtures/{f["id"]}', OT, 'DELETE')
def series(name):
    old = next((r['id'] for r in shared() if r.get('type') == 'series' and r['data']['values'].get('name') == name), None)
    return old or call('/admin/calendar/series/new', OT, 'PUT', {'values': {'name': name, 'season': '2026-27'}})[1]['id']
GA = series('Summer Sprint Series'); GB = series('Night Owl Series')
F1 = call('/admin/calendar/fixtures/new', OT, 'PUT', {'values': {'name': 'Twin Series Night', 'date': d(20), 'track': 'Parallel Park', 'series': GA, 'round': '2', 'round_prefix': 'Night'}})[1]['id']
F2 = call('/admin/calendar/fixtures/new', OT, 'PUT', {'values': {'name': 'Season Opener Warm-up', 'date': d(27), 'track': 'Parallel Park'}})[1]['id']
# the team's entry for the first date, and its own series and event
CAR = str(uuid.uuid4())
assert push(OT, None, {'name': 'Car 44', 'number': '44', 'active': True}, type='car', id=CAR)['status'] == 'applied'
E1 = str(uuid.uuid4()); E2 = str(uuid.uuid4()); S = str(uuid.uuid4())
assert push(OT, None, {'name': 'Twin Series Night', 'date': d(20), 'track': 'Parallel Park', 'fixture': F1, 'series': GA, 'round': '2', 'round_prefix': 'Night', 'intent': 'Planned'}, type='event', id=E1)['status'] == 'applied'
assert push(OT, None, {'name': 'Club Championship', 'season': str(date.today().year)}, type='series', id=S)['status'] == 'applied'
assert push(OT, None, {'name': 'Club Point Score', 'date': d(13), 'track': 'Parallel Park', 'car': CAR, 'intent': 'Planned'}, type='event', id=E2)['status'] == 'applied'
SH = str(uuid.uuid4())
assert push(OT, None, {'event': E2, 'car': CAR, 'session': 'Feature', 'order': 1, 'stagger_cold': '5'}, type='setup', id=SH)['status'] == 'applied'

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
    synced = lambda: expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    session(o)

    # ---- platform admin: add both dates to the second series from Edit series, then take one out
    page.goto(B + f'/admin/calendar?show=series:{GB}')
    expect(page.locator('[data-testid="cal-title"]')).to_have_text('Night Owl Series')
    page.get_by_role('button', name='Edit series').click()
    sd = page.locator('[data-testid="series-dates"]')
    expect(sd).to_contain_text('Dates in this series (0)')
    sd.get_by_label('Search shared dates').fill('Parallel Park')
    add = sd.locator('[data-testid="series-add-dates"]')
    add.locator('.list-row', has_text='Twin Series Night').locator('input[type=checkbox]').check()
    add.locator('.list-row', has_text='Season Opener Warm-up').locator('input[type=checkbox]').check()
    sd.get_by_label('Prefix for Twin Series Night').fill('Round')
    sd.get_by_label('Round for Twin Series Night').fill('5')
    sd.get_by_label('Prefix for Season Opener Warm-up').fill('Prelude')
    sd.get_by_label('Round for Season Opener Warm-up').fill('')
    shot('44-01-add-dates')
    sd.get_by_role('button', name='Add 2 dates to Night Owl Series').click()
    expect(sd).to_contain_text('Dates in this series (2)')
    expect(sd).to_contain_text('Round 5 · Twin Series Night')
    expect(sd).to_contain_text('Prelude · Season Opener Warm-up')
    fx = {f['id']: f['data']['values'] for f in call('/admin/calendar/data', OT)[1]['records'] if f['type'] == 'fixture'}
    assert fx[F1]['series'] == GA and fx[F1]['round_prefix'] == 'Night', fx[F1]       # the main series is kept
    assert [{k: r.get(k) for k in ('series', 'prefix', 'round')} for r in fx[F1]['more_series']] == [{'series': GB, 'prefix': 'Round', 'round': '5'}], fx[F1]
    assert fx[F2]['series'] == GB and fx[F2]['round_prefix'] == 'Prelude' and not fx[F2].get('round'), fx[F2]   # its only series becomes the main one
    sd.locator('.list-row', has_text='Season Opener Warm-up').get_by_role('button', name='Take out').click()
    expect(sd).to_contain_text('Dates in this series (1)')
    fx = {f['id']: f['data']['values'] for f in call('/admin/calendar/data', OT)[1]['records'] if f['type'] == 'fixture'}
    assert not fx[F2].get('series') and not fx[F2].get('more_series'), fx[F2]
    # only a platform admin can do it
    assert call(f'/admin/calendar/series/{GB}/dates', CC['token'], 'POST', {'add': [{'fixture': F2}]})[0] == 403

    # ---- the team's entry follows: in both series, each with its own round
    e1 = rec(E1)['data']['values']
    assert e1['series'] == GA and any(r['series'] == GB and r['round'] == '5' for r in e1.get('more_series') or []), e1

    # ---- the team's own series page: add both events (the shared one goes under Also counts towards)
    page.goto(B + f'/series/{S}')
    page.get_by_role('button', name='Add events').click()
    ae = page.locator('[data-testid="add-events"]')
    page.get_by_label('Search events').fill('Parallel Park')
    ae.locator('.list-row', has_text='Club Point Score').locator('input[type=checkbox]').check()
    ae.locator('.list-row', has_text='Twin Series Night').locator('input[type=checkbox]').check()
    expect(ae.locator('.list-row', has_text='Twin Series Night')).to_contain_text(re.compile(r'also in Summer Sprint Series.*, Night Owl Series'))
    page.get_by_label('Round for Club Point Score').fill('4')
    page.get_by_label('Prefix for Twin Series Night').fill('Night')
    page.get_by_label('Round for Twin Series Night').fill('5')
    page.get_by_role('button', name='Add 2 to Club Championship').click()
    until(lambda: rec(E2)['data']['values'].get('series') == S and len(rec(E1)['data']['values'].get('more_series') or []) == 2)
    e2 = rec(E2)['data']['values']; e1 = rec(E1)['data']['values']
    assert e2['series'] == S and e2['round'] == '4' and not e2.get('round_prefix'), e2
    assert e1['series'] == GA and {r['series'] for r in e1['more_series']} == {GB, S}, e1
    # a later change to the shared date keeps the team's own series
    call(f'/admin/calendar/fixtures/{F1}', OT, 'PUT', {'values': {**fx[F1], 'date': d(21)}})
    e1 = rec(E1)['data']['values']
    assert e1['date'] == d(21) and {r['series'] for r in e1['more_series']} == {GB, S}, e1

    # ---- the event shows a chip per series; lists show the prefix, never "Rd"
    page.goto(B + f'/events/{E1}')
    chips = page.locator('[data-testid="event-series"]')
    expect(chips).to_have_count(3)
    expect(chips.filter(has_text='Summer Sprint Series')).to_contain_text('Night 2')
    expect(chips.filter(has_text='Night Owl Series')).to_contain_text('Round 5')
    expect(chips.filter(has_text='Club Championship')).to_contain_text('Night 5')
    shot('44-02-event-series')
    page.goto(B + '/events')
    row = page.locator('a', has_text='Twin Series Night').first
    expect(row).to_contain_text('Night 2 · Parallel Park')
    expect(row).to_contain_text('Night Owl Series')
    expect(page.locator('a', has_text='Club Point Score').first).to_contain_text('Round 4 · Parallel Park')
    expect(page.locator('main')).not_to_contain_text(re.compile(r'\bRd \d'))
    page.goto(B + f'/series/{S}')
    expect(page.locator('main')).to_contain_text('Night 5')
    expect(page.locator('main')).to_contain_text('Round 4')
    # taking it out of one series leaves the others
    page.get_by_role('button', name='Add events').click()
    page.locator('.list-row', has_text='Twin Series Night').get_by_role('button', name='Take out').click()
    until(lambda: {r['series'] for r in rec(E1)['data']['values']['more_series']} == {GB})
    assert rec(E1)['data']['values']['series'] == GA
    page.goto(B + '/calendar')
    expect(page.locator('main')).not_to_contain_text(re.compile(r'\bRd \d'))

    # ---- lock a setup sheet
    page.goto(B + f'/r/setup/{SH}')
    page.get_by_role('button', name='Lock sheet').click()
    expect(page.locator('[data-testid="locked-notice"]')).to_contain_text('This sheet is locked by')
    expect(page.get_by_role('button', name='Delete')).to_have_count(0)
    expect(page.locator('#f-stagger_cold')).to_have_count(0)   # read-only: values shown as text
    until(lambda: rec(SH)['data']['values'].get('locked') is True)
    shot('44-03-locked')
    s = rec(SH)
    assert s['data']['values']['locked'] is True and s['data']['values']['locked_by'] == o['user']['id'] and s['data']['values']['locked_at'], s['data']['values']
    page.goto(B + f'/events/{E2}')
    expect(page.locator('main')).to_contain_text('🔒')

    # the server refuses changes, owner included, and deletes; the running order still moves
    sv = s['data']['values']
    assert push(OT, s, {**sv, 'stagger_cold': '7'})['status'] == 'denied'
    assert push(CC['token'], s, {**sv, 'stagger_cold': '7'})['status'] == 'denied'
    assert push(OT, s, sv, deleted=True)['status'] == 'denied'
    res = push(MEC['token'], s, {**sv, 'order': 3}); assert res['status'] == 'applied', res
    assert res['record']['data']['values']['order'] == 3 and res['record']['data']['values']['locked'] is True
    s = rec(SH); sv = s['data']['values']
    # the mechanic can't unlock; the crew chief can, and edits sent with the unlock are dropped
    assert push(MEC['token'], s, {**sv, 'locked': False})['status'] == 'denied'
    assert rec(SH)['data']['values']['locked'] is True
    res = push(CC['token'], s, {**sv, 'locked': False, 'stagger_cold': '9'}); assert res['status'] == 'applied', res
    v = res['record']['data']['values']
    assert v['locked'] is False and v['stagger_cold'] == '5' and v['unlocked_by'] == CC['user']['id'], v
    # a role that can't edit sheets can't lock one either: the driver's lock is dropped
    DRV = member('driver44@test.com', 'Driver')
    s = rec(SH); res = push(DRV['token'], s, {**s['data']['values'], 'locked': True})
    assert not rec(SH)['data']['values'].get('locked'), res
    # the mechanic locks it; the owner unlocks in the app
    s = rec(SH); assert push(MEC['token'], s, {**s['data']['values'], 'locked': True, 'locked_by': MEC['user']['id'], 'locked_at': now()})['status'] == 'applied'
    page.goto(B + '/'); synced()
    page.goto(B + f'/r/setup/{SH}')
    expect(page.locator('[data-testid="locked-notice"]')).to_contain_text(re.compile('Mech44', re.I), timeout=30000)
    page.get_by_role('button', name='Unlock').click()
    expect(page.locator('[data-testid="locked-notice"]')).to_have_count(0)
    expect(page.locator('#f-stagger_cold')).to_be_editable()
    until(lambda: rec(SH)['data']['values']['locked'] is False)

    # ---- the setup hand (can edit sheets, can't unlock) sees a locked sheet read-only with no Unlock
    s = rec(SH); assert push(OT, s, {**s['data']['values'], 'locked': True, 'locked_by': o['user']['id'], 'locked_at': now()})['status'] == 'applied'
    session(MEC)
    page.goto(B + f'/r/setup/{SH}')
    expect(page.locator('[data-testid="locked-notice"]')).to_contain_text('someone whose role can unlock')
    expect(page.get_by_role('button', name='Unlock')).to_have_count(0)
    expect(page.get_by_role('button', name='Lock sheet')).to_have_count(0)
    shot('44-04-mechanic')
    br.close()

errors = [e for e in errors if 'denied' not in e.lower()]
assert not errors, errors
print('E2E44 OK')
