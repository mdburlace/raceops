# Files on feedback and ideas: any common file type (not just pictures), up to 5 per item and 20 MB each, added
# when sending or later, shown as pictures or file chips, opened or downloaded safely, removed by the uploader or
# an admin, and listed in the brief for Claude.
import json, sys, os, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
errors = []

def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
def head(path, token):
    req = urllib.request.Request(B + '/api' + path, headers={'authorization': f'Bearer {token}'})
    try:
        r = urllib.request.urlopen(req); return r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers)
def upload(path, token, name, data):
    bd = 'xRaceOpsBoundary'
    body = (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + data + f'\r\n--{bd}--\r\n'.encode()
    req = urllib.request.Request(B + '/api' + path, method='POST', data=body, headers={'authorization': f'Bearer {token}', 'content-type': f'multipart/form-data; boundary={bd}'})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
login = lambda e, p: call('/auth/login', method='POST', body={'email': e, 'password': p})[1]

o = login('owner@test.com', 'password1'); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Attach Racing', 'plan': 'pro'}); TID = t['id']
roles = call(f'/t/{TID}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
rid = next(x for x in roles if x['name'] == 'Crew Chief')['id']
st, inv = call(f'/t/{TID}/invites', OT, 'POST', {'email': 'attach@test.com', 'role_id': rid}); tok = inv.get('token') or inv.get('invite', {}).get('token')
assert call(f'/invites/{tok}/accept', method='POST', body={'name': 'Attach Crew', 'password': 'password35'})[0] == 200
u = login('attach@test.com', 'password35'); UT = u['token']
big = os.path.join(OUT, 'too-big.mp4'); open(big, 'wb').truncate(21 * 1024 * 1024)
log = os.path.join(OUT, 'sync.log'); open(log, 'w').write('12:01 push failed: 502\n12:02 retry ok\n')
bad = os.path.join(OUT, 'setup.exe'); open(bad, 'wb').write(b'MZ')

with sync_playwright() as pw:
    br = pw.chromium.launch()
    def new_page(lg):
        p = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
        p.on('pageerror', lambda e: errors.append(str(e)))
        p.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
        s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': TID}
        p.goto(B); p.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        p.goto(B); expect(p.locator('text=Synced')).to_be_visible(timeout=30000)
        return p

    # ---- 1. a user sends a request with a picture, a PDF and a spreadsheet; the wrong type and too big are refused
    pu = new_page(u)
    pu.goto(B + '/feedback')
    send = pu.locator('[data-testid="fb-send"]')
    send.locator('button[role="radio"]:has-text("A new feature")').click()
    send.get_by_label('Title').fill('Import dyno sheets from the shock dyno software')
    send.get_by_label('Details').fill('Our dyno exports a spreadsheet. Attached is one, plus the printout.')
    send.get_by_label('Attach files').set_input_files([bad, big])
    expect(send.locator('.notice.error')).to_contain_text('setup.exe: that type of file can’t be attached')
    expect(send.locator('.notice.error')).to_contain_text('Files can be up to 20 MB')
    expect(send.locator('[data-testid="fb-picked"]')).to_have_count(0)
    send.get_by_label('Attach files').set_input_files([f'{FIX}/ai-sheet.png', f'{FIX}/ai-printout.pdf', f'{FIX}/dyno.xlsx'])
    expect(send.locator('[data-testid="fb-picked"]')).to_contain_text('dyno.xlsx')
    expect(send.locator('.notice.error')).to_have_count(0)
    send.locator('button:has-text("Send request")').click()
    expect(pu.locator('.notice.info')).to_contain_text('Import dyno sheets', timeout=15000)
    pu.click('.tabs button:has-text("My submissions")')
    item = pu.locator('[data-testid="fb-mine-item"]:has-text("Import dyno sheets")')
    expect(item).to_be_visible(timeout=15000)
    expect(item.locator('.fb-thumbs img')).to_have_count(1)
    expect(item.locator('[data-testid="fb-file"]')).to_have_count(2)
    expect(item.locator('[data-testid="fb-file"]:has-text("ai-printout.pdf")')).to_contain_text('PDF')
    pu.screenshot(path=f'{OUT}/35-01-sent.png', full_page=True)

    mine = next(i for i in call('/feedback/mine', UT)[1]['items'] if i['title'].startswith('Import dyno'))
    FID = mine['id']
    files = {f['filename']: f for f in mine['files']}
    assert set(files) == {'ai-sheet.png', 'ai-printout.pdf', 'dyno.xlsx'}, files
    assert files['dyno.xlsx']['mime'].startswith('application/vnd.openxmlformats'), files['dyno.xlsx']

    # ---- 2. how files come back: type from the name; pictures and PDFs open, the rest download
    st, hd = head(f"/feedback/files/{files['ai-printout.pdf']['id']}", UT)
    assert st == 200 and hd['Content-Type'] == 'application/pdf' and hd['Content-Disposition'].startswith('inline'), hd
    st, hd = head(f"/feedback/files/{files['dyno.xlsx']['id']}", UT)
    assert st == 200 and hd['Content-Disposition'].startswith('attachment') and hd['X-Content-Type-Options'] == 'nosniff', hd
    st, hd = head(f"/feedback/files/{files['ai-printout.pdf']['id']}?download", UT)
    assert hd['Content-Disposition'].startswith('attachment'), hd
    # a renamed page can't be served as a web page
    st, r = upload(f'/feedback/{FID}/files', UT, 'notes.html', b'<script>alert(1)</script>')
    assert st == 400 and 'can’t be attached' in r['error'], (st, r)

    # ---- 3. adding later, from My submissions; the limit is 5
    item.locator('label:has-text("Add file") input').set_input_files(log)
    expect(item.locator('[data-testid="fb-file"]:has-text("sync.log")')).to_be_visible(timeout=15000)
    assert upload(f'/feedback/{FID}/files', UT, 'one-more.txt', b'five')[0] == 200
    st, r = upload(f'/feedback/{FID}/files', UT, 'six.txt', b'six')
    assert st == 400 and 'Up to 5 files' in r['error'], (st, r)
    pu.goto(B + '/feedback?tab=mine'); item = pu.locator('[data-testid="fb-mine-item"]:has-text("Import dyno")')
    expect(item.locator('label:has-text("Add file")')).to_have_count(0)

    # ---- 4. the sender removes one of theirs
    pu.once('dialog', lambda d: d.accept())
    item.locator('button[aria-label="Remove one-more.txt"]').click()
    expect(item.locator('[data-testid="fb-file"]:has-text("one-more.txt")')).to_have_count(0, timeout=15000)
    assert len(next(i for i in call('/feedback/mine', UT)[1]['items'] if i['id'] == FID)['files']) == 4

    # ---- 5. a platform admin adds a file, the sender can't remove it, the admin can
    pa = new_page(o)
    pa.goto(B + '/admin/feedback')
    pa.click('[data-testid="fb-row"]:has-text("Import dyno sheets")')
    det = pa.locator('[data-testid="fb-detail"]')
    expect(det.locator('[data-testid="fb-file"]')).to_have_count(3)
    det.locator('label:has-text("Add file") input').set_input_files(f'{FIX}/sheet.csv')
    expect(det.locator('[data-testid="fb-file"]:has-text("sheet.csv")')).to_be_visible(timeout=15000)
    pa.screenshot(path=f'{OUT}/35-02-admin.png', full_page=True)
    csv = next(f for f in call(f'/admin/feedback/{FID}', OT)[1]['item']['files'] if f['filename'] == 'sheet.csv')
    assert call(f'/feedback/{FID}/files/{csv["id"]}', UT, 'DELETE')[0] == 404
    pu.goto(B + '/feedback?tab=mine'); item = pu.locator('[data-testid="fb-mine-item"]:has-text("Import dyno")')
    expect(item.locator('[data-testid="fb-file"]:has-text("sheet.csv")')).to_be_visible()
    expect(item.locator('button[aria-label="Remove sheet.csv"]')).to_have_count(0)
    pa.once('dialog', lambda d: d.accept())
    det.locator('button[aria-label="Remove sheet.csv"]').click()
    expect(det.locator('[data-testid="fb-file"]:has-text("sheet.csv")')).to_have_count(0, timeout=15000)

    # ---- 6. an admin's own idea takes files too, and the brief lists them
    pa.click('button:has-text("New idea")')
    ne = pa.locator('[data-testid="fb-editor"]')
    ne.get_by_label('Title').fill('Attachments on ideas')
    ne.get_by_label('Description').fill('Ideas can carry files too.')
    ne.locator('button:has-text("Save idea")').click()
    det = pa.locator('[data-testid="fb-detail"]')
    expect(det).to_be_visible(timeout=15000)
    expect(det).to_contain_text('Ideas can carry files too.')
    pa.wait_for_load_state('networkidle')   # the new idea's panel reloads once after saving, which drops a file chosen too early
    det.locator('label:has-text("Add file") input').set_input_files(f'{FIX}/ai-printout.pdf')
    expect(det.locator('[data-testid="fb-file"]:has-text("ai-printout.pdf")')).to_be_visible(timeout=15000)
    idea = next(i for i in call('/admin/feedback?view=ideas', OT)[1]['items'] if i['title'] == 'Attachments on ideas')
    assert len(call(f"/admin/feedback/{idea['id']}", OT)[1]['item']['files']) == 1
    # files are private: another user can't open them
    assert head(f"/feedback/files/{files['dyno.xlsx']['id']}", call('/auth/login', method='POST', body={'email': 'fb2@test.com', 'password': 'password12'})[1].get('token', ''))[0] in (401, 404)
    br.close()

# the brief for Claude lists the attachments (shared/feedback.js buildBrief)
import subprocess
it = call(f'/admin/feedback/{FID}', OT)[1]['item']
brief = subprocess.run(['node', '--input-type=module', '-e',
  "import { buildBrief } from './shared/feedback.js'; let s=''; process.stdin.on('data', d => s += d).on('end', () => console.log(buildBrief(JSON.parse(s))));"],
  input=json.dumps(it), capture_output=True, text=True, cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')).stdout
assert '## Attachments' in brief and 'dyno.xlsx' in brief and 'sync.log' in brief, brief

assert not errors, errors
print('E2E35 OK')
