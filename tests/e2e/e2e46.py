# Quick add extras and photos: Turns − and + by half a turn, Last session's value and Say it (speech) on the
# quick add screen, the spoken numbers it understands; the team photo (owner, and a role given Change the team
# photo such as the Marketing Manager; not a mechanic), shrunk on the device, in the sidebar and kept when team
# settings are saved; member photos added by the person or their team manager, seen by teammates only, and
# removed; files that aren't photos refused.
import io, json, os, re, sys, time, uuid, urllib.request, urllib.error
from PIL import Image
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
errors = []

def call(path, token=None, method='GET', body=None, raw=False):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); data = r.read()
        return (r.status, data, r.headers.get('content-type')) if raw else (r.status, json.loads(data or b'{}'))
    except urllib.error.HTTPError as e:
        data = e.read()
        return (e.code, data, None) if raw else (e.code, json.loads(data or b'{}'))
def put_file(path, token, data, name='photo.jpg', ctype='image/jpeg'):
    b = uuid.uuid4().hex
    body = (f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n').encode() + data + f'\r\n--{b}--\r\n'.encode()
    req = urllib.request.Request(B + '/api' + path, method='PUT', data=body, headers={'content-type': f'multipart/form-data; boundary={b}', 'authorization': f'Bearer {token}'})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
login = lambda e='owner@test.com', p='password1': call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
def png(w, h, colour):
    buf = io.BytesIO(); Image.new('RGB', (w, h), colour).save(buf, 'PNG'); return buf.getvalue()
def jpg(w, h, colour):
    buf = io.BytesIO(); Image.new('RGB', (w, h), colour).save(buf, 'JPEG'); return buf.getvalue()
os.makedirs(f'{OUT}/files', exist_ok=True)
TEAM_PNG = f'{OUT}/files/team.png'; open(TEAM_PNG, 'wb').write(png(1600, 1200, (200, 60, 30)))
FACE_PNG = f'{OUT}/files/face.png'; open(FACE_PNG, 'wb').write(png(900, 900, (30, 90, 200)))
NOT_PHOTO = f'{OUT}/files/notes.txt'; open(NOT_PHOTO, 'w').write('not a photo')

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Photo Racing', 'plan': 'pro', 'practice': True}); assert st == 200, t; TID = t['id']
st, t2 = call('/admin/tenants', OT, 'POST', {'name': 'Other Racing', 'plan': 'pro'}); assert st == 200, t2; TID2 = t2['id']
o = login(); OT = o['token']
RUN = TID[:6]
def member(tid, email, role, name):
    r = next(x for x in call(f'/t/{tid}/roles', OT)[1] if x['name'] == role)
    st, inv = call(f'/t/{tid}/invites', OT, 'POST', {'email': email, 'role_id': r['id']}); assert st == 200, inv
    assert call(f'/invites/{inv["token"]}/accept', method='POST', body={'name': name, 'password': 'password46'})[0] == 200
    return login(email, 'password46')
MKT = member(TID, f'mkt46+{RUN}@test.com', 'Marketing Manager', 'Mia Marketing')
MEC = member(TID, f'mech46+{RUN}@test.com', 'Mechanic', 'Max Mechanic')
OUTSIDER = member(TID2, f'out46+{RUN}@test.com', 'Mechanic', 'Olly Outsider')
roles = {r['name']: r for r in call(f'/t/{TID}/roles', OT)[1]}
assert 'team.photo' in roles['Marketing Manager']['permissions'] and 'team.photo' not in roles['Mechanic']['permissions']
recs = lambda: [r for r in call(f'/t/{TID}/sync?since=0', OT)[1]['records'] if not r['global'] and not r['deleted']]
R = recs()
tonight = next(r for r in R if r['type'] == 'event' and r['data']['values'].get('name') == 'Valley Speedway — Club night')
heat1 = next(r for r in R if r['type'] == 'setup' and r['data']['values'].get('event') == tonight['id'] and r['data']['values'].get('session') == 'Heat 1')
team_settings = lambda tok=OT: next(m for m in call('/me', tok)[1]['memberships'] if m['tenant_id'] == TID)['settings']

# fake speech recognition: says whatever window.__said holds
FAKE_SPEECH = """
window.__said = '';
const FakeRec = class {
  start() { setTimeout(() => { this.onresult && this.onresult({ results: [[{ transcript: window.__said }, { transcript: window.__said + ' please' }]] }); this.onend && this.onend(); }, 60); }
  abort() {} stop() {}
};
for (const k of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, k, { value: FakeRec, configurable: true, writable: true });
"""

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900})
    ctx.add_init_script(FAKE_SPEECH)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    def session(lg, tid=TID):
        s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': tid}
        page.goto(B); page.wait_for_load_state('networkidle'); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    shot = lambda n, full=True: page.screenshot(path=f'{OUT}/{n}.png', full_page=full)
    qa = page.locator('[data-testid="quick-add"]')
    disp = page.locator('[data-testid="qa-display"]')
    def open_qa(sel):
        page.locator(sel).scroll_into_view_if_needed(); page.locator(sel).click(button='right')
        expect(qa).to_be_visible()
    session(o)

    # ---- Turns: − and + by half a turn
    page.goto(B + f'/r/setup/{heat1["id"]}')
    cell = page.locator('.cg-cell:has(#f-turns-RR)')
    expect(page.locator('#f-turns-RR')).to_have_value('5')
    cell.locator('button[aria-label^="More"]').click()
    expect(page.locator('#f-turns-RR')).to_have_value('5.5')
    cell.locator('button[aria-label^="Less"]').click(); cell.locator('button[aria-label^="Less"]').click()
    expect(page.locator('#f-turns-RR')).to_have_value('4.5')

    # ---- Last session: the same box on this car's previous sheet (round 8's Feature)
    open_qa('#f-turns-LR')
    last = page.locator('[data-testid="qa-last"]')
    expect(last).to_contain_text('Last session (Feature): 4')
    qa.get_by_role('button', name='Clear').click()
    last.click()
    expect(disp).to_contain_text('4')
    qa.get_by_role('button', name='Cancel').click()

    # ---- Say it: "one and three eighths" → 1.375; something that isn't a number is refused
    open_qa('#f-blocked-LR')
    page.evaluate("window.__said = 'one and three eighths'")
    qa.get_by_role('button', name='Say the number').click()
    expect(disp).to_contain_text('1.375')
    expect(page.locator('[data-testid="qa-heard"]')).to_have_text('Heard 1.375')
    expect(page.locator('[data-testid="qa-frac"]')).to_contain_text('1 3/8')
    shot('46-01-say-it', False)
    page.evaluate("window.__said = 'banana bread'")
    qa.get_by_role('button', name='Say the number').click()
    expect(page.locator('[data-testid="qa-heard"]')).to_contain_text('Didn’t catch a number')
    expect(disp).to_contain_text('1.375')
    qa.get_by_role('button', name='OK').click()
    expect(page.locator('#f-blocked-LR')).to_have_value('1.375')
    open_qa('#f-rpm_max')
    page.evaluate("window.__said = 'eight thousand seven hundred and fifty'")
    qa.get_by_role('button', name='Say the number').click()
    expect(disp).to_contain_text('8750')
    qa.get_by_role('button', name='OK').click()
    expect(page.locator('#f-rpm_max')).to_have_value('8750')

    # ---- the team photo: the owner adds it; it's made smaller on the device
    page.goto(B + '/team/members')
    prof = page.locator('[data-testid="team-profile"]')
    expect(prof.locator('[data-testid="team-photo"]')).to_contain_text('PR')      # initials until there's a photo
    prof.locator('input[aria-label="Choose a team photo"]').set_input_files(TEAM_PNG)
    expect(prof.locator('[data-testid="team-photo"] img')).to_be_visible(timeout=15000)
    page.wait_for_function("() => document.querySelector('[data-testid=\"team-photo\"] img')?.naturalWidth > 0")
    expect(page.locator('[data-testid="side-team-photo"] img')).to_be_visible()
    expect(prof.get_by_role('button', name='Change team photo')).to_be_visible()
    st_ = team_settings()
    assert st_['photo']['at'] and st_['photo']['path'].startswith(f'{TID}/team-photo-'), st_.get('photo')
    st, data, ctype = call(f'/t/{TID}/photo', OT, raw=True)
    assert st == 200 and ctype.startswith('image/jpeg'), (st, ctype)
    im = Image.open(io.BytesIO(data)); assert max(im.size) == 800 and im.size == (800, 600), im.size
    shot('46-02-team-profile')
    # saving team settings (Region & currency, Rename) keeps it; a device can't point it somewhere else
    s_ = team_settings(); s_['photo'] = {'path': '../../etc/passwd', 'at': 'x'}; s_['currency'] = 'NZD'
    assert call(f'/t/{TID}', OT, 'PATCH', {'settings': s_})[0] == 200
    s2 = team_settings(); assert s2['photo'] == st_['photo'] and s2['currency'] == 'NZD', s2

    # ---- who can change it: the Marketing Manager can, a mechanic can't; teammates see it, outsiders don't
    st, r = put_file(f'/t/{TID}/photo', MKT['token'], jpg(400, 300, (10, 160, 60))); assert st == 200 and r['at'], (st, r)
    assert team_settings()['photo']['by'] == MKT['user']['id']
    assert not os.path.exists(os.path.join('/var/tmp/raceops-test/uploads', st_['photo']['path'])) if os.path.isdir('/var/tmp/raceops-test/uploads') else True   # the old file is gone
    st, r = put_file(f'/t/{TID}/photo', MEC['token'], jpg(400, 300, (0, 0, 0))); assert st == 403, (st, r)
    assert call(f'/t/{TID}/photo', MEC['token'], 'DELETE')[0] == 403
    assert call(f'/t/{TID}/photo', MEC['token'], raw=True)[0] == 200
    assert call(f'/t/{TID}/photo', OUTSIDER['token'], raw=True)[0] == 403
    # not a photo
    st, r = put_file(f'/t/{TID}/photo', OT, b'hello, this is text', 'notes.txt', 'image/jpeg'); assert st == 400 and 'isn’t a JPEG' in r['error'], (st, r)

    # ---- member photos: the manager adds the mechanic's from Team → Members
    page.goto(B + '/team/members')
    row = page.locator('[data-testid="member-row"]', has_text='Max Mechanic')
    expect(row.locator('[data-testid="member-photo"]')).to_contain_text('MM')
    row.locator('input[aria-label="Choose a photo"]').set_input_files(FACE_PNG)
    expect(row.locator('[data-testid="member-photo"] img')).to_be_visible(timeout=15000)
    expect(row.get_by_role('button', name='Change photo')).to_be_visible()
    # a file that isn't a photo says so
    row.locator('input[aria-label="Choose a photo"]').set_input_files(NOT_PHOTO)
    expect(row.locator('[role="alert"]')).to_contain_text('Choose a photo')
    st, data, ctype = call(f'/users/{MEC["user"]["id"]}/photo', MKT['token'], raw=True)
    assert st == 200 and Image.open(io.BytesIO(data)).size == (800, 800), st
    assert call(f'/users/{MEC["user"]["id"]}/photo', OUTSIDER['token'], raw=True)[0] == 404   # not in the same team
    # the marketing manager can't change other people's; nobody but an owner changes an owner's
    st, r = put_file(f'/t/{TID}/members/{MEC["user"]["id"]}/photo', MKT['token'], jpg(200, 200, (1, 2, 3))); assert st == 403, (st, r)
    st, r = put_file(f'/t/{TID}/members/{o["user"]["id"]}/photo', MKT['token'], jpg(200, 200, (1, 2, 3))); assert st == 403, (st, r)
    st, r = put_file(f'/t/{TID2}/members/{MEC["user"]["id"]}/photo', OT, jpg(200, 200, (1, 2, 3))); assert st == 404, (st, r)   # not in that team

    # ---- the mechanic sees it on Profile and changes it there; the team photo has no buttons for them
    session(MEC)
    page.goto(B + '/profile')
    mine = page.locator('[data-testid="my-photo"]')
    expect(mine.locator('[data-testid="profile-photo"] img')).to_be_visible(timeout=15000)
    old_at = call('/me', MEC['token'])[1]['user']['photo_at']
    mine.locator('input[aria-label="Choose a photo"]').set_input_files(TEAM_PNG)
    page.wait_for_function(f"() => !document.querySelector('[data-testid=\"profile-photo\"] img')?.src.includes({json.dumps(old_at.replace(':', '%3A'))})", timeout=15000)
    assert call('/me', MEC['token'])[1]['user']['photo_at'] != old_at
    expect(page.locator('.sidebar-foot .avatar img')).to_be_visible()
    page.goto(B + '/team/members')
    expect(page.locator('[data-testid="team-profile"]')).to_contain_text('is added by the team manager')
    expect(page.locator('[data-testid="team-profile"] input[type=file]')).to_have_count(0)
    expect(page.locator('[data-testid="member-row"]', has_text='Mia Marketing').locator('input[type=file]')).to_have_count(0)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(B + '/profile'); page.wait_for_timeout(500)
    shot('46-03-profile-phone', False)
    sw = page.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, sw
    page.set_viewport_size({'width': 1366, 'height': 900})
    # removing their own
    page.on('dialog', lambda d: d.accept())
    mine = page.locator('[data-testid="my-photo"]')
    mine.get_by_role('button', name='Remove').click()
    expect(mine.locator('[data-testid="profile-photo"]')).to_contain_text('MM', timeout=15000)
    assert call('/me', MEC['token'])[1]['user']['photo_at'] is None
    assert call(f'/users/{MEC["user"]["id"]}/photo', OT, raw=True)[0] == 404

    # ---- the owner removes the team photo
    session(o)
    page.goto(B + '/team/members')
    page.locator('[data-testid="team-profile"]').get_by_role('button', name='Remove').click()
    expect(page.locator('[data-testid="team-photo"]')).to_contain_text('PR', timeout=15000)
    expect(page.locator('[data-testid="side-team-photo"]')).to_have_count(0)
    assert 'photo' not in team_settings()
    br.close()

assert not errors, errors
print('E2E46 OK')
