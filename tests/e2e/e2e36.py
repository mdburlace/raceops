# Backups: destinations (server folder, S3, Google Drive / Dropbox through the mock sign-in), full backups now and
# on a schedule (with pruning), team backups (platform storage and the team's own), team restore (from a listed
# backup and from a file) with devices downloading the team again, a deleted team brought back from a full
# backup, and a full restore of everything. The test server runs with BACKUP_KEY and BACKUP_CLOUD_MOCK=1.
import json, os, re, subprocess, sys, time, urllib.request, urllib.error, uuid
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
    r = urllib.request.urlopen(urllib.request.Request(B + '/api' + path, headers={'authorization': f'Bearer {token}'}))
    return r.status, r.read()
def wait_op(op):
    for _ in range(600):
        st, r = call(f"/backup/ops/{op['id']}")
        if r['op']['status'] != 'running': return r['op']
        time.sleep(0.3)
    raise AssertionError('job never finished')
def tick():
    env = {**os.environ, 'DATABASE_URL': DB_URL, 'UPLOAD_DIR': f'{TEST_DATA}/uploads', 'BACKUP_DIR': f'{TEST_DATA}/backups', 'BACKUP_KEY': 'test-backup-passphrase', 'BACKUP_CLOUD_MOCK': '1'}
    r = subprocess.run(['node', '--input-type=module', '-e', "const m = await import('./src/backup.js'); const { loadSettings } = await import('./src/settings.js'); await loadSettings(); m.configure({ UPLOAD_DIR: process.env.UPLOAD_DIR }); await m.tick(); process.exit(0);"],
                       cwd=os.path.join(ROOT, 'server'), env=env, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
def sql(q):
    r = subprocess.run(['psql', DB_URL, '-Atc', q], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()
login = lambda e='owner@test.com', p='password1': call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
now = lambda s=5: datetime.fromtimestamp(time.time() + s, timezone.utc).isoformat()

o = login(); OT = o['token']
# a practice team to back up, and a team that will be deleted and brought back
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Backup Racing', 'plan': 'pro', 'practice': True}); TID = t['id']
st, g = call('/admin/tenants', OT, 'POST', {'name': 'Gone Racing', 'plan': 'pro', 'practice': True}); GID = g['id']
o = login(); OT = o['token']
# a crew chief can't manage backups
roles = call(f'/t/{TID}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
cc = next(x for x in roles if x['name'] == 'Crew Chief')
assert 'backup.manage' not in cc['permissions']
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': 'cc36@test.com', 'role_id': cc['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
assert call(f'/invites/{tok}/accept', method='POST', body={'name': 'Crew 36', 'password': 'password36'})[0] == 200
CT = login('cc36@test.com', 'password36')['token']
assert call(f'/t/{TID}/backup', CT)[0] == 403
assert call('/admin/backups', CT)[0] == 403
assert call('/setup/restore', method='POST', body={})[0] in (400, 409)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    def new_page(tid):
        lg = login()
        p = br.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True).new_page()
        p.on('pageerror', lambda e: errors.append(str(e)))
        p.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
        s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': tid}
        p.goto(B); p.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        p.goto(B); expect(p.locator('text=Synced')).to_be_visible(timeout=30000)
        return p

    # ---- 1. platform destinations
    pa = new_page(TID)
    pa.click('.sidebar .nav-link[href="/admin/backups"]')
    expect(pa.locator('h1')).to_have_text('Backups')
    expect(pa.locator('[data-testid="no-encryption"]')).to_have_count(0)
    def add_dest(name, kind, fields):
        pa.click('button:has-text("+ Add destination")')
        form = pa.locator('[data-testid="dest-form"]')
        form.get_by_label('Destination name').fill(name)
        form.get_by_label('Kind of destination').select_option(kind)
        for label, value in fields.items(): form.get_by_label(label, exact=True).fill(value)
        form.locator('button.primary').click()
    add_dest('Server folder', 'local', {'Folder': 'platform'})
    expect(pa.locator('.notice:has-text("It’s working")')).to_be_visible()
    add_dest('Wrong keys', 's3', {'Bucket': 'raceops', 'Access key ID': 'AKIA', 'Secret access key': 'wrong'})
    expect(pa.locator('.notice.error')).to_contain_text('isn’t working yet')
    expect(pa.locator('[data-testid="destination"]:has-text("Wrong keys")')).to_contain_text('Not working')
    add_dest('Team Drive', 'gdrive', {'Folder': 'RaceOps'})   # goes to the (mock) Google sign-in and back
    expect(pa.locator('[data-testid="connect-notice"]')).to_contain_text('Connected')
    expect(pa.locator('[data-testid="destination"]:has-text("Team Drive")')).to_contain_text('Working')
    pa.once('dialog', lambda d: d.accept())
    pa.locator('[data-testid="destination"]:has-text("Wrong keys") button:has-text("Remove")').click()
    expect(pa.locator('[data-testid="destination"]:has-text("Wrong keys")')).to_have_count(0)
    d = call('/admin/backups', OT)[1]
    FOLDER = next(x['id'] for x in d['targets'] if x['name'] == 'Server folder')
    DRIVE = next(x['id'] for x in d['targets'] if x['name'] == 'Team Drive')
    assert 'secret_access_key' not in json.dumps(d) and 'refresh_token' not in json.dumps(d), 'keys never leave the server'

    # ---- 2. a full backup now, to the server folder; it downloads as an encrypted RaceOps file
    pa.locator('[data-testid="full-now"] select').select_option(FOLDER)
    pa.locator('[data-testid="full-now"] button').click()
    expect(pa.locator('[data-testid="op-status"]')).to_contain_text('Backed up', timeout=60000)
    run = pa.locator('[data-testid="backup-run"]').first
    expect(run).to_contain_text('Everything'); expect(run).to_contain_text('Server folder'); expect(run).to_contain_text('Encrypted')
    pa.screenshot(path=f'{OUT}/36-01-admin.png', full_page=True)
    FULL1 = call('/admin/backups', OT)[1]['runs'][0]
    assert FULL1['scope'] == 'full' and FULL1['status'] == 'ok' and FULL1['encrypted'], FULL1
    st, body = raw(f"/admin/backups/runs/{FULL1['id']}/download", OT)
    assert st == 200 and body[:8] == b'RACEOPS1' and body[8] == 1, body[:9]
    assert os.path.exists(f"{TEST_DATA}/backups/platform/{FULL1['file_name']}")

    # ---- 3. the platform's default for team backups, which teams see as platform storage
    sch = pa.locator('[data-testid="teams-schedule"]')
    sch.get_by_label('How often').select_option('weekly')
    sch.get_by_label('Day of the week').select_option('1')
    sch.get_by_label('Destination').select_option(FOLDER)
    sch.locator('button:has-text("Save schedule")').click()
    expect(sch.locator('.notice')).to_contain_text('Schedule saved')

    # ---- 4. the team's own page: a crew chief doesn't see it; the owner backs up to the team's Dropbox
    pc = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    lg = login('cc36@test.com', 'password36')
    s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': TID}
    pc.goto(B); pc.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})"); pc.goto(B)
    expect(pc.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(pc.locator('.sidebar .nav-link[href="/team/backups"]')).to_have_count(0)
    pc.context.close()

    pt = new_page(TID)
    pt.click('.sidebar .nav-link[href="/team/backups"]')
    expect(pt.locator('[data-testid="platform-schedule"]')).to_contain_text('Every Monday')
    pt.click('button:has-text("+ Add destination")')
    form = pt.locator('[data-testid="dest-form"]')
    form.get_by_label('Destination name').fill('Our Dropbox')
    form.get_by_label('Kind of destination').select_option('dropbox')
    form.locator('button:has-text("Save and connect")').click()
    expect(pt.locator('[data-testid="connect-notice"]')).to_contain_text('Connected')
    TB = call(f'/t/{TID}/backup', OT)[1]
    DROP = next(x['id'] for x in TB['targets'] if x['name'] == 'Our Dropbox')
    assert not any(x['name'] == 'Server folder' for x in TB['targets']), 'platform destinations aren’t listed as the team’s'
    assert call(f'/t/{TID}/backup/targets/{FOLDER}/files', OT)[0] == 404, 'a team can’t look into platform storage'
    pt.locator('[data-testid="team-backup-now"] select').select_option(DROP)
    pt.locator('[data-testid="team-backup-now"] button').click()
    expect(pt.locator('[data-testid="op-status"]')).to_contain_text('Backed up', timeout=60000)
    expect(pt.locator('[data-testid="backup-run"]').first).to_contain_text('Our Dropbox')
    pt.locator('[data-testid="team-backup-now"] select').select_option('platform')
    pt.locator('[data-testid="team-backup-now"] button').click()
    expect(pt.locator('[data-testid="op-status"]')).to_contain_text('Backed up', timeout=60000)
    expect(pt.locator('[data-testid="backup-run"]').first).to_contain_text('Server folder')
    # the team's own schedule, to its Dropbox
    tsch = pt.locator('[data-testid="team-schedule"]')
    tsch.get_by_label('How often').select_option('daily')
    tsch.get_by_label('Time').select_option('23')
    tsch.get_by_label('Destination').select_option(DROP)
    tsch.locator('button:has-text("Save schedule")').click()
    expect(tsch.locator('.notice')).to_contain_text('Schedule saved')
    assert call(f'/t/{TID}/backup', OT)[1]['plan']['frequency'] == 'daily'
    pt.screenshot(path=f'{OUT}/36-02-team.png', full_page=True)

    # ---- 5. something goes wrong: a car is deleted and a note changed. Restore the Dropbox backup.
    runs = call(f'/t/{TID}/backup', OT)[1]['runs']
    DROPRUN = next(r for r in runs if r['target_name'] == 'Our Dropbox')
    recs = call(f'/t/{TID}/sync?since=0', OT)[1]
    EPOCH0 = recs['epoch']
    car = next(x for x in recs['records'] if x['type'] == 'car' and not x['deleted'] and x['data']['values'].get('name') == 'Car 71')
    r = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [{'id': car['id'], 'type': 'car', 'data': car['data'], 'deleted': True, 'client_updated_at': now()}]})[1]
    assert r['results'][0]['status'] == 'applied'
    pt.goto(B + '/cars'); expect(pt.locator('text=Synced')).to_be_visible(timeout=30000)
    pt.reload(); expect(pt.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(pt.locator('.list-row:has-text("Car 71")')).to_have_count(0, timeout=15000)
    pt.goto(B + '/team/backups')
    pt.locator(f'[data-testid="backup-run"]:has-text("Our Dropbox") button:has-text("Restore…")').click()
    panel = pt.locator('[data-testid="restore-panel"]')
    expect(panel.locator('button:has-text("Restore the team")')).to_be_disabled()
    panel.get_by_label('I understand the team’s data will be replaced').check()
    panel.locator('button:has-text("Restore the team")').click()
    expect(panel.locator('[data-testid="op-status"]')).to_contain_text('Restored', timeout=60000)
    recs = call(f'/t/{TID}/sync?since=0', OT)[1]
    assert recs['epoch'] and recs['epoch'] != EPOCH0
    assert not next(x for x in recs['records'] if x['id'] == car['id'])['deleted'], 'Car 71 is back'
    runs = call(f'/t/{TID}/backup', OT)[1]['runs']
    assert any(r['trigger'] == 'pre-restore' for r in runs), 'a safety backup was taken first'
    # this device notices the restore on its next sync and downloads the team again
    pt.goto(B + '/cars'); expect(pt.locator('text=Synced')).to_be_visible(timeout=30000)
    pt.reload(); expect(pt.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(pt.locator('.list-row:has-text("Car 71")')).to_be_visible(timeout=20000)
    # the crew still have access
    assert call(f'/t/{TID}/sync?since=0', CT)[0] == 200

    # ---- 6. restore from a file on the computer: the team backup is accepted, a full backup isn't
    st, team_file = raw(f"/t/{TID}/backup/runs/{DROPRUN['id']}/download", OT)
    tf = os.path.join(OUT, 'team.raceops'); open(tf, 'wb').write(team_file)
    ff = os.path.join(OUT, 'full.raceops'); open(ff, 'wb').write(raw(f"/admin/backups/runs/{FULL1['id']}/download", OT)[1])
    pt.goto(B + '/team/backups')
    pt.get_by_label('Backup file').set_input_files(ff)
    expect(pt.locator('.error-text')).to_contain_text('full backup', timeout=20000)
    pt.get_by_label('Backup file').set_input_files(tf)
    panel = pt.locator('[data-testid="restore-panel"]')
    expect(panel).to_contain_text('the backup made', timeout=20000)
    panel.get_by_label('I understand the team’s data will be replaced').check()
    panel.locator('button:has-text("Restore the team")').click()
    expect(panel.locator('[data-testid="op-status"]')).to_contain_text('Restored', timeout=60000)

    # ---- 7. a team deleted after the full backup comes back from it
    gone_recs = len([x for x in call(f'/t/{GID}/sync?since=0', OT)[1]['records'] if not x['global'] and not x['deleted']])
    assert call(f'/admin/tenants/{GID}', OT, 'DELETE', {'confirm': 'Gone Racing'})[0] == 200
    pa.goto(B + '/admin/backups')
    pa.locator(f'[data-testid="backup-run"]:has-text("Everything") button:has-text("Restore…")').last.click()
    panel = pa.locator('[data-testid="restore-panel"]')
    expect(panel).to_contain_text('A full backup made', timeout=20000)
    panel.get_by_role('radio', name=re.compile('^One team')).check()
    panel.get_by_label('Team to restore').select_option(GID)
    expect(panel).to_contain_text('isn’t on this server now')
    panel.locator('button:has-text("Restore the team")').click()
    expect(panel.locator('[data-testid="op-status"]')).to_contain_text('Gone Racing is back', timeout=60000)
    o = login(); OT = o['token']
    assert any(m['tenant_id'] == GID for m in o['memberships']), 'the admin is an owner of the team brought back'
    assert len([x for x in call(f'/t/{GID}/sync?since=0', OT)[1]['records'] if not x['global'] and not x['deleted']]) == gone_recs
    pa.screenshot(path=f'{OUT}/36-03-team-from-full.png', full_page=True)

    # ---- 8. scheduled full backups, keeping the last 1
    fsch = pa.locator('[data-testid="full-schedule"]')
    fsch.get_by_label('How often').select_option('daily')
    fsch.get_by_label('Destination').select_option(DRIVE)
    fsch.get_by_label('Keep').fill('1')
    fsch.locator('button:has-text("Save schedule")').click()
    expect(fsch.locator('.notice')).to_contain_text('Schedule saved')
    for _ in range(2):
        sql("UPDATE backup_plans SET next_run_at = now() - interval '1 minute' WHERE scope='full'")
        tick()
    sched = [r for r in call('/admin/backups', OT)[1]['runs'] if r['trigger'] == 'scheduled' and r['scope'] == 'full']
    assert len(sched) == 1 and sched[0]['target_name'] == 'Team Drive' and sched[0]['status'] == 'ok', sched
    assert len([f for f in os.listdir(f'{TEST_DATA}/backups/.mock-cloud/gdrive/{DRIVE}') if f.endswith('.raceops')]) == 1
    assert sql("SELECT next_run_at > now() FROM backup_plans WHERE scope='full'") == 't'
    # the team's own daily schedule runs to its Dropbox; the platform default skips that team
    sql(f"UPDATE backup_plans SET next_run_at = now() - interval '1 minute' WHERE scope IN ('team','teams')")
    tick()
    tr = call(f'/t/{TID}/backup', OT)[1]['runs']
    assert any(r['trigger'] == 'scheduled' and r['target_name'] == 'Our Dropbox' for r in tr), tr
    assert not any(r['trigger'] == 'scheduled' and r['target_name'] == 'Server folder' for r in tr), tr
    gr = [r for r in call('/admin/backups', OT)[1]['runs'] if r['tenant_id'] == GID and r['trigger'] == 'scheduled']
    assert gr and gr[0]['target_name'] == 'Server folder', gr

    # ---- 9. restore everything from the first full backup: later changes are gone, a safety backup is kept
    st, extra = call('/admin/tenants', OT, 'POST', {'name': 'Made after the backup', 'plan': 'pro'})
    pa.goto(B + '/admin/backups')
    pa.locator(f'[data-testid="backup-run"]:has-text("Everything"):has-text("Made by hand") button:has-text("Restore…")').last.click()
    panel = pa.locator('[data-testid="restore-panel"]')
    expect(panel).to_contain_text('A full backup made', timeout=20000)
    panel.get_by_role('radio', name=re.compile('^Everything')).check()
    expect(panel.locator('button:has-text("Restore everything")')).to_be_disabled()
    panel.get_by_label('Confirm full restore').fill('RESTORE')
    panel.locator('button:has-text("Restore everything")').click()
    expect(panel.locator('[data-testid="op-status"]')).to_contain_text('Restored the backup', timeout=120000)
    pa.screenshot(path=f'{OUT}/36-04-full-restore.png', full_page=True)
    o = login(); OT = o['token']
    names = [x['name'] for x in call('/admin/tenants', OT)[1]]
    assert 'Made after the backup' not in names and 'Backup Racing' in names and 'Gone Racing' in names, names
    runs = call('/admin/backups', OT)[1]['runs']
    assert any(r['trigger'] == 'pre-restore' and r['scope'] == 'full' for r in runs), 'the safety backup is listed'
    assert next(r for r in runs if r['id'] == FULL1['id'])['status'] == 'ok'
    assert call('/admin/audit?limit=20', OT)[0] == 200
    br.close()

assert not errors, errors
print('E2E36 OK')
