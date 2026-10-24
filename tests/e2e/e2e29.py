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
TA, ca = team('Rounds Team', 'rounds@cal.com', 'password5'); CA = ca['token']
o = login('owner@test.com', 'password1'); OT = o['token']
recs0 = call(f'/t/{TA}/sync?since=0', OT)[1]['records']
form = lambda target: next(r['id'] for r in recs0 if r['type'] == 'form' and r['data']['target'] == target)
FF, EF, SF, TF, CF = form('fixture'), form('event'), form('series'), form('track'), form('car')
G1 = rec('track', {'name': 'Rounds Park', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TF, scope='global')
GS = rec('series', {'name': 'Rounds Series', 'season': str(date.today().year), 'class': '410 Sprintcars'}, form_id=SF, scope='global')
R = [rec('fixture', {'name': f'Rounds Rd {i + 1}', 'date': d(n), 'venue': G1['id'], 'series': GS['id'], 'round': i + 1, 'status': st}, form_id=FF, scope='global')
     for i, (n, st) in enumerate([(-10, 'Scheduled'), (12, 'Scheduled'), (26, 'Cancelled'), (40, 'Scheduled'), (400, 'Scheduled')])]
push(OT, TA, [G1, GS, *R])
car = rec('car', {'number': '9', 'name': 'Rounds car', 'class': '410 Sprintcars', 'active': True}, form_id=CF)
E2 = rec('event', {'name': 'Rounds Rd 2', 'date': d(12), 'venue': G1['id'], 'series': GS['id'], 'round': 2, 'fixture': R[1]['id'], 'car': car['id'], 'intent': 'Planned'}, form_id=EF)
push(CA, TA, [car, E2])

def session(page, lg, tid):
    s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': tid}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
def evs():
    return [r for r in records(CA, TA).values() if r['type'] == 'event' and not r.get('deleted') and r['data']['values'].get('car') == car['id']]
def sync(p):
    p.wait_for_timeout(800); p.click('text=Synced') if False else None
    import time
    for _ in range(40):
        if p.locator('text=Synced').count(): break
        time.sleep(0.25)
    p.wait_for_timeout(1500)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1366, 'height': 900})
    p.on('pageerror', lambda e: errors.append(str(e)))
    session(p, ca, TA)
    p.goto(B + '/calendar?tab=entries')
    p.click('button:has-text("New series entry")')
    ed = p.locator('[data-testid="entry-editor"]')
    ed.locator('#f-participation').select_option('Partial series')
    expect(ed).to_contain_text('Pick the series to see its rounds')
    ed.locator('#f-series').select_option(label=re_label) if False else None
    opts = ed.locator('#f-series option').all_inner_texts()
    ed.locator('#f-series').select_option(label=next(x for x in opts if 'Rounds Series' in x))
    ed.locator('#f-car').select_option(label=next(x for x in ed.locator('#f-car option').all_inner_texts() if 'Rounds car' in x))
    rp = ed.locator('[data-testid="rounds-pick"]')
    rows = rp.locator('.round-row')
    expect(rows).to_have_count(4)   # cancelled round left out; next year's round 5 still listed (the series' own dates)
    expect(rp).to_contain_text('Round 5'); expect(rp).not_to_contain_text('Round 3')
    expect(rows.nth(0)).to_contain_text('Past'); expect(rows.nth(1)).to_contain_text('On our calendar')
    expect(rows.nth(1).locator('input')).to_be_checked(); expect(rows.nth(2).locator('input')).not_to_be_checked()
    expect(rp).to_contain_text('1 of 4')
    rows.nth(2).locator('input').check()
    expect(rp).to_contain_text('2 of 4')
    p.screenshot(path=f'{OUT}/rounds-new.png', full_page=True)
    ed.locator('button:has-text("Save entry")').click()
    sync(p)
    e = evs(); names = sorted(x['data']['values']['name'] for x in e)
    assert names == ['Rounds Rd 2', 'Rounds Rd 4'], names
    # choose rounds again: opens under the entry; untick round 2 → Not going; tick all to come adds round 5
    row = p.locator('.entry-row', has_text='Rounds Series')
    expect(row).to_contain_text('2 of 4 rounds')
    row.locator('button:has-text("Choose rounds")').click()
    ed = p.locator('.entry-row + [data-testid="entry-editor"]')
    expect(ed).to_be_visible()
    rows = ed.locator('.round-row')
    expect(rows.nth(1).locator('input')).to_be_checked(); expect(rows.nth(2).locator('input')).to_be_checked()
    ed.locator('button:has-text("Tick all to come")').click()
    expect(rows.nth(3).locator('input')).to_be_checked(); expect(rows.nth(0).locator('input')).not_to_be_checked()
    rows.nth(1).locator('input').uncheck()
    p.screenshot(path=f'{OUT}/rounds-edit.png', full_page=True)
    ed.locator('button:has-text("Save entry")').click()
    sync(p)
    e = {x['data']['values']['name']: x['data']['values'].get('intent') for x in evs()}
    assert e == {'Rounds Rd 2': 'Not going', 'Rounds Rd 4': 'Planned', 'Rounds Rd 5': 'Planned'}, e
    # tick it back
    p.reload(); expect(p.locator('text=Synced')).to_be_visible(timeout=30000)
    p.locator('.entry-row', has_text='Rounds Series').locator('button:has-text("Choose rounds")').click()
    ed = p.locator('.entry-row + [data-testid="entry-editor"]')
    expect(ed.locator('.round-row').nth(1)).to_contain_text('not going')
    ed.locator('.round-row').nth(1).locator('input').check()
    ed.locator('button:has-text("Save entry")').click(); sync(p)
    assert {x['data']['values']['name']: x['data']['values'].get('intent') for x in evs()}['Rounds Rd 2'] == 'Planned'
    br.close()
assert not errors, errors
print('E2E29 OK')
