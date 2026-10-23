# Multi-day events: what happened on each day (outcome, withdraw reason, result, notes), the overall result
# worked out from the days until one is picked, the days' results in day lines and chips, a picked overall
# result that stays, a read-only view, and the published calendar showing day results only with results on
# (never reasons or notes).
import json, os, re, sys, urllib.request, urllib.error
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
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Two Night Racing', 'plan': 'pro', 'practice': True}); assert st == 200, t; TID = t['id']
o = login(); OT = o['token']
roles = call(f'/t/{TID}/roles', OT)[1]
viewer = next(r for r in roles if r['name'] == 'Viewer')
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': 'viewer43@test.com', 'role_id': viewer['id']})
assert call(f'/invites/{inv["token"]}/accept', method='POST', body={'name': 'Viewer', 'password': 'password43'})[0] == 200
VW = login('viewer43@test.com', 'password43')
recs = lambda tok=OT: [r for r in call(f'/t/{TID}/sync?since=0', tok)[1]['records'] if not r['global'] and not r['deleted']]
classic = next(r for r in recs() if r['type'] == 'event' and r['data']['values'].get('name') == 'Valley Spring Classic')
event = lambda: next(r for r in recs() if r['id'] == classic['id'])['data']['values']

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

    # ---- day 1: missed the feature, with its result
    page.goto(B + f'/events/{classic["id"]}')
    page.locator('.day-tabs button', has_text='Practice & prelims').click()
    dr = page.locator('[data-testid="day-result"]')
    expect(dr).to_contain_text('Practice & prelims — what happened')
    dr.get_by_label(re.compile('What happened on Day 1')).select_option('Did not make the feature')
    dr.get_by_label(re.compile('Result on Day 1')).fill('Prelim B-main 3rd')
    dr.get_by_label(re.compile('Notes on Day 1')).click()   # leaving the box saves it
    dr.get_by_label(re.compile('Notes on Day 1')).fill('Too tight in the slick')
    page.locator('h1').click()
    expect(page.get_by_label('What happened at Valley Spring Classic')).to_have_value('Did not make the feature')
    expect(page.locator('[data-testid="overall-auto"]')).to_be_visible()

    # ---- day 2: withdrew (engine), then raced the feature: the overall result follows the days
    page.locator('.day-tabs button', has_text='Finals').click()
    dr.get_by_label(re.compile('What happened on Day 2')).select_option('Withdrew')
    dr.get_by_label(re.compile('Why we withdrew on Day 2')).select_option('Engine')
    expect(page.locator('.entry-card')).to_contain_text('Engine')
    expect(page.get_by_label('What happened at Valley Spring Classic')).to_have_value('Withdrew during the event')
    dr.get_by_label(re.compile('What happened on Day 2')).select_option('Raced the feature')
    dr.get_by_label(re.compile('Result on Day 2')).fill('Feature 6th')
    page.locator('h1').click()
    expect(page.get_by_label('What happened at Valley Spring Classic')).to_have_value('Raced the feature')
    chips = page.locator('[data-testid="days-summary"]')
    expect(chips).to_contain_text('Practice & prelims: Did not make the feature · Prelim B-main 3rd')
    expect(chips).to_contain_text('Finals: Raced the feature · Feature 6th')
    shot('43-01-event')
    synced()
    v = event()
    d1, d2 = v['days']
    assert d1['outcome'] == 'Did not make the feature' and d1['result'] == 'Prelim B-main 3rd' and d1['notes'] == 'Too tight in the slick', d1
    assert d2['outcome'] == 'Raced the feature' and 'withdraw_reason' not in d2 and d2['result'] == 'Feature 6th', d2
    assert v['outcome'] == 'Raced the feature' and v['outcome_auto'] is True and not v.get('withdraw_reason'), v

    # ---- the day lines in Events show what happened
    page.goto(B + '/events')
    lines = page.locator('[data-testid="day-lines"]').filter(has_text='Finals').first
    expect(lines.locator('[data-testid="day-outcome"]').first).to_have_text('Did not make the feature')
    expect(lines).to_contain_text('Feature 6th')

    # ---- an overall result picked by hand stays when a day changes
    page.goto(B + f'/events/{classic["id"]}?day=1')
    page.get_by_label('What happened at Valley Spring Classic').select_option('Did not attend')
    expect(page.locator('[data-testid="overall-auto"]')).to_have_count(0)
    page.locator('[data-testid="day-result"]').get_by_label(re.compile('What happened on Day 1')).select_option('Did not race')
    expect(page.get_by_label('What happened at Valley Spring Classic')).to_have_value('Did not attend')
    page.get_by_label('What happened at Valley Spring Classic').select_option('Raced the feature')
    synced()

    # ---- a viewer reads the day's result
    session(VW)
    page.goto(B + f'/events/{classic["id"]}?day=2')
    expect(page.locator('[data-testid="day-result"]')).to_contain_text('Raced the feature')
    expect(page.locator('[data-testid="day-result"]')).to_contain_text('Feature 6th')
    expect(page.locator('[data-testid="day-result"] select')).to_have_count(0)
    br.close()

# ---- the published calendar: day results only with results on; never reasons or notes
assert call(f'/t/{TID}/calendar/publish', OT, 'PUT', {'on': True, 'show_results': False})[0] == 200
pubtok = call(f'/t/{TID}/calendar/publish', OT, 'PUT', {'on': True})[1]['calendar_publish']['token']
item = lambda: next(i for i in call(f'/public/calendar/{pubtok}')[1]['items'] if i['name'] == 'Valley Spring Classic')
assert all('outcome' not in d and 'notes' not in d for d in item()['days']), item()
call(f'/t/{TID}/calendar/publish', OT, 'PUT', {'show_results': True})
days = item()['days']
assert days[1]['outcome'] == 'Raced the feature' and days[1]['result'] == 'Feature 6th', days
assert all('notes' not in d and 'withdraw_reason' not in d for d in days), days

if errors: print('\n'.join(errors)); raise SystemExit('page errors')
print('E2E43 OK')
