# Team data export (CSV, XML, JSON, with files, to a destination) and Recently deleted: everyone recovers their own,
# team managers anything in the team, platform admins anything; retention (platform default, team override,
# a team's request) and removal for good once an item is past its time.
import io, json, os, re, subprocess, sys, time, urllib.request, urllib.error, uuid, zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
TEST_DATA = os.environ.get('TEST_DATA', '/var/tmp/raceops-test')
DB_URL = f"postgres://raceops:{os.environ.get('DB_PASSWORD', 'raceops')}@{os.environ.get('PGHOSTPORT', 'localhost:5432')}/{os.environ.get('TEST_DB', 'raceops_test')}"
errors = []

def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
def raw(path, token):
    return urllib.request.urlopen(urllib.request.Request(B + '/api' + path, headers={'authorization': f'Bearer {token}'})).read()
def wait_op(op):
    for _ in range(300):
        r = call(f"/backup/ops/{op['id']}")[1]['op']
        if r['status'] != 'running': return r
        time.sleep(0.3)
def sql(q):
    r = subprocess.run(['psql', DB_URL, '-Atc', q], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()
login = lambda e='owner@test.com', p='password1': call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
later = lambda s=5: datetime.fromtimestamp(time.time() + s, timezone.utc).isoformat()

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Export Racing', 'plan': 'pro', 'practice': True}); TID = t['id']
o = login(); OT = o['token']
roles = call(f'/t/{TID}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
def member(email, role):
    r = next(x for x in roles if x['name'] == role)
    st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': email, 'role_id': r['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
    assert call(f'/invites/{tok}/accept', method='POST', body={'name': email.split('@')[0], 'password': 'password37'})[0] == 200
    return login(email, 'password37')
mech = member('mech37@test.com', 'Mechanic'); MT = mech['token']
cc = member('cc37@test.com', 'Crew Chief'); CT = cc['token']
assert 'trash.manage' not in next(x for x in roles if x['name'] == 'Crew Chief')['permissions']
recs = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
team = lambda type: [r for r in recs if r['type'] == type and not r['global'] and not r['deleted']]

# ---- export by API: JSON with files, XML
# an attachment to export
car17 = next(r for r in team('car') if r['data']['values'].get('name') == 'Car 17')
bd = 'x37'
body = (f'--{bd}\r\nContent-Disposition: form-data; name="record_id"\r\n\r\n{car17["id"]}\r\n--{bd}\r\nContent-Disposition: form-data; name="file"; filename="car17.txt"\r\nContent-Type: text/plain\r\n\r\nCar 17 notes\r\n--{bd}--\r\n').encode()
urllib.request.urlopen(urllib.request.Request(B + f'/api/t/{TID}/attachments', method='POST', data=body, headers={'authorization': f'Bearer {OT}', 'content-type': f'multipart/form-data; boundary={bd}'}))
op = wait_op(call(f'/t/{TID}/backup/export', OT, 'POST', {'format': 'json', 'files': True})[1]['op'])
assert op['status'] == 'ok', op
z = zipfile.ZipFile(io.BytesIO(raw(f"/t/{TID}/backup/runs/{op['result']['run']}/download", OT)))
data = json.loads(z.read('data.json'))
assert data['format'] == 'raceops-export' and data['team']['name'] == 'Export Racing'
assert any(c['name'] == 'Car 17' for c in data['records']['car'])
assert len(data['records']['setup']) == len(team('setup'))
f = data['files'][0]; assert f['name'] == 'car17.txt' and z.read(f['path']) == b'Car 17 notes'
op = wait_op(call(f'/t/{TID}/backup/export', OT, 'POST', {'format': 'xml'})[1]['op'])
x = ET.fromstring(raw(f"/t/{TID}/backup/runs/{op['result']['run']}/download", OT))
assert x.tag == 'raceops-export' and x.get('team') == 'Export Racing'
setup = x.find("records[@type='setup']/record")
assert setup.find("field[@name='car']").text == '#17 Car 17' and setup.find("field[@name='car']").get('ref')
assert call(f'/t/{TID}/backup/export', CT, 'POST', {'format': 'csv'})[0] == 403, 'export needs the backup right'
st, r = call(f'/t/{TID}/backup/export', OT, 'POST', {'format': 'pdf'}); assert wait_op(r['op'])['status'] == 'failed'

with sync_playwright() as pw:
    br = pw.chromium.launch()
    def new_page(lg, tid=TID):
        p = br.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True).new_page()
        p.on('pageerror', lambda e: errors.append(str(e)))
        p.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
        s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': tid}
        p.goto(B); p.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        p.goto(B); expect(p.locator('text=Synced')).to_be_visible(timeout=30000)
        return p

    # ---- export from the page: CSV spreadsheets, downloaded
    po = new_page(login())
    po.click('.sidebar .nav-link[href="/team/backups"]')
    expect(po.locator('h1')).to_have_text('Backups & export')
    po.get_by_role('radio', name='CSV').check()
    po.locator('[data-testid="export-now"] button:has-text("Export")').click()
    st_ = po.locator('[data-testid="op-status"]').last
    expect(st_).to_contain_text('Exported', timeout=30000)
    with po.expect_download() as dl:
        st_.locator('a:has-text("Download")').click()
    path = dl.value.path()
    z = zipfile.ZipFile(path)
    assert {'car.csv', 'setup.csv', 'job.csv', 'README.txt'} <= set(z.namelist()), z.namelist()
    head, first = z.read('setup.csv').decode('utf-8-sig').splitlines()[:2]
    assert head.startswith('id,') and 'Car' in head.split(','), head
    assert '#17 Car 17' in z.read('setup.csv').decode('utf-8-sig')
    expect(po.locator('[data-testid="backup-run"]').first).to_contain_text('Export (CSV)')
    expect(po.locator('[data-testid="backup-run"]').first.locator('button:has-text("Restore…")')).to_have_count(0)
    po.screenshot(path=f'{OUT}/37-01-export.png', full_page=True)

    # ---- a crew chief deletes a part someone else made, and one they made; the owner deletes a sheet
    bar = next(r for r in team('asset') if r['data']['values'].get('name') == 'Spare bar 950')
    SHOCK = str(uuid.uuid4())
    st, r = call(f'/t/{TID}/sync', CT, 'POST', {'changes': [
        {'id': bar['id'], 'type': 'asset', 'data': bar['data'], 'deleted': True, 'client_updated_at': later()},
        {'id': SHOCK, 'type': 'asset', 'data': {'values': {'name': 'Crew spare shock', 'category': 'Shock'}}, 'client_updated_at': later()}]})
    assert all(x['status'] == 'applied' for x in r['results']), r
    st, r = call(f'/t/{TID}/sync', CT, 'POST', {'changes': [{'id': SHOCK, 'type': 'asset', 'data': {'values': {'name': 'Crew spare shock', 'category': 'Shock'}}, 'deleted': True, 'client_updated_at': later(8)}]})
    assert r['results'][0]['status'] == 'applied', r
    sheet = team('setup')[0]
    assert call(f'/t/{TID}/sync', OT, 'POST', {'changes': [{'id': sheet['id'], 'type': 'setup', 'data': sheet['data'], 'deleted': True, 'client_updated_at': later()}]})[1]['results'][0]['status'] == 'applied'
    assert sql(f"SELECT deleted_by IS NOT NULL AND deleted_at IS NOT NULL FROM records WHERE id='{bar['id']}'") == 't'
    # a mechanic's role can't delete parts, so there's nothing of theirs to recover
    assert call(f'/t/{TID}/deleted', MT)[1]['items'] == []

    # ---- the crew chief sees only what they made or deleted, and recovers the bar
    pm = new_page(cc)
    pm.click('.sidebar .nav-link[href="/deleted"]')
    expect(pm.locator('h1')).to_have_text('Recently deleted')
    rows = pm.locator('[data-testid="deleted-item"]')
    expect(rows).to_have_count(2)
    expect(rows.filter(has_text='Crew spare shock')).to_have_count(1)
    expect(pm.locator('[data-testid="retention"]')).to_contain_text('for 90 days')
    expect(pm.locator('button:has-text("Ask for a different time")')).to_have_count(0)
    rows.filter(has_text='Spare bar 950').locator('button:has-text("Recover")').click()
    expect(pm.locator('.notice')).to_contain_text('1 recovered')
    expect(rows).to_have_count(1)
    assert not next(x for x in call(f'/t/{TID}/sync?since=0', OT)[1]['records'] if x['id'] == bar['id'])['deleted']
    pm.goto(B + '/assets'); expect(pm.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(pm.locator('.list-row:has-text("Spare bar 950")').first).to_be_visible(timeout=20000)
    # someone else's deletion can't be recovered by the crew chief
    assert call(f'/t/{TID}/deleted/recover', CT, 'POST', {'ids': [sheet['id']]})[1] == {'recovered': 0, 'refused': 1}
    hist = call(f"/t/{TID}/records/{bar['id']}/history", OT)[1]
    assert hist[0]['op'] == 'recover', hist[0]

    # ---- the owner (team manager) sees everything deleted in the team, recovers the sheet
    po.goto(B + '/deleted')
    expect(po.locator('[data-testid="deleted-item"]')).to_have_count(2)
    po.locator('label:has-text("Just mine") input').check()
    expect(po.locator('[data-testid="deleted-item"]')).to_have_count(1)
    po.locator('label:has-text("Just mine") input').uncheck()
    expect(po.locator('[data-testid="deleted-item"]')).to_have_count(2)
    po.locator('[data-testid="deleted-item"]').filter(has_not_text='Crew spare shock').locator('input[type=checkbox]').check()
    po.locator('button:has-text("Recover 1")').click()
    expect(po.locator('.notice')).to_contain_text('1 recovered')
    assert not next(x for x in call(f'/t/{TID}/sync?since=0', OT)[1]['records'] if x['id'] == sheet['id'])['deleted']

    # ---- the team manager asks for a longer time; the platform admin approves it
    po.click('button:has-text("Ask for a different time")')
    ask = po.locator('[data-testid="ask-retention"]')
    ask.get_by_label('Keep deleted items for').select_option('365')
    ask.get_by_label('Why').fill('Keep a season')
    ask.locator('button:has-text("Send to the platform admin")').click()
    expect(po.locator('[data-testid="retention-request"]')).to_contain_text('for 365 days')
    po.screenshot(path=f'{OUT}/37-02-deleted.png', full_page=True)
    po.goto(B + '/admin/deleted')
    req = po.locator('[data-testid="retention-requests"]')
    expect(req).to_contain_text('Export Racing asks to keep deleted items for 365 days')
    expect(req).to_contain_text('Keep a season')
    req.locator('div:has-text("Export Racing") button:has-text("Approve")').click()
    expect(po.locator('.notice:has-text("Export Racing: done")')).to_be_visible()
    assert sql(f"SELECT deleted_retention_days FROM tenants WHERE id='{TID}'") == '365'
    assert call(f'/t/{TID}/deleted', CT)[1]['keep_days'] == 365
    # the platform admin recovers the mechanic's shock from the admin page
    po.get_by_label('Team', exact=True).select_option(TID)
    item = po.locator('[data-testid="deleted-item"]:has-text("Crew spare shock")')
    expect(item).to_have_count(1)
    expect(item).to_contain_text('Export Racing')
    item.locator('button:has-text("Recover")').click()
    expect(po.locator('.notice:has-text("1 recovered")')).to_be_visible()
    po.screenshot(path=f'{OUT}/37-03-admin.png', full_page=True)
    # the platform default
    po.get_by_label('Platform default').select_option('30')
    po.locator('[data-testid="retention-default"] button:has-text("Save")').click()
    expect(po.locator('.notice:has-text("Saved")')).to_be_visible()
    assert call('/admin/deleted', OT)[1]['platform_days'] == 30
    br.close()

# ---- removed for good after the team's time: delete Car 71, make it 400 days old, run the hourly clean-up
car71 = next(r for r in team('car') if r['data']['values'].get('name') == 'Car 71')
assert call(f'/t/{TID}/sync', OT, 'POST', {'changes': [{'id': car71['id'], 'type': 'car', 'data': car71['data'], 'deleted': True, 'client_updated_at': later(10)}]})[1]['results'][0]['status'] == 'applied'
sql(f"UPDATE records SET deleted_at = now() - interval '300 days' WHERE id='{car71['id']}'")
env = {**os.environ, 'DATABASE_URL': DB_URL, 'UPLOAD_DIR': f'{TEST_DATA}/uploads'}
purge = lambda: subprocess.run(['node', '--input-type=module', '-e', "const { loadSettings } = await import('./src/settings.js'); await loadSettings(); const m = await import('./src/recycle.js'); console.log(await m.purge()); process.exit(0);"],
                               cwd=os.path.join(ROOT, 'server'), env=env, capture_output=True, text=True, timeout=60)
r = purge(); assert r.returncode == 0, r.stderr
assert sql(f"SELECT count(*) FROM records WHERE id='{car71['id']}'") == '1', 'kept: the team keeps deleted items 365 days'
sql(f"UPDATE records SET deleted_at = now() - interval '400 days' WHERE id='{car71['id']}'")
r = purge(); assert r.returncode == 0, r.stderr
assert sql(f"SELECT count(*) FROM records WHERE id='{car71['id']}'") == '0', 'removed for good'
assert sql(f"SELECT count(*) FROM record_history WHERE record_id='{car71['id']}'") == '0'
# a team set to keep them forever
assert call(f'/admin/deleted/retention/{TID}', OT, 'PUT', {'days': 'forever'})[0] == 200
assert call(f'/t/{TID}/deleted', OT)[1]['keep_days'] is None

assert not errors, errors
print('E2E37 OK')
