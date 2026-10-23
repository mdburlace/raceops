# Feedback & ideas: users report bugs and ask for features, admins capture ideas, review into the pipeline,
# publish the roadmap with votes, send work to Claude (mock GitHub issue / brief), and everyone is told.
import json, sys, os, glob, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
OUTBOX = os.environ.get('MAIL_OUTBOX', '/var/tmp/outbox')
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
errors = []

def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
login = lambda e, p: call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
def mails(to=None, subject=None):
    out = []
    for f in sorted(glob.glob(f'{OUTBOX}/*.json')):
        m = json.load(open(f))
        if (not to or to in m['to']) and (not subject or subject in m['subject']): out.append(m)
    return out
def wait_mail(to=None, subject=None, secs=6):
    for _ in range(secs * 5):
        m = mails(to, subject)
        if m: return m
        time.sleep(0.2)
    return []
def shot(page, name, full=True):
    page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
def team(name, email, pw, role='Crew Chief'):
    st, t = call('/admin/tenants', OT, 'POST', {'name': name, 'plan': 'pro'}); tid = t['id']
    roles = call(f'/t/{tid}/roles', OT)[1]; roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
    r = next(x for x in roles if x['name'] == role)
    st, inv = call(f'/t/{tid}/invites', OT, 'POST', {'email': email, 'role_id': r['id']}); tok = inv.get('token') or inv.get('invite', {}).get('token')
    assert call(f'/invites/{tok}/accept', method='POST', body={'name': name + ' Crew', 'password': pw})[0] == 200
    return tid, login(email, pw)
def session(page, lg, tid):
    s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': tid}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

o = login('owner@test.com', 'password1'); OT = o['token']
TA, ua = team('Feedback Racing', 'fb1@test.com', 'password11'); UA = ua['token']
TB, ub = team('Roadmap Racing', 'fb2@test.com', 'password12', 'Viewer'); UB = ub['token']

# ---- permissions: only platform admins see the admin side
assert call('/admin/feedback', UA)[0] == 403
assert call('/feedback', UA, 'POST', {'kind': 'idea', 'title': 'Nope'})[0] == 400

with sync_playwright() as pw:
    br = pw.chromium.launch()
    def new_page(w=1366, h=900):
        p = br.new_page(viewport={'width': w, 'height': h})
        p.on('pageerror', lambda e: errors.append(str(e)))
        p.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
        return p

    # ---- 1. a crew chief reports a bug from the setup sheets page, with a screenshot
    pu = new_page(); session(pu, ua, TA)
    pu.goto(B + '/setups'); pu.wait_for_timeout(500)
    pu.click('.sidebar .nav-link:has-text("Feedback & roadmap")')
    expect(pu.locator('h1')).to_have_text('Feedback & roadmap')
    send = pu.locator('[data-testid="fb-send"]')
    send.locator('button[role="radio"]:has-text("Something isn’t working")').click()
    send.get_by_label('Title').fill('Stagger won’t save on the setup sheet')
    send.get_by_label('Details').fill('After pressing Save the stagger goes back to blank.')
    send.get_by_label('Steps').fill('1. Open a setup sheet\n2. Type 4.5 in stagger\n3. Save')
    send.get_by_label('Expected').fill('Stagger stays 4.5')
    expect(send).to_contain_text('/setups')
    send.get_by_label('Attach files').set_input_files(f'{FIX}/ai-sheet.png')
    shot(pu, '30-01-report-bug')
    send.locator('button:has-text("Send problem report")').click()
    expect(pu.locator('.notice.info')).to_contain_text('has been sent for review')

    # ---- 2. and asks for a new feature
    send.locator('button[role="radio"]:has-text("A new feature")').click()
    send.get_by_label('Title').fill('Log tyre pressures for every session')
    send.get_by_label('Details').fill('So we can see how pressures build up over the night.')
    send.locator('button:has-text("Send request")').click()
    expect(pu.locator('.notice.info')).to_contain_text('Log tyre pressures')
    pu.click('.tabs button:has-text("My submissions")')
    mine = pu.locator('[data-testid="fb-mine-item"]')
    expect(mine).to_have_count(2)
    expect(mine.first).to_contain_text('Waiting for review')
    expect(pu.locator('[data-testid="fb-mine-item"]:has-text("Stagger") .fb-thumbs img')).to_have_count(1)
    mine_items = call('/feedback/mine', UA)[1]['items']
    bug = next(i for i in mine_items if i['kind'] == 'bug'); feat = next(i for i in mine_items if i['kind'] == 'feature')
    assert bug['areas'] == ['module:setups'] and bug['page'] == '/setups', bug
    assert 'context' not in bug   # device details are for admins only

    # admins are told
    assert wait_mail(subject='New bug #'), mails()
    assert call('/me', OT)[1]['notices']['feedback_new'] >= 2

    # ---- 3. the admin reviews: edit, link areas, ask a question
    pa = new_page(); session(pa, o, TA)
    expect(pa.locator('.nav-link:has-text("Feedback & ideas") .nav-badge')).to_be_visible()
    pa.goto(B + '/admin/feedback')
    expect(pa.locator('.tabs button:has-text("Inbox")')).to_contain_text('(2)')
    pa.click(f'[data-testid="fb-row"]:has-text("#{bug["ref"]} ")')
    det = pa.locator('[data-testid="fb-detail"]')
    expect(det).to_contain_text('Feedback Racing')
    expect(det).to_contain_text('/setups')
    expect(det.locator('.fb-thumbs img')).to_have_count(1)
    det.locator('button:has-text("Edit")').click()
    ed = det.locator('[data-testid="fb-editor"]')
    ed.get_by_label('Priority').select_option('high')
    ed.get_by_label('Done when').fill('- Stagger saves on desktop and phone\n- e2e covers it')
    ed.locator('button:has-text("Change…")').click()
    ed.locator('[data-testid="fb-area-list"] label:has-text("Offline and sync") input').check()
    ed.locator('button:has-text("Done")').first.click()
    shot(pa, '30-02-admin-edit')
    ed.locator('button:has-text("Save changes")').click()
    expect(det).to_contain_text('Offline and sync')
    det.get_by_label('Note').fill('Which phone were you using?')
    det.locator('button:has-text("Ask the submitter")').click()
    expect(det.locator('.req-msg')).to_have_count(1)

    # the crew chief sees the question and answers
    assert wait_mail(to='fb1@test.com', subject='a question for you')
    pu.goto(B + '/feedback?tab=mine'); pu.wait_for_timeout(800)
    item = pu.locator('[data-testid="fb-mine-item"]:has-text("Stagger")')
    expect(item).to_contain_text('Which phone were you using?')
    item.get_by_label('Your answer').fill('iPhone 15, installed app')
    item.locator('button:has-text("Send answer")').click()
    expect(item).to_contain_text('iPhone 15')
    assert wait_mail(subject=f'Reply on #{bug["ref"]}')

    # ---- 4. approve the bug into Now (not public), the feature into Next (public)
    pa.goto(B + '/admin/feedback'); pa.click(f'[data-testid="fb-row"]:has-text("#{bug["ref"]} ")')
    det = pa.locator('[data-testid="fb-detail"]')
    expect(det).to_contain_text('iPhone 15')
    det.locator('button:has-text("Approve → Now")').click()
    expect(det).to_contain_text('Not on the public roadmap')
    pa.goto(B + '/admin/feedback'); pa.click(f'[data-testid="fb-row"]:has-text("#{feat["ref"]} ")')
    det = pa.locator('[data-testid="fb-detail"]')
    det.locator('button:has-text("Edit")').click()
    det.locator('label:has-text("Show on the public roadmap") input').check()
    det.get_by_label('Roadmap summary').fill('Record tyre pressures per session and see the trend')
    det.locator('button:has-text("Save changes")').click()
    det.locator('button:has-text("Approve → Next")').click()
    expect(det).to_contain_text('On the roadmap as “Record tyre pressures')
    assert wait_mail(to='fb1@test.com', subject='approved (Next)')

    # ---- 5. another team finds it while typing, and votes instead of sending a duplicate
    pb = new_page(); session(pb, ub, TB)
    pb.goto(B + '/feedback')
    sb = pb.locator('[data-testid="fb-send"]')
    sb.locator('button[role="radio"]:has-text("Improve something")').click()
    sb.get_by_label('Title').fill('tyre pressures each session')
    sim = pb.locator('[data-testid="fb-similar"]')
    expect(sim).to_contain_text('Log tyre pressures')
    sim.locator('button:has-text("Vote")').click()
    expect(sim.locator('button[aria-pressed="true"]')).to_contain_text('Voted (1)')
    # and also sends a near-duplicate, which the admin merges
    sb.get_by_label('Details').fill('Pressures per heat')
    sb.locator('button:has-text("Send request")').click()
    expect(pb.locator('.notice.info')).to_contain_text('has been sent')
    dup = next(i for i in call('/feedback/mine', UB)[1]['items'])
    pb.click('.tabs button:has-text("Roadmap")')
    road = pb.locator('[data-testid="fb-roadmap"]')
    expect(road.locator('.fb-col:has(h3:has-text("Next"))')).to_contain_text('Record tyre pressures per session')
    expect(road).not_to_contain_text('Stagger')   # bugs stay private
    shot(pb, '30-03-roadmap')

    pa.goto(B + '/admin/feedback'); pa.click(f'[data-testid="fb-row"]:has-text("#{dup["ref"]} ")')
    det = pa.locator('[data-testid="fb-detail"]')
    det.get_by_label('Duplicate of').select_option(label=f'#{feat["ref"]} Log tyre pressures for every session')
    det.locator('button:has-text("Mark as duplicate")').click()
    expect(det).to_contain_text('Already requested')
    road_items = call('/feedback/roadmap', UB)[1]['items']
    assert next(i for i in road_items if i['ref'] == feat['ref'])['votes'] == 1   # the vote they'd already cast
    assert call(f'/feedback/{feat["id"]}/vote', UA, 'POST', {})[1]['votes'] == 2
    pb.goto(B + '/feedback?tab=mine')
    expect(pb.locator('[data-testid="fb-mine-item"]')).to_contain_text('Already requested as')

    # ---- 6. send the bug to Claude: the brief points at the code and the guide, then a (mock) GitHub issue
    pa.goto(B + '/admin/feedback?view=pipeline')
    pipe = pa.locator('[data-testid="fb-pipeline"]')
    expect(pipe.locator('.fb-col:has(h3:has-text("Now"))')).to_contain_text('Stagger')
    expect(pipe.locator('.fb-col:has(h3:has-text("Next"))')).to_contain_text('Log tyre pressures')
    pipe.locator(f'[data-testid="fb-row"]:has-text("#{bug["ref"]} ")').click()
    det = pa.locator('[data-testid="fb-detail"]')
    det.locator('button:has-text("Send to Claude…")').click()
    brief = det.get_by_label('Brief for Claude').input_value()
    for want in ['# Bug: Stagger won’t save', '## Steps to reproduce', 'web/src/pages/Setups.jsx', 'web/src/lib/sync.js',
                 'docs/guide/setup-sheets.md', 'Stagger saves on desktop and phone', 'iPhone 15', 'CLAUDE.md', 'tests/e2e/run.sh', 'Page: `/setups`', '## Attachments', 'ai-sheet.png']:
        assert want in brief, (want, brief)
    shot(pa, '30-04-send-to-claude')
    det.locator('button:has-text("Create GitHub issue")').click()
    sent = pa.locator('[data-testid="fb-sent"]')
    expect(sent).to_contain_text('GitHub issue #')
    expect(sent.locator('a')).to_have_attribute('href', 'https://github.com/example/raceops/issues/1')
    full = call(f'/admin/feedback/{bug["id"]}', OT)[1]['item']
    assert full['status'] == 'in_progress' and full['github_issue'] == 1, full

    # done with a release; the crew chief is told
    det.get_by_label('Release').fill('1.6.0')
    det.locator('button:has-text("Mark done")').click()
    expect(det).to_contain_text('Done')
    assert wait_mail(to='fb1@test.com', subject='done')
    pu.goto(B + '/feedback?tab=mine')
    expect(pu.locator('[data-testid="fb-mine-item"]:has-text("Stagger")')).to_contain_text('in release 1.6.0')

    # ---- 7. an admin's own idea: capture, link areas, approve to Later, copy the brief and mark it sent
    pa.goto(B + '/admin/feedback')
    pa.click('button:has-text("New idea")')
    ne = pa.locator('[data-testid="fb-editor"]')
    ne.get_by_label('Title').fill('Bulk-edit pressures on several setup sheets')
    ne.get_by_label('Kind').select_option('feature')
    ne.get_by_label('Description').fill('Change one value across a night’s sheets at once.')
    ne.locator('button:has-text("Link to areas…")').click()
    ne.locator('[data-testid="fb-area-list"] label:has-text("Setup sheets & advisor") input').check()
    ne.locator('button:has-text("Save idea")').click()
    expect(pa.locator('.tabs button.active')).to_contain_text('Ideas')
    det = pa.locator('[data-testid="fb-detail"]')
    expect(det).to_contain_text('Idea from')
    det.locator('button:has-text("Approve → Later")').click()
    det.locator('button:has-text("Send to Claude…")').click()
    det.locator('button:has-text("Mark as sent")').click()
    expect(pa.locator('[data-testid="fb-sent"]')).to_contain_text('Sent to Claude')
    idea = next(i for i in call('/admin/feedback?view=pipeline', OT)[1]['items'] if i['title'].startswith('Bulk-edit'))
    assert idea['status'] == 'in_progress' and idea['public'] and idea['source'] == 'admin', idea

    # ---- 8. decline needs a reason
    st, r = call('/feedback', UB, 'POST', {'kind': 'feature', 'title': 'Make it play music', 'description': 'For the trailer'})
    nid = r['item']['id']
    assert call(f'/admin/feedback/{nid}/decide', OT, 'POST', {'action': 'decline'})[0] == 400
    assert call(f'/admin/feedback/{nid}/decide', OT, 'POST', {'action': 'decline', 'note': 'Out of scope for RaceOps'})[1]['item']['status'] == 'declined'
    assert wait_mail(to='fb2@test.com', subject='not going ahead')

    # pictures are private to the sender and admins
    fid = next(i for i in call('/feedback/mine', UA)[1]['items'] if i['kind'] == 'bug')['files'][0]['id']
    assert call(f'/feedback/files/{fid}', UB)[0] == 404

    # ---- 9. the badge clears once seen; mobile roadmap
    assert call('/me', UA)[1]['notices']['feedback_updates'] == 0
    pm = new_page(390, 844); session(pm, ub, TB)
    pm.goto(B + '/feedback?tab=roadmap'); pm.wait_for_timeout(800)
    expect(pm.locator('[data-testid="fb-road-item"]').first).to_be_visible()
    shot(pm, '30-05-mobile-roadmap')
    br.close()

assert not errors, errors
print('E2E30 OK')
