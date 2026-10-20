import json, sys, os, uuid, urllib.request, urllib.error
from datetime import datetime, timezone, date
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
now = datetime.now(timezone.utc).isoformat()
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]; OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Fresh Tracks Team', 'plan': 'pro'}); TID = t['id']
call(f'/t/{TID}', OT, 'PATCH', {'settings': {'classes': ['410 Sprintcars']}})
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
recs = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
tracks = [r for r in recs if r['type'] == 'track']
arch = next(r for r in tracks if r['data']['values'].get('name', '').startswith('Archerfield'))
other = next(r for r in tracks if r['data']['values'].get('name') and r['id'] != arch['id'] and r['data']['values'].get('status') == 'Active')
with sync_playwright() as pw:
    br = pw.chromium.launch(); page = br.new_page(viewport={'width': 1280, 'height': 860})
    page.on('pageerror', lambda e: errors.append(str(e)))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    # new team: empty, even with classes set
    page.goto(B + '/tracks')
    expect(page.locator('.tabs button:has-text("Our tracks")')).to_have_text('Our tracks (0)')
    expect(page.locator('.empty')).to_contain_text('create an event')
    page.screenshot(path=f'{OUT}/21-01-empty.png')
    # race there: event at a directory track adds it
    ev = {'id': str(uuid.uuid4()), 'type': 'event', 'data': {'values': {'name': 'Season opener', 'date': date.today().isoformat(), 'venue': arch['id'], 'track': arch['data']['values']['name']}}, 'client_updated_at': now}
    ev2 = {'id': str(uuid.uuid4()), 'type': 'event', 'data': {'values': {'name': 'Away night', 'date': date.today().isoformat(), 'track': other['data']['values']['name'].upper() + ' '}}, 'client_updated_at': now}
    call(f'/t/{TID}/sync', OT, 'POST', {'changes': [ev, ev2]})
    page.goto(B); page.wait_for_timeout(2000); page.goto(B + '/tracks')
    expect(page.locator('.tabs button:has-text("Our tracks")')).to_have_text('Our tracks (2)')
    expect(page.locator('.list-row:has-text("Archerfield")')).to_contain_text('raced here')
    expect(page.locator(f'.list-row:has-text("{other["data"]["values"]["name"]}")')).to_contain_text('raced here')   # typed name matches
    # link one by hand from the Directory, make another home
    third = next(r for r in tracks if r['id'] not in (arch['id'], other['id']) and r['data']['values'].get('status') == 'Active')
    page.goto(f"{B}/tracks/{third['id']}")
    expect(page.locator('button:has-text("Link to team")')).to_be_visible()
    page.click('button:has-text("Make home track")'); page.wait_for_timeout(800)
    page.goto(B + '/tracks')
    expect(page.locator('.tabs button:has-text("Our tracks")')).to_have_text('Our tracks (3)')
    expect(page.locator('.card.list .list-row').first).to_contain_text('home')
    # hide a raced track, bring it back
    page.goto(f"{B}/tracks/{arch['id']}")
    expect(page.locator('.event-meta')).to_contain_text('Raced here (1 event)')
    page.click('button:has-text("Hide from our tracks")'); page.wait_for_timeout(800)
    expect(page.locator('button:has-text("Show in our tracks")')).to_be_visible()
    page.goto(B + '/tracks'); expect(page.locator('.tabs button:has-text("Our tracks")')).to_have_text('Our tracks (2)')
    page.goto(f"{B}/tracks/{arch['id']}"); page.click('button:has-text("Show in our tracks")'); page.wait_for_timeout(800)
    page.goto(B + '/tracks'); expect(page.locator('.tabs button:has-text("Our tracks")')).to_have_text('Our tracks (3)')
    page.screenshot(path=f'{OUT}/21-02-ours.png')
    # directory: our classes filter
    page.click('.tabs button:has-text("Directory")')
    before = int(page.locator('p.muted.small:has-text("tracks")').first.inner_text().split()[0])
    page.check('label:has-text("Runs our classes") input')
    after = int(page.locator('p.muted.small:has-text("tracks")').first.inner_text().split()[0])
    assert 0 < after < before, (before, after)
    br.close()
assert not errors, errors
print('E2E21 OK')
