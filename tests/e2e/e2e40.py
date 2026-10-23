# Multi-day events: one event with a row per day (gaps allowed, names, start times, rained out), day tabs and
# sheets by day, the setup sheet's Day pick, keeping a day that has sheets, the month view and list, quick edit,
# older date ranges, the server keeping days and dates in step, shared dates carrying their days, and iCal feeds.
import json, os, re, sys, time, urllib.request, urllib.error, uuid
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
def raw(url):
    with urllib.request.urlopen(url) as r: return r.read().decode()
login = lambda e='owner@test.com', p='password1': call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
now = lambda: datetime.now(timezone.utc).isoformat()
iso = lambda s, n=0: (date.fromisoformat(s) + timedelta(days=n)).isoformat()
d = lambda n: (date.today() + timedelta(days=n)).isoformat()

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Multi-day Racing', 'plan': 'pro', 'practice': True}); TID = t['id']
o = login(); OT = o['token']
# the racing year starts the month before today's, so every date below is in this racing year
start = date.today() - timedelta(days=35)
settings = next(m for m in o['memberships'] if m['tenant_id'] == TID).get('settings') or {}
assert call(f'/t/{TID}', OT, 'PATCH', {'settings': {**settings, 'calendar_season_start': start.month}})[0] == 200
o = login(); OT = o['token']
recs = lambda: [r for r in call(f'/t/{TID}/sync?since=0', OT)[1]['records'] if not r['deleted']]
rec_of = lambda rid: next(r for r in recs() if r['id'] == rid)
def until(check, what, timeout=20):
    # the app syncs in the background: wait for the server to have it
    end = time.time() + timeout
    while True:
        try:
            got = check()
            if got: return got
        except (StopIteration, KeyError, IndexError):
            pass
        if time.time() > end: raise AssertionError(f'timed out waiting for {what}')
        time.sleep(0.5)
def push(type, rid, values, **extra):
    st, r = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [{'id': rid, 'type': type, 'data': {'values': values, **extra}, 'client_updated_at': now()}]})
    assert st == 200, r
    return r['results'][0]
R = recs()
classic = next(r for r in R if r['type'] == 'event' and r['data']['values'].get('name') == 'Valley Spring Classic')
cv = classic['data']['values']
D1, D2 = cv['date'], cv['end_date']
assert cv['multi_day'] is True and [x['date'] for x in cv['days']] == [D1, D2] and iso(D1, 2) == D2, cv   # a night off between
car17 = next(r for r in R if r['type'] == 'car' and r['data']['values']['name'] == 'Car 17')
gtrack = next(r for r in R if r['type'] == 'track' and r['global'])

# ---- the server keeps the days and the date span in step, whatever app sent the change
legacy = str(uuid.uuid4())
res = push('event', legacy, {'name': 'Old app weekend', 'date': d(30), 'end_date': d(32), 'track': 'Hilltop', 'car': car17['id'], 'intent': 'Planned'})
lv = res['record']['data']['values']
assert lv['multi_day'] is True and [(x['n'], x['date']) for x in lv['days']] == [(1, d(30)), (2, d(31)), (3, d(32))], lv  # a date-to-end-date run becomes days
moved = push('event', legacy, {**lv, 'date': d(37), 'end_date': d(39)})['record']['data']['values']          # an older app moves the dates only
assert [(x['n'], x['date']) for x in moved['days']] == [(1, d(37)), (2, d(38)), (3, d(39))], moved
messy = push('event', str(uuid.uuid4()), {'name': 'Messy', 'multi_day': True, 'date': '2000-01-01', 'car': car17['id'], 'track': 'X',
                                         'days': [{'n': 4, 'date': d(50)}, {'date': d(48), 'label': 'Practice', 'status': 'Rained out', 'time': '6pm'}, {'n': 4, 'date': d(52)}]})['record']['data']['values']
assert [x['date'] for x in messy['days']] == [d(48), d(50), d(52)] and messy['date'] == d(48) and messy['end_date'] == d(52), messy
assert sorted(x['n'] for x in messy['days']) == [4, 5, 6] and 'time' not in messy['days'][0] and messy['days'][0]['status'] == 'Rained out', messy  # numbered, cleaned
single = push('event', str(uuid.uuid4()), {'name': 'Switched off', 'multi_day': False, 'date': d(60), 'end_date': d(61), 'days': [{'n': 1, 'date': d(60)}], 'car': car17['id'], 'track': 'X'})['record']['data']['values']
assert 'days' not in single and 'end_date' not in single and single['date'] == d(60), single

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    s = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    shot = lambda n, full=True: page.screenshot(path=f'{OUT}/{n}.png', full_page=full)

    # ---- the list: one row, its days
    page.goto(B + '/events')
    row = page.locator('.list-row:has-text("Valley Spring Classic")')
    expect(row).to_have_count(1)
    expect(row).to_contain_text('2 days')
    lines = row.locator('[data-testid="day-lines"] .day-line')                       # a line for each day, under the event
    expect(lines).to_have_count(2)
    expect(lines.nth(0)).to_contain_text('Practice & prelims'); expect(lines.nth(0)).to_contain_text('Day 1 of 2')
    expect(lines.nth(1)).to_contain_text('Finals'); expect(lines.nth(1)).to_contain_text('Day 2 of 2')
    expect(page.locator('.list-row:has-text("Valley Speedway — Club night") [data-testid="day-lines"]')).to_have_count(0)   # one-day event: none
    shot('40-00-events-list')

    # ---- the event: a tab per day, named; a sheet goes on the tab you're on
    page.goto(B + f"/events/{classic['id']}")
    tabs = page.locator('.day-tabs button')
    expect(tabs).to_have_count(2)
    expect(tabs.nth(0)).to_contain_text('Practice & prelims'); expect(tabs.nth(1)).to_contain_text('Finals')
    expect(page.locator('.day-tabs button[data-day="1"]')).to_have_class('active')   # before the meeting: the first day
    expect(page.locator('[data-testid="day-note"]')).to_contain_text('Starts')
    page.click('.day-tabs button[data-day="2"]')
    expect(page.locator('.event-car h2, .event-car h3').first).to_contain_text('Finals')
    page.select_option('.add-session select', 'Feature')
    page.click('.add-session button:has-text("Add session")')
    page.click('button.start-opt:has-text("Blank sheet")')
    day = page.locator('#f-day')
    expect(day).to_have_value('2')
    opts = day.locator('option').all_inner_texts()
    assert any(x.startswith('Day 1 · ') and 'Practice & prelims' in x for x in opts) and any(x.startswith('Day 2 · ') and x.endswith('Finals') for x in opts), opts
    shot('40-01-sheet-day')
    page.get_by_role('button', name='Save', exact=True).first.click()
    expect(page.locator('.day-tabs button[data-day="2"] .tab-count')).to_have_text('1')
    expect(page.locator('.day-tabs button[data-day="1"] .tab-count')).to_have_text('')
    sheet = until(lambda: next(r for r in recs() if r['type'] == 'setup' and r['data']['values'].get('event') == classic['id']), 'the Feature sheet')
    assert str(sheet['data']['values']['day']) == '2', sheet['data']['values']
    shot('40-02-event-tabs')

    # ---- edit the days: add one, rain out the first; date and end date follow
    page.goto(B + f"/r/event/{classic['id']}")
    expect(page.locator('#f-multi_day')).to_be_checked()
    expect(page.locator('#f-date')).to_have_count(0); expect(page.locator('#f-end_date')).to_have_count(0)
    df = page.locator('[data-testid="days-field"]')
    expect(df.locator('.day-row')).to_have_count(2)
    expect(df.locator('.day-row[data-day="2"]')).to_contain_text('1 sheet')                         # can't be removed
    expect(df.locator('.day-row[data-day="2"] button[aria-label^="Remove"]')).to_have_count(0)
    page.select_option('[aria-label="Number of days"]', '3')
    expect(df.locator('.day-row')).to_have_count(3)
    expect(page.get_by_label('Day 3 date')).to_have_value(iso(D2, 1))
    page.fill('[aria-label="Day 3 name"]', 'Spare day')
    page.select_option('[aria-label="Day 1 status"]', 'Rained out')
    shot('40-03-days-field')
    page.get_by_role('button', name='Save', exact=True).first.click()
    expect(page.locator('h1')).to_have_text('Valley Spring Classic')
    v = until(lambda: (lambda x: x if len(x.get('days', [])) == 3 else None)(rec_of(classic['id'])['data']['values']), 'three days')
    assert [(x['n'], x['date']) for x in v['days']] == [(1, D1), (2, D2), (3, iso(D2, 1))] and v['end_date'] == iso(D2, 1), v
    assert v['days'][0]['status'] == 'Rained out' and v['days'][2]['label'] == 'Spare day', v
    expect(page.locator('.day-tabs button')).to_have_count(3)
    expect(page.locator('.day-tabs button[data-day="1"]')).to_have_class(re.compile(r'\boff\b'))

    # fewer days stops at a day with sheets; unticking is refused while a later day has them
    page.goto(B + f"/r/event/{classic['id']}")
    page.click('[aria-label="Remove day 3"]')
    expect(df.locator('.day-row')).to_have_count(2)
    page.locator('#f-multi_day').uncheck()
    page.get_by_role('button', name='Save', exact=True).first.click()
    expect(page.locator('.error-text').first).to_contain_text('1 sheet is on day 2')
    page.wait_for_timeout(800)
    assert len(rec_of(classic['id'])['data']['values']['days']) == 3, 'not saved'
    page.locator('#f-multi_day').check()
    page.get_by_role('button', name='Save', exact=True).first.click()
    expect(page.locator('h1')).to_have_text('Valley Spring Classic')
    v = until(lambda: (lambda x: x if len(x.get('days', [])) == 2 else None)(rec_of(classic['id'])['data']['values']), 'two days again')
    assert [x['date'] for x in v['days']] == [D1, D2] and v['end_date'] == D2, v

    # ---- the calendar: one entry; the month marks only the days it runs, a rained-out day crossed out
    page.goto(B + '/calendar')
    crow = page.locator(f'.cal-row[data-event="{classic["id"]}"]')
    expect(crow).to_have_count(1)
    clines = crow.locator('[data-testid="day-lines"] .day-line')
    expect(clines).to_have_count(2)
    expect(clines.nth(0)).to_have_class(re.compile(r'\boff\b'))                         # rained out: crossed out
    expect(clines.nth(1).locator('a')).to_have_attribute('href', f'/events/{classic["id"]}?day=2')   # opens that day
    crow.locator('button:has-text("Edit")').click()
    expect(crow.locator('[data-testid="quick-edit"] .qe-days')).to_contain_text('All details')   # days with gaps: changed in the full form
    expect(crow.locator('[aria-label="End date"]')).to_have_count(0)
    crow.locator('button:has-text("Cancel")').click()
    page.click('.seg button:has-text("Month")')
    def day_cell(ds):
        dt = date.fromisoformat(ds)
        return page.locator(f'section.month:has(h3:text-is("{dt.strftime("%B")} {dt.year}")) .mg-d').nth(dt.day - 1)
    expect(day_cell(D1)).to_have_class('mg-d has off')
    expect(day_cell(D2)).to_have_class('mg-d has')
    expect(day_cell(iso(D1, 1))).to_have_class('mg-d')                                           # the night off isn't marked
    expect(day_cell(D2).locator('a')).to_have_attribute('href', f'/events/{classic["id"]}?day=2')
    shot('40-04-month')
    page.click('.seg button:has-text("List")')

    # quick edit of days in a row: the end date adds a day, the date moves them all
    lrow = page.locator(f'.cal-row[data-event="{legacy}"]')
    lrow.locator('button:has-text("Edit")').click()
    qe = lrow.locator('[data-testid="quick-edit"]')
    qe.get_by_label('End date', exact=True).fill(d(40))
    qe.get_by_label('Date', exact=True).fill(d(44))
    expect(qe.get_by_label('End date', exact=True)).to_have_value(d(47))
    qe.locator('button:has-text("Save")').click()
    lv = until(lambda: (lambda x: x if len(x['days']) == 4 else None)(rec_of(legacy)['data']['values']), 'four days')
    assert [(x['n'], x['date']) for x in lv['days']] == [(1, d(44)), (2, d(45)), (3, d(46)), (4, d(47))], lv

    # ---- a shared date over two nights with a gap: teams get its days, and changes follow
    fx = {'name': 'Gap Title', 'venue': gtrack['id'], 'status': 'Scheduled', 'multi_day': True, 'date': d(20),
          'days': [{'n': 1, 'date': d(20), 'label': 'Night 1'}, {'n': 2, 'date': d(22), 'label': 'Night 2', 'time': '18:30'}]}
    st, r = call('/admin/calendar/fixtures/new', OT, 'PUT', {'values': fx}); assert st == 200, r; FX = r['id']
    page.goto(B + '/calendar?tab=shared&show=all'); page.reload(); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    frow = page.locator(f'[data-fixture="{FX}"]')
    expect(frow).to_contain_text('2 days')
    expect(frow.locator('.day-line')).to_have_count(2); expect(frow.locator('.day-line').nth(1)).to_contain_text('Night 2')
    frow.locator('button:has-text("Add to our calendar")').click()
    af = frow.locator('[data-testid="add-fx"]')
    af.locator('label:has-text("Car 17") input').check()
    af.locator('button:has-text("Add to our calendar")').click()
    expect(frow).to_contain_text('On our calendar')
    ev = until(lambda: next(r for r in recs() if r['type'] == 'event' and r['data']['values'].get('fixture') == FX), 'the entry from the shared date')
    ev_v = ev['data']['values']
    assert ev_v['multi_day'] and [(x['n'], x['date'], x.get('label')) for x in ev_v['days']] == [(1, d(20), 'Night 1'), (2, d(22), 'Night 2')], ev_v
    assert ev_v['end_date'] == d(22)
    # the admin rains out night 1: the team's entry follows; moving the dates only moves the days
    g = next(r for r in recs() if r['id'] == FX)['data']['values']
    days2 = [{**g['days'][0], 'status': 'Rained out'}, g['days'][1]]
    assert call(f'/admin/calendar/fixtures/{FX}', OT, 'PUT', {'values': {**g, 'days': days2}})[0] == 200
    assert rec_of(ev['id'])['data']['values']['days'][0]['status'] == 'Rained out'
    # the team adds its own practice day (with a sheet) the night before
    ev_v = rec_of(ev['id'])['data']['values']
    push('event', ev['id'], {**ev_v, 'days': ev_v['days'] + [{'n': 3, 'date': d(19), 'label': 'Our test day'}]}, form_id=ev['data'].get('form_id'))
    push('setup', str(uuid.uuid4()), {'event': ev['id'], 'car': car17['id'], 'session': 'Practice', 'day': '3'})
    # an older app (or the API) moves the shared date a week, giving only the new date and end date
    g = next(r for r in recs() if r['id'] == FX)['data']['values']
    assert call(f'/admin/calendar/fixtures/{FX}', OT, 'PUT', {'values': {k: x for k, x in g.items() if k not in ('days', 'multi_day')} | {'date': d(27), 'end_date': d(29)}})[0] == 200
    g2 = next(r for r in recs() if r['id'] == FX)['data']['values']
    assert [(x['n'], x['date']) for x in g2['days']] == [(1, d(27)), (2, d(29))] and g2['days'][0]['label'] == 'Night 1', g2   # the gap and names kept
    ev_days = rec_of(ev['id'])['data']['values']['days']
    assert [(x['n'], x['date']) for x in ev_days] == [(3, d(19)), (1, d(27)), (2, d(29))], ev_days                      # our day with a sheet stays

    # ---- iCal: one entry per day, the first keeps the meeting's id
    ics = raw(f'{B}/api/public/shared/track/{gtrack["id"]}.ics')
    assert f'UID:{FX}@raceops-shared' in ics and f'UID:{FX}-d2@raceops-shared' in ics and 'Gap Title — Night 2' in ics, ics
    assert 'RAINED OUT: Gap Title — Night 1' in ics, ics
    pub = call(f'/t/{TID}/calendar/publish', OT, 'PUT', {'on': True})[1]['calendar_publish']
    ics = raw(f'{B}/api/public/calendar/{pub["token"]}.ics')
    assert f'UID:{classic["id"]}@raceops' in ics and f'UID:{classic["id"]}-d2@raceops' in ics, ics
    assert 'SUMMARY:Valley Spring Classic — Valley Speedway — Finals' in ics and f'DTSTART;VALUE=DATE:{D2.replace("-", "")}' in ics, ics
    assert f'DTSTART;VALUE=DATE:{iso(D1, 1).replace("-", "")}' not in ics, 'the night off has no entry'
    page.goto(B + f'/c/{pub["token"]}')
    expect(page.locator(f'.cal-table tr:has-text("Valley Spring Classic") .cs-date')).to_contain_text('&')
    expect(page.locator(f'.cal-table tr:has-text("Valley Spring Classic") .day-line').nth(1)).to_contain_text('Finals')
    shot('40-05-public')

    # ---- older events open as their days; the guide explains it
    page.goto(B + f'/r/event/{legacy}')
    expect(page.locator('[data-testid="days-field"] .day-row')).to_have_count(4)
    page.goto(B + '/help/events-sessions')
    expect(page.locator('h2:has-text("Multi-day events")')).to_be_visible()

    # ---- phone: the days editor fits the screen
    m = br.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    m.on('pageerror', lambda e: errors.append(str(e)))
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    m.goto(B + f"/r/event/{classic['id']}")
    expect(m.locator('[data-testid="days-field"] .day-row')).to_have_count(2)
    assert m.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'no sideways scrolling'
    m.locator('[data-testid="days-field"]').scroll_into_view_if_needed()
    m.screenshot(path=f'{OUT}/40-06-mobile-days.png')
    m.goto(B + f"/events/{classic['id']}")
    expect(m.locator('.day-tabs button')).to_have_count(2)
    m.screenshot(path=f'{OUT}/40-07-mobile-tabs.png')
    br.close()

assert not errors, errors
print('E2E40 OK')
