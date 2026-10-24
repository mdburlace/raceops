import json, sys, os, uuid, glob, urllib.request, urllib.error
from datetime import datetime, timezone, date, timedelta
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
OUTBOX = os.environ.get('MAIL_OUTBOX', '/var/tmp/outbox')
errors = []
def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
def raw(url):
    with urllib.request.urlopen(url) as r: return r.status, r.read().decode()
def shot(page, name, full=False):
    page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
def mails(to=None, subject=None):
    out = []
    for f in sorted(glob.glob(f'{OUTBOX}/*.json')):
        m = json.load(open(f))
        if (not to or to in m['to']) and (not subject or subject in m['subject']): out.append(m)
    return out
def wait_mail(to=None, subject=None, secs=5):
    import time
    for _ in range(secs * 5):
        m = mails(to, subject)
        if m: return m
        time.sleep(0.2)
    return []
now = datetime.now(timezone.utc).isoformat()
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
d = lambda n: (date.today() + timedelta(days=n)).isoformat()
login = lambda e, p: call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
def push(tok, tid, recs):
    st, r = call(f'/t/{tid}/sync', tok, 'POST', {'changes': recs}); assert st == 200, r
    assert {x['status'] for x in r['results']} == {'applied'}, r
def records(tok, tid):
    return {r['id']: r for r in call(f'/t/{tid}/sync?since=0', tok)[1]['records']}
def team(name, email, pw):
    st, t = call('/admin/tenants', OT, 'POST', {'name': name, 'plan': 'pro'}); tid = t['id']
    roles = call(f'/t/{tid}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
    chief = next(r for r in roles if r['name'] == 'Crew Chief')
    st, inv = call(f'/t/{tid}/invites', OT, 'POST', {'email': email, 'role_id': chief['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
    assert call(f'/invites/{tok}/accept', method='POST', body={'name': name + ' Chief', 'password': pw})[0] == 200
    return tid, login(email, pw)

o = login('owner@test.com', 'password1'); OT = o['token']
TA, ca = team('Club Team', 'club@cal.com', 'password7'); CA = ca['token']
TB, cb = team('Follower Team', 'follow@cal.com', 'password8'); CB = cb['token']
TC, cc = team('Feed Source', 'feed@cal.com', 'password9'); CC = cc['token']
o = login('owner@test.com', 'password1'); OT = o['token']
recs0 = call(f'/t/{TA}/sync?since=0', OT)[1]['records']
form = lambda target: next(r['id'] for r in recs0 if r['type'] == 'form' and r['data']['target'] == target)
FF, EF, SF, TF, CF = form('fixture'), form('event'), form('series'), form('track'), form('car')
YEAR = str((date.today() - timedelta(days=35)).year)

# shared records
G1 = rec('track', {'name': 'Plus Valley Speedway', 'city': 'Valley', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TF, scope='global')
G2 = rec('track', {'name': 'Plus Hill Raceway', 'city': 'Hill', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TF, scope='global')
GS = rec('series', {'name': 'Plus Summer Series', 'season': YEAR, 'class': '410 Sprintcars'}, form_id=SF, scope='global')
W1 = rec('series', {'name': 'Winter Cup', 'season': YEAR, 'class': '410 Sprintcars'}, form_id=SF, scope='global')
W2 = rec('series', {'name': 'Winter Cup Sprintcars', 'season': YEAR, 'class': '410 Sprintcars'}, form_id=SF, scope='global')
F1 = rec('fixture', {'name': 'Summer Rd 1', 'date': d(15), 'venue': G1['id'], 'series': GS['id'], 'round': 1, 'classes': ['410 Sprintcars'], 'status': 'Scheduled'}, form_id=FF, scope='global')
F2 = rec('fixture', {'name': 'Hill Night', 'date': d(16), 'venue': G2['id'], 'classes': ['410 Sprintcars'], 'status': 'Scheduled'}, form_id=FF, scope='global')   # clashes with F1 (same day, QLD, same class)
FP = rec('fixture', {'name': 'Valley Opener', 'date': d(-8), 'venue': G1['id'], 'status': 'Scheduled'}, form_id=FF, scope='global')   # past: results
FW = rec('fixture', {'name': 'Winter Rd 1', 'date': d(40), 'venue': G2['id'], 'series': W2['id'], 'round': 1, 'status': 'Scheduled'}, form_id=FF, scope='global')
push(OT, TA, [G1, G2, GS, W1, W2, F1, F2, FP, FW])
car = rec('car', {'number': '5', 'name': 'Club car', 'class': '410 Sprintcars', 'active': True}, form_id=CF)
EA = rec('event', {'name': 'Summer Rd 1', 'date': d(15), 'venue': G1['id'], 'series': GS['id'], 'round': 1, 'fixture': F1['id'], 'car': car['id'], 'intent': 'Planned'}, form_id=EF)
EP = rec('event', {'name': 'Valley Opener', 'date': d(-8), 'venue': G1['id'], 'fixture': FP['id'], 'car': car['id'], 'intent': 'Planned'}, form_id=EF)
EW = rec('event', {'name': 'Winter Rd 1', 'date': d(40), 'venue': G2['id'], 'series': W2['id'], 'round': 1, 'fixture': FW['id'], 'car': car['id'], 'intent': 'Planned'}, form_id=EF)
push(CA, TA, [car, EA, EP, EW])
# team B follows the summer series and the Winter Cup that will be merged away
FB1 = rec('follow', {'entity_type': 'series', 'entity': GS['id']}); FB2 = rec('follow', {'entity_type': 'series', 'entity': W2['id']})
push(CB, TB, [FB1, FB2])

def session(page, lg, tid):
    s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': tid}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    def new_page():
        p = br.new_page(viewport={'width': 1366, 'height': 900})
        p.on('pageerror', lambda e: errors.append(str(e)))
        p.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
        return p
    pa = new_page(); session(pa, o, TB)   # platform admin (signed in to the follower team)

    # ---- 2. officials: the club team looks after the summer series, its changes go live straight away ----
    pa.goto(B + f'/admin/calendar?show=series:{GS["id"]}')
    pa.click('.cal-crumb button:has-text("Officials")')
    op = pa.locator('[data-testid="officials"]')
    op.locator('select').select_option(label='Club Team')
    op.locator('button:has-text("Add official")').click()
    expect(op).to_contain_text('Club Team'); expect(op).to_contain_text('Auto-approve')
    st, r = call(f'/t/{TA}/calendar/requests', CA, 'POST', {'kind': 'change', 'subject_type': 'fixture', 'subject_id': F1['id'],
                                                           'values': {**F1['data']['values'], 'start_time': 'Gates 4 pm'}})
    assert st == 200 and r['auto'] == 'approved', r
    assert records(CA, TA)[F1['id']]['data']['values']['start_time'] == 'Gates 4 pm'
    # moving the date clashes with nothing, so it's automatic too — and the team's event follows
    st, r = call(f'/t/{TA}/calendar/requests', CA, 'POST', {'kind': 'change', 'subject_type': 'fixture', 'subject_id': F1['id'],
                                                           'values': {**F1['data']['values'], 'start_time': 'Gates 4 pm', 'date': d(16)}})
    assert r['auto'] == 'approved', r
    assert records(CA, TA)[EA['id']]['data']['values']['date'] == d(16)
    # ---- 6. followers hear about it (notice + email) ----
    nb = call(f'/t/{TB}/notices', CB)[1]['notices']
    assert any('Plus Summer Series: Summer Rd 1 moved' in n['title'] for n in nb), nb
    assert wait_mail('follow@cal.com', 'Summer Rd 1 moved'), [m['subject'] for m in mails()]

    # ---- 3. questions: the admin asks, the team answers, then approves ----
    st, r = call(f'/t/{TA}/calendar/requests', CA, 'POST', {'kind': 'share', 'subject_type': 'dates', 'dates': [{'name': 'Hill Spring Special', 'date': d(30), 'venue': G2['id'], 'status': 'Scheduled'}]})
    assert r['auto'] is None; RQ = r['id']
    assert wait_mail(o['user']['email'], 'New request: Date: Hill Spring Special')   # admin emailed
    pa.goto(B + '/admin/calendar?tab=requests')
    card = pa.locator(f'[data-request="{RQ}"]')
    card.locator('input[aria-label="Question for the team"]').fill('Is it Saturday or Sunday?')
    card.locator('button:has-text("Ask the team")').click()
    expect(card).to_have_count(0)
    pa.click('.seg button:has-text("Asked the team")')
    expect(pa.locator(f'[data-request="{RQ}"]')).to_contain_text('Is it Saturday or Sunday?')
    assert wait_mail('club@cal.com', 'Question about')
    p1 = new_page(); session(p1, ca, TA)
    expect(p1.locator('nav a:has-text("Calendar") .nav-badge')).to_be_visible()
    p1.goto(B + '/calendar?tab=requests')
    row = p1.locator(f'[data-request="{RQ}"]')
    expect(row).to_contain_text('Question for you'); expect(row).to_contain_text('Is it Saturday or Sunday?')
    row.locator('input[aria-label="Your answer"]').fill('Saturday night')
    row.locator('button:has-text("Send answer")').click()
    expect(row).to_contain_text('Waiting for approval')
    assert wait_mail(o['user']['email'], 'Reply on')
    pa.click('.seg button:has-text("Waiting")')
    card = pa.locator(f'[data-request="{RQ}"]')
    expect(card.locator('[data-testid="thread"]')).to_contain_text('Saturday night')
    shot(pa, '28-01-thread')
    card.locator('button:has-text("Approve")').click(); expect(card).to_have_count(0)
    assert wait_mail('club@cal.com', 'was approved')

    # ---- 10. results: a team reports the feature result of a past date ----
    p1.goto(B + '/calendar?tab=shared&show=all')
    fr = p1.locator(f'[data-fixture="{FP["id"]}"]')
    fr.locator('button:has-text("Report results")').click()
    rr = fr.locator('[data-testid="report-results"]')
    rr.locator('#f-entries').fill('24')
    rr.locator('input[aria-label="Car # row 1"]').fill('17'); rr.locator('input[aria-label="Driver row 1"]').fill('Jamie Veal')
    rr.locator('input[aria-label="Car # row 2"]').fill('5'); rr.locator('input[aria-label="Driver row 2"]').fill('Club Driver')
    rr.locator('button:has-text("Send results")').click()
    expect(p1.locator('[data-testid="shared-msg"]')).to_contain_text('Results sent')
    reqs = call('/admin/calendar/requests', OT)[1]['requests']
    res_rq = next(x for x in reqs if x['subject_id'] == FP['id'])
    assert call(f'/admin/calendar/requests/{res_rq["id"]}/decide', OT, 'POST', {'action': 'approve'})[0] == 200
    fpv = records(CA, TA)[FP['id']]['data']['values']
    assert fpv['entries'] == 24 or fpv['entries'] == '24', fpv
    assert [r['driver'] for r in fpv['results']] == ['Jamie Veal', 'Club Driver'], fpv['results']   # blank template rows dropped
    p1.reload(); expect(p1.locator('text=Synced')).to_be_visible(timeout=30000)
    p1.goto(B + '/calendar?tab=shared&show=all')
    fr = p1.locator(f'[data-fixture="{FP["id"]}"]')
    expect(fr).to_contain_text('Won by #17 Jamie Veal · 24 entries')
    fr.locator('button:has-text("Results")').first.click()
    expect(fr.locator('[data-testid="results"]')).to_contain_text('Club Driver')
    shot(p1, '28-02-results')
    p1.goto(B + '/calendar?tab=ours')
    expect(p1.locator(f'[data-event="{EP["id"]}"]')).to_contain_text('Won by #17 Jamie Veal')

    # ---- 9. clashes ----
    p1.goto(B + '/calendar?tab=shared&show=clashes')
    cl = p1.locator('[data-testid="clashes"]')
    expect(cl).to_contain_text('2 meetings · QLD'); expect(cl).to_contain_text('Same class: 410 Sprintcars')
    expect(cl).to_contain_text('Hill Night')
    shot(p1, '28-03-clashes')

    # ---- 4. merge duplicates ----
    pa.goto(B + '/admin/calendar?show=series')
    pa.click('button:has-text("Find duplicates")')
    dp = pa.locator('[data-testid="duplicates"]')
    pair = dp.locator('.dup-row:has-text("Winter Cup")')
    expect(pair).to_contain_text('Winter Cup Sprintcars')
    pa.once('dialog', lambda dlg: dlg.accept())
    # keep "Winter Cup" (W1): merge W2 into it
    first_is_w1 = pair.inner_text().strip().startswith('Winter Cup (')
    pair.locator('button:has-text("Keep the first")' if first_is_w1 else 'button:has-text("Keep the second")').click()
    expect(dp).to_contain_text('Merged Winter Cup Sprintcars into Winter Cup')
    mine = records(CA, TA)
    assert mine[EW['id']]['data']['values']['series'] == W1['id'] and mine[FW['id']]['data']['values']['series'] == W1['id'] and mine[W2['id']]['deleted']
    fol = [r for r in records(CB, TB).values() if r['type'] == 'follow' and not r['deleted']]
    assert sorted(f['data']['values']['entity'] for f in fol) == sorted([GS['id'], W1['id']]), fol

    # ---- 5. history & restore ----
    assert call(f'/admin/calendar/fixtures/{FW["id"]}', OT, 'PUT', {'values': {**mine[FW['id']]['data']['values'], 'date': d(45)}})[0] == 200
    assert records(CA, TA)[EW['id']]['data']['values']['date'] == d(45)
    pa.goto(B + f'/admin/calendar?show=series:{W1["id"]}')
    fx = pa.locator(f'[data-fixture="{FW["id"]}"]')
    fx.locator('button:has-text("History")').click()
    hp = fx.locator('[data-testid="history"]')
    expect(hp.locator('.hist-row')).to_have_count(3)   # created, merged series, moved date
    expect(hp.locator('.hist-row').first).to_contain_text('date: ')
    expect(hp.locator('.hist-row').nth(1)).to_contain_text('series: Winter Cup')
    shot(pa, '28-04-history')
    pa.once('dialog', lambda dlg: dlg.accept())
    hp.locator('.hist-row').nth(1).locator('button:has-text("Restore this version")').click()
    pa.wait_for_timeout(1000)
    assert records(CA, TA)[EW['id']]['data']['values']['date'] == d(40)

    # ---- 7. official feed: another team's published calendar stands in for the series' feed ----
    fc = [rec('event', {'name': 'Feed Night 1', 'date': d(50), 'venue': G1['id'], 'car': None, 'intent': 'Planned'}, form_id=EF),
          rec('event', {'name': 'Feed Night 2', 'date': d(57), 'venue': G2['id'], 'intent': 'Planned'}, form_id=EF)]
    for e in fc: e['data']['values'] = {k: v for k, v in e['data']['values'].items() if v is not None}
    push(CC, TC, fc)
    tok = call(f'/t/{TC}/calendar/publish', OT, 'PUT', {'on': True})[1]['calendar_publish']['token']
    feed_url = f'{B}/api/public/calendar/{tok}.ics'
    pa.goto(B + f'/admin/calendar?show=series:{GS["id"]}')
    pa.click('.cal-crumb button:has-text("Feed")')
    fp = pa.locator('[data-testid="feed"]')
    pa.wait_for_load_state('networkidle')   # the panel loads the series' feed first, which resets the box
    fp.locator('input[aria-label="Feed link"]').fill(feed_url)
    expect(fp.locator('button:has-text("Add feed")')).to_be_enabled()
    fp.locator('button:has-text("Add feed")').click()
    expect(fp.locator('[data-testid="feed-status"]')).to_contain_text('2 new, 0 changed')
    reqs = call('/admin/calendar/requests', OT)[1]['requests']
    feed_rq = next(x for x in reqs if x['source'] == 'feed')
    assert feed_rq['title'].startswith('Feed: Plus Summer Series — 2 new dates') and feed_rq['team'] == 'Official feed'
    assert {it['values'].get('venue') for it in feed_rq['payload']['items']} == {G1['id'], G2['id']}   # tracks matched from the feed's locations
    assert call(f'/admin/calendar/requests/{feed_rq["id"]}/decide', OT, 'POST', {'action': 'approve'})[0] == 200
    fp.locator('button:has-text("Check now")').click()
    expect(fp.locator('[data-testid="feed-status"]')).to_contain_text('Up to date')
    # the date moves at the source: a change request arrives
    fc[0]['data']['values']['date'] = d(51); fc[0]['client_updated_at'] = datetime.now(timezone.utc).isoformat()
    push(CC, TC, [fc[0]])
    fp.locator('button:has-text("Check now")').click()
    expect(fp.locator('[data-testid="feed-status"]')).to_contain_text('0 new, 1 changed')
    ch = next(x for x in call('/admin/calendar/requests', OT)[1]['requests'] if x['source'] == 'feed' and x['kind'] == 'change')
    assert ch['payload']['values']['date'] == d(51)

    # ---- 8. public page and subscribe link for a shared series ----
    st, body = raw(f'{B}/api/public/shared/series/{GS["id"]}.ics')
    assert st == 200 and 'SUMMARY:Summer Rd 1' in body and 'Feed Night 2' in body, body
    pp = new_page(); pp.goto(B + f'/cal/series/{GS["id"]}')
    sh = pp.locator('[data-testid="cal-sheet"]')
    expect(sh.locator('h1')).to_contain_text('Plus Summer Series — race calendar')
    expect(sh).to_contain_text('Summer Rd 1'); expect(sh).to_contain_text('Feed Night 2')
    shot(pp, '28-05-public-series', True)

    # ---- 6. follower team: Updates tab, badge, and following a track from its page ----
    p2 = new_page(); session(p2, cb, TB)
    expect(p2.locator('[data-testid="request-notice"]')).to_contain_text('updates to series or tracks you follow')
    p2.goto(B + '/calendar?tab=updates')
    up = p2.locator('[data-testid="updates"]')
    expect(up).to_contain_text('Summer Rd 1 moved'); expect(up).to_contain_text('Feed Night 1 — Plus Valley Speedway added')
    expect(p2.locator('[data-testid="following"]')).to_contain_text('Plus Summer Series')
    shot(p2, '28-06-updates')
    p2.goto(B + f'/tracks/{G2["id"]}')
    p2.click('button:has-text("Follow")')
    expect(p2.locator('button:has-text("✓ Following")')).to_be_visible()
    p2.wait_for_timeout(1500)
    assert call(f'/admin/calendar/fixtures/new', OT, 'PUT', {'values': {'name': 'Hill Midweek', 'date': d(33), 'venue': G2['id'], 'status': 'Scheduled'}})[0] == 200
    assert any('Plus Hill Raceway: Hill Midweek added' in n['title'] for n in call(f'/t/{TB}/notices', CB)[1]['notices'])

    # ---- 1. email: settings show it's on; people can opt out ----
    pa.goto(B + '/admin/settings')
    expect(pa.locator('[data-testid="mail-status"]')).to_contain_text('Email is on')
    p2.goto(B + '/profile')
    p2.locator('label:has-text("Email me about shared-calendar requests") input').uncheck()
    p2.wait_for_timeout(1500)
    before = len(mails('follow@cal.com'))
    assert call(f'/admin/calendar/fixtures/new', OT, 'PUT', {'values': {'name': 'Hill Late Show', 'date': d(34), 'venue': G2['id'], 'status': 'Scheduled'}})[0] == 200
    p2.wait_for_timeout(800)
    assert len(mails('follow@cal.com')) == before, 'opted out'
    assert any('Hill Late Show' in n['title'] for n in call(f'/t/{TB}/notices', CB)[1]['notices'])   # still told in the app
    m = wait_mail('club@cal.com', 'was approved')[0]
    assert f'{B}/calendar?tab=requests' in m['text'], m   # the server's APP_URL must equal RACEOPS_URL
    br.close()
errs = [e for e in errors if 'Synced' not in e]
assert not errs, errs
print('E2E28 OK')
