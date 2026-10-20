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
def shot(page, name, full=True):
    page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
now = datetime.now(timezone.utc).isoformat()
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
login = lambda e, p: call('/auth/login', method='POST', body={'email': e, 'password': p})[1]

o = login('owner@test.com', 'password1'); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Help Team', 'plan': 'pro'}); HT = t['id']
st, shop = call('/admin/tenants', OT, 'POST', {'name': 'Help Shop', 'plan': 'engine_shop', 'team_type': 'engine_shop'}); HS = shop['id']
o = login('owner@test.com', 'password1')
roles = call(f'/t/{HT}/roles', OT)[1]
roles = roles.get('roles', roles) if isinstance(roles, dict) else roles
mech = next(r for r in roles if r['name'] == 'Mechanic')
st, inv = call(f'/t/{HT}/invites', OT, 'POST', {'email': 'mech@test.com', 'role_id': mech['id']}); assert st in (200, 201), inv
tok = inv.get('token') or inv.get('invite', {}).get('token')
st, acc = call(f'/invites/{tok}/accept', method='POST', body={'name': 'Mel Mechanic', 'password': 'password3'}); assert st == 200, acc
m = login('mech@test.com', 'password3')

def open_as(br, sess_login, tid, vp=(1366, 900), mobile=False):
    ctx = br.new_context(viewport={'width': vp[0], 'height': vp[1]}, is_mobile=mobile, has_touch=mobile)
    p = ctx.new_page()
    p.on('pageerror', lambda e: errors.append(str(e)))
    p.on('console', lambda x: x.type == 'error' and 'Failed to load resource' not in x.text and errors.append(x.text))
    sess = {'token': sess_login['token'], 'user': sess_login['user'], 'memberships': sess_login['memberships'], 'platform': sess_login.get('platform'), 'tenantId': tid}
    p.goto(B); p.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    p.goto(B); expect(p.locator('text=Synced')).to_be_visible(timeout=30000)
    return p

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = open_as(br, o, HT)
    # ---- setup checklist on Home for a new team ----
    cl = page.locator('[data-testid="setup-checklist"]')
    expect(cl).to_be_visible()
    expect(cl).to_contain_text('of 10 done')
    expect(cl.locator('li:has-text("Invite your crew")')).to_have_class('done')   # Mel accepted
    expect(cl.locator('li:has-text("Add your car")')).not_to_have_class('done')
    shot(page, '18-01-home-checklist', full=False)
    # adding a car ticks it off
    call(f'/t/{HT}/sync', OT, 'POST', {'changes': [rec('car', {'name': 'Help car', 'number': '9'})]})
    page.goto(B + '/r/car/new'); page.goto(B + '/')
    page.wait_for_timeout(1500); page.reload()
    expect(page.locator('[data-testid="setup-checklist"] li:has-text("Add your car")')).to_have_class('done', timeout=15000)
    cl.locator('a.sc-how').first.click()
    expect(page).to_have_url(f'{B}/help/team-type')
    page.goto(B + '/')
    page.locator('[data-testid="setup-checklist"] button:has-text("Hide")').click()
    expect(page.locator('[data-testid="setup-checklist"]')).to_have_count(0)
    page.wait_for_timeout(1500)
    page.reload(); page.wait_for_timeout(1500)
    expect(page.locator('[data-testid="setup-checklist"]')).to_have_count(0)  # stays hidden (saved in prefs)
    page.goto(B + '/help/getting-started')
    expect(page.locator('.help-article [data-testid="setup-checklist"]')).to_be_visible()
    page.click('button:has-text("Show the setup checklist on Home again")')
    page.goto(B + '/'); expect(page.locator('[data-testid="setup-checklist"]')).to_be_visible()

    # ---- help home: owner's guide first, sections, search ----
    page.goto(B + '/help')
    expect(page.locator('[data-testid="my-role-guide"]')).to_contain_text('Owner')
    expect(page.locator('.card:has(h3:text-is("Settings & options"))')).to_be_visible()
    expect(page.locator('a.list-row:has-text("What\'s new")')).to_be_visible()
    shot(page, '18-02-help-home', full=False)
    page.fill('input[aria-label="Search the guide"]', 'pickup fuel')
    expect(page.locator('a.list-row').first).to_contain_text('Plan fuel')
    page.locator('a.list-row').first.click()
    expect(page.locator('.page-header h1')).to_have_text('Plan fuel for a session')
    img = page.locator('.help-article img').first
    expect(img).to_be_visible()
    assert img.evaluate('i => i.complete && i.naturalWidth > 0')
    # internal links stay in the app (no reload)
    page.evaluate('window.__mark = 1')
    page.locator('.help-article a[href="/help/cars"]').first.click()
    expect(page.locator('.page-header h1')).to_contain_text('car')
    assert page.evaluate('window.__mark') == 1
    # live table: every setting
    page.goto(B + '/help/all-settings')
    expect(page.locator('.help-article table')).to_have_count(4)
    expect(page.locator('.help-article')).to_contain_text('Count our laps on the shop’s service tracker')
    page.locator('.help-article a:has-text("Count our laps")').click()
    expect(page).to_have_url(f'{B}/help/linked-engines')
    page.goto(B + '/help/roles-permissions')
    expect(page.locator('.help-article')).to_contain_text('Crew Chief')

    # ---- "?" beside page titles ----
    for path, art in [('/calculators', 'calculators'), ('/events', 'events-sessions'), ('/help', None)]:
        page.goto(B + path); page.wait_for_timeout(500)
        q = page.locator('.page-header .ph-help')
        if art is None:
            expect(q).to_have_count(0)
        else:
            q.click(); expect(page).to_have_url(f'{B}/help/{art}')
    ev = rec('event', {'name': 'Help night', 'date': date.today().isoformat(), 'track': 'X'})
    call(f'/t/{HT}/sync', OT, 'POST', {'changes': [ev]})
    page.goto(B + '/'); page.wait_for_timeout(1500); page.goto(f"{B}/r/setup/new?event={ev['id']}")
    page.locator('.page-header .ph-help').click(); expect(page).to_have_url(f'{B}/help/setup-sheets')
    expect(page.locator('a.btn:has-text("Open this page")')).to_have_count(1)

    # ---- printable guide ----
    page.goto(B + '/help'); page.click('a:has-text("Print / PDF")')
    expect(page).to_have_url(f'{B}/print/guide')
    expect(page.locator('.hp-cover')).to_contain_text('Help Team')
    expect(page.locator('.hp-toc')).to_contain_text('Your guide: Owner')
    n_mine = page.locator('.hp-article').count()
    page.locator('label:has-text("Every role") input').check()
    expect(page).to_have_url(f'{B}/print/guide?all=1')
    page.wait_for_timeout(300)
    assert page.locator('.hp-article').count() >= n_mine  # owner + platform admin already sees nearly everything
    page.emulate_media(media='print'); shot(page, '18-03-print', full=False); page.emulate_media(media='screen')
    # toc links jump within the page
    assert page.locator('.hp-article .md a[href^="/help/"]').count() == 0

    # ---- mechanic: own guide, role-filtered ----
    mp = open_as(br, m, HT)
    expect(mp.locator('[data-testid="setup-checklist"]')).to_have_count(0)   # not a team admin
    mp.goto(B + '/help')
    expect(mp.locator('[data-testid="my-role-guide"]')).to_contain_text('Mechanic')
    expect(mp.locator('a.list-row:has-text("Platform admin")')).to_have_count(0)
    expect(mp.locator('a.list-row:has-text("Roles and permissions")')).to_have_count(0)
    mp.locator('label:has-text("Show everything") input').check()
    expect(mp.locator('a.list-row:has-text("Roles and permissions")')).to_have_count(1)
    mp.goto(B + '/help/roles-permissions')
    expect(mp.locator('.notice.info')).to_contain_text('another role')
    shot(mp, '18-04-mechanic-help', full=False)
    mp.goto(B + '/print/guide'); expect(mp.locator('.hp-toc')).to_contain_text('Your guide: Mechanic')
    n_mine = mp.locator('.hp-article').count()
    mp.goto(B + '/print/guide?all=1'); mp.wait_for_timeout(300)
    assert mp.locator('.hp-article').count() > n_mine

    # ---- engine shop: race-only articles hidden even with show everything ----
    sp = open_as(br, o, HS)
    sp.goto(B + '/help')
    expect(sp.locator('[data-testid="my-role-guide"]')).to_contain_text('Owner')
    sp.locator('label:has-text("Show everything") input').check()
    expect(sp.locator('a.list-row:has-text("Plan fuel")')).to_have_count(0)
    expect(sp.locator('a.list-row:has-text("Jobs")').first).to_be_visible()
    expect(sp.locator('[data-testid="setup-checklist"]')).to_have_count(0)
    sp.goto(B + '/'); expect(sp.locator('[data-testid="setup-checklist"]')).to_contain_text('labour rate')

    # ---- mobile ----
    ph = open_as(br, o, HT, (390, 844), mobile=True)
    for path in ['/help', '/help/all-settings', '/help/role-crew-chief', '/print/guide']:
        ph.goto(B + path); ph.wait_for_timeout(800)
        assert ph.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), path
    ph.goto(B + '/help/all-settings'); shot(ph, '18-05-mobile-settings', full=False)
    br.close()

print('ERRORS:', errors) if errors else None
assert not errors, errors
print('E2E18 OK')
