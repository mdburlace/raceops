# Training pack: practice team (create from the admin page, banner, demo data, reset), the crew chief exercise on
# the demo data, practice teams can't send calendar requests, the Training guide section, printed cards and videos.
import json, re, sys, os, urllib.request, urllib.error
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
login = lambda: call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
live = lambda recs: [r for r in recs if not r.get('deleted')]
vals = lambda r: r['data'].get('values') or {}

o = login(); OT = o['token']
home_tid = o['memberships'][0]['tenant_id']

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = None
    shot = lambda n: page.screenshot(path=f'{OUT}/{n}.png', full_page=True)
    def session(tid):
        # a fresh browser context per team, so the app can't write the previous session back
        global page
        page = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
        o = login()
        s = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': tid}
        page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
        return o

    # ---- a platform admin creates a practice team from Teams & licences
    session(home_tid)
    expect(page.locator('[data-testid="practice-banner"]')).to_have_count(0)
    page.goto(B + '/admin/teams')
    page.locator('[data-testid="nt-practice"] input').check()
    expect(page.locator('#nt-name')).to_have_value('Practice team')
    expect(page.locator('#nt-type')).to_have_value('both')
    page.fill('#nt-name', 'Practice — e2e33')
    page.click('button:has-text("Create team")')
    expect(page.locator('text=Created Practice — e2e33.')).to_be_visible(timeout=20000)
    shot('34-01-created')
    tenants = call('/admin/tenants', OT)[1]
    tenants = tenants.get('tenants', tenants) if isinstance(tenants, dict) else tenants
    t = next(x for x in tenants if x['name'] == 'Practice — e2e33')
    TID = t['id']
    o = login(); OT = o['token']
    assert any(m['tenant_id'] == TID for m in o['memberships']), 'the admin is a member of the new practice team'

    # ---- the demo data is there
    recs = live(call(f'/t/{TID}/sync?since=0', OT)[1]['records'])
    by = lambda type: [r for r in recs if r['type'] == type]
    assert len(by('car')) == 2, by('car')
    assert any(vals(r).get('name') == 'Valley Speedway — Club night' for r in by('event'))
    assert any(vals(r).get('job_no') == 'J-1001' for r in by('job'))
    assert len(by('setup')) >= 17, len(by('setup'))
    assert len(by('schedule')) == 3 and len(by('track_check')) == 1
    first_count = len(recs)

    # ---- banner, reset box, and the crew chief exercise
    session(TID)
    banner = page.locator('[data-testid="practice-banner"]')
    expect(banner).to_be_visible()
    expect(banner.locator('a:has-text("Training exercises")')).to_have_attribute('href', '/help/training')
    page.goto(B + '/events')
    page.click('a.list-row:has-text("Valley Speedway — Club night")')
    expect(page.locator('a:has-text("Heat 1")').first).to_be_visible()
    page.select_option('.add-session select', 'Feature')
    page.click('.add-session button:has-text("Add session")')
    expect(page.locator('select[aria-label="Session to copy"]')).to_contain_text('Heat 1')
    page.click('button:has-text("Copy this session")')
    page.click('button[aria-label="Less RR Reb"]')
    page.click('button[aria-label="More Top wing angle"]'); page.click('button[aria-label="More Top wing angle"]')
    expect(page.locator('#f-wing_angle')).to_have_value(re.compile(r'^14(\.0)?$'))
    page.locator('label:has-text("Changes only") input').check()
    expect(page.locator('[data-testid="change-count"]')).to_contain_text('2')
    shot('34-02-feature-changes')
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(1500)
    expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    recs = live(call(f'/t/{TID}/sync?since=0', OT)[1]['records'])
    feat = [r for r in recs if r['type'] == 'setup' and vals(r).get('session') == 'Feature' and vals(r).get('event') and
            any(e['id'] == vals(r)['event'] and vals(e).get('name') == 'Valley Speedway — Club night' for e in recs)]
    assert len(feat) == 1, feat
    fv = vals(feat[0])
    assert float(fv.get('wing_angle')) == 14, fv.get('wing_angle')
    assert not fv.get('finish') and not fv.get('driver_feel'), 'results and feedback are not copied'

    # ---- the engine builder's teardown exercise: Hart 410's tired #4 intake spring
    page.goto(B + '/engines')
    hart = page.locator('.engine-card', has_text='Hart 410')
    hart.locator('[data-testid="teardown-row"]', has_text='Down on power').click()
    expect(page.locator('[data-testid="teardown-valvetrain"]')).to_contain_text('#4 (12%)', timeout=15000)
    expect(page.locator('[data-testid="teardown-causes"]')).to_contain_text('Lean mixture')
    page.get_by_role('button', name='Fill in 1 suggested decision').click()
    page.locator('#f-root_cause').select_option('Metal fatigue')
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_url('**/engines', timeout=15000)
    def td_saved():
        for r in live(call(f'/t/{TID}/sync?since=0', OT)[1]['records']):
            if r['type'] == 'engine_teardown' and vals(r).get('root_cause') == 'Metal fatigue':
                return r
    for _ in range(40):
        td = td_saved()
        if td: break
        page.wait_for_timeout(500)
    assert td and next(x for x in vals(td)['parts'] if x['part'] == 'Valve springs')['decision'] == 'Replace', td
    shot('34-03a-teardown')

    # ---- practice teams can't send to the shared calendars
    st, r = call(f'/t/{TID}/calendar/requests', OT, 'POST', {'kind': 'fixture'})
    assert st == 400 and 'practice team' in r.get('error', '').lower(), (st, r)

    # ---- reset puts the demo data back
    page.goto(B + '/team/members')
    expect(page.locator('button:has-text("Reset practice data")')).to_be_visible()
    page.once('dialog', lambda d: d.accept())
    page.click('button:has-text("Reset practice data")')
    expect(page.locator('[role="status"]')).to_be_visible(timeout=20000)
    shot('34-03-reset')
    recs = live(call(f'/t/{TID}/sync?since=0', OT)[1]['records'])
    assert len(recs) == first_count, (len(recs), first_count)
    assert feat[0]['id'] not in {r['id'] for r in recs}, 'the trainee’s sheet is gone'
    page.goto(B + '/events'); page.click('a.list-row:has-text("Valley Speedway — Club night")')
    expect(page.locator('a:has-text("Feature")')).to_have_count(0, timeout=15000)

    # ---- only practice teams can be reset
    st, r = call(f'/t/{home_tid}/practice/reset', OT, 'POST', {})
    assert st == 400, (st, r)

    # ---- the Training section, cards and videos
    page.goto(B + '/help/training')
    for a in ['Quick start', 'Quick reference cards', "Trainer's guide", 'Crew chief', 'Mechanic', 'Engine builder', 'Platform admin']:
        expect(page.locator(f'.md a:has-text("{a}")').first).to_be_visible()
    page.goto(B + '/help/training-crew-chief')
    vid = page.locator('figure.guide-video video')
    expect(vid).to_have_count(1)
    src = vid.get_attribute('src'); poster = vid.get_attribute('poster')
    assert src and '.webm' in src and poster and '.webp' in poster, (src, poster)
    for u in (src, poster):
        assert urllib.request.urlopen(B + u if u.startswith('/') else u).status == 200, u
    expect(page.locator('details summary').first).to_be_visible()
    page.goto(B + '/help/training-trainers')
    expect(page.locator('.md table').first).to_contain_text('Set up the team')
    page.goto(B + '/print/guide?ids=training-cards')
    expect(page.locator('.print-cards')).to_be_visible(timeout=15000)
    expect(page.locator('.print-cards .md h2')).to_have_count(6)
    expect(page.locator('.print-cards .hp-only-title')).to_be_hidden()
    expect(page.locator('.print-cards')).to_contain_text('Race night')
    expect(page.locator('.print-cards')).not_to_contain_text('Training: crew chief')
    shot('34-04-cards')
    br.close()

assert not errors, errors
print('E2E34 OK')
