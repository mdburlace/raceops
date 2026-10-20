import os
import json, sys, urllib.request, urllib.error
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []

def api(path, token=None, method='GET', body=None, ok=True):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        if ok: raise
        return {'status': e.code, **json.loads(e.read() or b'{}')}

def shot(page, name, full=True):
    page.wait_for_timeout(400)
    page.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def sess(o):
    return {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': o['memberships'][0]['tenant_id'] if o['memberships'] else None}

def open_as(ctx, o):
    p = ctx.new_page()
    p.on('pageerror', lambda e: errors.append(str(e)))
    p.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    p.goto(B); p.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess(o)))})")
    p.goto(B); p.wait_for_timeout(2500)
    return p

owner = api('/auth/login', body={'email': 'owner@test.com', 'password': 'password1'}, method='POST')
OT = owner['token']; TID = owner['memberships'][0]['tenant_id']

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900})
    page = open_as(ctx, owner)

    # nav + overview
    expect(page.locator('.nav-area:has-text("Platform admin")')).to_be_visible()
    expect(page.locator('.area-tile.area-admin')).to_be_visible()
    page.click('.area-tile.area-admin'); expect(page.locator('h1')).to_have_text('Platform admin')
    expect(page.locator('.admin-stat:has-text("Track directory") b')).to_have_text('705')

    # ---- plans: seats + pool on Trackside, new Club plan ----
    page.goto(B + '/admin/plans')
    card = page.locator('.plan-card:has(h3:text-is("Trackside — track + workshop basics"))')
    card.locator('input[id^="pseat-"]').fill('2'); card.locator('input[id^="ppool-"]').fill('1'); card.locator('input[id^="pp-"]').fill('$29 / month')
    card.locator('button:has-text("Save plan")').click()
    expect(page.locator('.notice.info').first).to_contain_text('Plan saved')
    page.fill('input[aria-label="New plan name"]', 'Club'); page.click('button:has-text("Add plan")')
    club = page.locator('.plan-card:has(h3:text-is("Club"))')
    expect(club).to_be_visible()
    club.locator('input[aria-label="Club: In the Workshop"]').check(); club.locator('button:has-text("Save plan")').click()
    page.wait_for_timeout(500)
    plans = api('/admin/plans', OT)['plans']
    assert plans['trackside']['seats'] == 2 and plans['trackside']['pool'] == 1, plans['trackside']
    assert set(plans['club']['features']) == {'track', 'team', 'workshop'}, plans['club']
    shot(page, 'p6-02-plans')

    # ---- create a team with an owner invite (admin not joining) ----
    page.goto(B + '/admin/teams')
    page.fill('#nt-name', 'Speedway Juniors'); page.select_option('#nt-plan', 'trackside'); page.select_option('#nt-status', 'trial')
    page.fill('#nt-owner', 'junior@test.com'); page.uncheck('text=Also add me as an owner')
    page.click('button:has-text("Create team")')
    expect(page.locator('.notice.info').first).to_contain_text('Created Speedway Juniors')
    link = page.locator('code.invite-link').inner_text(); token = link.rsplit('/', 1)[1]
    jr = api(f'/invites/{token}/accept', body={'name': 'Junior Owner', 'password': 'password3'}, method='POST')
    JT = jr['token']; JTID = jr['memberships'][0]['tenant_id']
    assert jr['memberships'][0]['plan'] == 'trackside' and jr['memberships'][0]['licence'] == 'trial'
    assert 'engines' not in jr['memberships'][0]['entitlements']
    # seat limit 2 (plan default): owner + 1 pending invite is full
    roles = api(f'/t/{JTID}/roles', JT); mech = next(r for r in roles if r['name'] == 'Mechanic')['id']
    api(f'/t/{JTID}/invites', JT, 'POST', {'email': 'a@test.com', 'role_id': mech})
    full = api(f'/t/{JTID}/invites', JT, 'POST', {'email': 'b@test.com', 'role_id': mech}, ok=False)
    assert full['status'] == 409 and 'seats' in full['error'], full
    print('seat limit:', full['error'])
    # pool for Trackside is 1 -> overview shows it fully used
    page.goto(B + '/admin'); expect(page.locator('tr:has-text("Trackside") .pool')).to_contain_text('1 of 1 licences')
    shot(page, 'p6-01-overview')

    # ---- licence: give Burlace a feature override and an end date in the past -> read-only ----
    page.goto(B + '/admin/teams'); page.click('.team-row button.list-row:has-text("Burlace Racing")')
    ed = page.locator('.team-editor')
    ed.locator('input[aria-label="Shock & bar dyno"]').uncheck()
    expect(ed.locator('label.overridden')).to_have_count(1)
    ed.locator('input[type=date]').fill((date.today() - timedelta(days=1)).isoformat())
    ed.locator('input[id^="tseat-"]').fill('5')
    shot(page, 'p6-03-team-editor')
    ed.locator('button:has-text("Save licence")').click()
    expect(ed.locator('.notice.info')).to_contain_text('Saved')
    expect(page.locator('.team-row:has-text("Burlace Racing") .pill-over')).to_contain_text('Expired')

    crew = api('/auth/login', body={'email': 'crew@test.com', 'password': 'password2'}, method='POST')
    m = crew['memberships'][0]
    assert m['licence'] == 'expired' and 'dyno' not in m['entitlements'] and m['seat_limit'] == 5, m
    push = api(f'/t/{TID}/sync', crew['token'], 'POST', {'changes': []}, ok=False)
    assert push.get('status') == 403 and 'read-only' in push['error'], push
    c2 = br.new_context(viewport={'width': 1366, 'height': 900})
    cp = open_as(c2, crew)
    expect(cp.locator('.banner-critical')).to_contain_text('read-only')
    expect(cp.locator('.nav-link:has-text("Shock & bar dyno")')).to_have_count(0)
    expect(cp.locator('.nav-area:has-text("Platform admin")')).to_have_count(0)
    cp.goto(B + '/admin/teams'); expect(cp.locator('h1')).to_have_text('Not permitted')
    assert api('/admin/tenants', crew['token'], ok=False)['status'] == 403
    shot(cp, 'p6-10-crew-readonly', full=False)
    # renew
    api(f'/admin/tenants/{TID}', OT, 'PATCH', {'licence_expires': None, 'features': {}, 'seats': None})

    # ---- suspend the juniors -> their owner is locked out ----
    api(f'/admin/tenants/{JTID}', OT, 'PATCH', {'status': 'suspended'})
    jp = open_as(br.new_context(viewport={'width': 1366, 'height': 900}), api('/auth/login', body={'email': 'junior@test.com', 'password': 'password3'}, method='POST'))
    expect(jp.locator('h1')).to_contain_text('is suspended')
    assert api(f'/t/{JTID}/sync?since=0', JT, ok=False)['status'] == 403
    api(f'/admin/tenants/{JTID}', OT, 'PATCH', {'status': 'active'})

    # ---- users: disable / enable, reset password, make admin ----
    page.goto(B + '/admin/users'); page.fill('input[type=search]', 'crew')
    row = page.locator('.user-row:has-text("crew@test.com")')
    page.once('dialog', lambda d: d.accept())
    row.locator('button:has-text("Disable")').click()
    expect(page.locator('.user-row:has-text("crew@test.com") .pill-over')).to_have_text('Disabled')
    bad = api('/auth/login', body={'email': 'crew@test.com', 'password': 'password2'}, method='POST', ok=False)
    assert bad['status'] == 403 and 'disabled' in bad['error'], bad
    assert api('/me', crew['token'], ok=False)['status'] == 401
    page.locator('.user-row:has-text("crew@test.com") button:has-text("Enable")').click()
    expect(page.locator('.user-row:has-text("crew@test.com") .pill-over')).to_have_count(0)
    page.fill('input[type=search]', 'junior')
    page.once('dialog', lambda d: d.accept())
    page.locator('.user-row:has-text("junior@test.com") button:has-text("Reset password")').click()
    temp = page.locator('code.temp-pass').inner_text()
    assert api('/auth/login', body={'email': 'junior@test.com', 'password': temp}, method='POST')['user']['email'] == 'junior@test.com'
    shot(page, 'p6-04-users')
    me = page.locator('.user-row:has-text("owner@test.com")')
    page.fill('input[type=search]', 'owner'); expect(me.locator('button:has-text("Disable")')).to_have_count(0)

    # ---- pick-lists: add a track condition and a contact role ----
    page.goto(B + '/admin/lists')
    tc = page.locator('.card:has(.card-head:has-text("Track conditions"))').first
    tc.locator('input.le-add').fill('Blown off'); tc.locator('input.le-add').press('Enter')
    tc.locator('button:has-text("Save list")').click(); expect(tc.locator('.pill-info')).to_have_text('Customised')
    cr = page.locator('.card:has(.card-head:has-text("Contact roles"))').first
    cr.locator('input.le-add').fill('Flagman'); cr.locator('input.le-add').press('Enter'); cr.locator('button:has-text("Save list")').click()
    expect(cr.locator('.pill-info')).to_have_text('Customised')
    shot(page, 'p6-05-lists')
    me_ = api('/me', OT); assert 'Blown off' in me_['platform']['lists']['track_conditions'] and 'Flagman' in me_['platform']['lists']['contact_roles']

    # ---- settings: app name + announcement ----
    page.goto(B + '/admin/settings')
    page.fill('#s-name', 'Burlace RaceOps'); page.fill('#s-support', 'help@burlace.test')
    page.fill('#s-ann', 'Server maintenance Sunday 8pm AEST — sync may pause for 10 minutes.'); page.select_option('#s-level', 'warn')
    page.click('button:has-text("Save settings")'); expect(page.locator('.notice.info')).to_contain_text('Settings saved')
    expect(page.locator('.brand')).to_contain_text('Burlace RaceOps'); expect(page.locator('.brand-mark')).to_have_text('BR')
    expect(page.locator('.banner-warn').first).to_contain_text('Server maintenance')
    shot(page, 'p6-06-settings')

    # lists applied on forms (after the session refresh that saving triggered)
    page.goto(B + '/setups'); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    try:
        expect(page.locator('a:has-text("Heat 1")').first).to_be_visible(timeout=60000)
    except Exception:
        page.screenshot(path=f'{OUT}/FAIL-setups.png', full_page=True); open(f'{OUT}/FAIL-url.txt','w').write(page.url + '\n' + page.inner_text('body')[:3000]); raise
    page.click('a:has-text("Heat 1") >> nth=0')
    expect(page.locator('.field:has(#f-track_conditions) .quick-tags')).to_be_visible()
    more = page.locator('.field:has(#f-track_conditions) button:has-text("more…")')
    if more.count(): more.click()
    expect(page.locator('.field:has(#f-track_conditions) .quick-tags')).to_contain_text('Blown off')
    page.goto(B + '/r/contact_link/new'); expect(page.locator('#f-role option:text-is("Flagman")')).to_have_count(1)

    # crew sees the announcement and can dismiss it
    crew = api('/auth/login', body={'email': 'crew@test.com', 'password': 'password2'}, method='POST')
    cp = open_as(br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True), crew)
    expect(cp.locator('.banner-warn')).to_contain_text('Server maintenance')
    shot(cp, 'p6-11-mobile-banner', full=False)
    cp.click('.banner-x'); expect(cp.locator('.banner-warn')).to_have_count(0)

    # ---- directory + system ----
    page.goto(B + '/admin/directory'); expect(page.locator('tr:has-text("Australia")')).to_be_visible()
    with page.expect_download() as dl:
        page.click('button:has-text("Download all tracks")')
    data = json.load(open(dl.value.path())); assert len(data['tracks']) == 705
    shot(page, 'p6-07-directory')
    page.goto(B + '/admin/system'); expect(page.locator('.activity .list-row').first).to_be_visible()
    acts = page.locator('.activity .row-title').all_inner_texts()
    print('activity:', acts[:8])
    assert any('Created team' in a for a in acts) and any('Edited pick-list' in a for a in acts)
    shot(page, 'p6-08-system')

    # clean up: reset name/announcement and lists so other suites are unaffected
    api('/admin/settings/general', OT, 'PUT', {'app_name': 'RaceOps', 'announcement': {'text': '', 'level': 'info'}})
    for k in ['track_conditions', 'contact_roles']: api(f'/admin/settings/lists/{k}', OT, 'PUT', {'reset': True})

    # mobile admin
    mp = open_as(br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True), owner)
    mp.goto(B + '/admin'); mp.wait_for_timeout(1500); shot(mp, 'p6-12-mobile-overview')
    mp.goto(B + '/admin/teams?team=' + JTID); mp.wait_for_timeout(1500); shot(mp, 'p6-13-mobile-team', full=False)
    br.close()

print('errors:', errors[:10])
print('OK')
