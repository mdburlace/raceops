import base64, json, os, sys, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')


def open_sec(page, sid='session'):
    page.wait_for_selector(f'#sec-{sid}', timeout=15000)
    t = page.locator(f'#sec-{sid} .sec-toggle[aria-expanded="false"]')
    if t.count(): t.click()

def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def shot(page, name, full=True):
    page.wait_for_timeout(400)
    page.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def save(page):
    page.get_by_role('button', name='Save', exact=True).click()
    page.wait_for_timeout(600)

# sample "photo" and "printout" files
png = os.path.join(HERE, 'ai-sheet.png'); pdf = os.path.join(HERE, 'ai-printout.pdf')

st, o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})
OT, TID = o['token'], o['memberships'][0]['tenant_id']
call(f'/admin/tenants/{TID}', OT, 'PATCH', {'plan': 'pro', 'features': {}, 'ai_budget_usd': None})
assert call(f'/t/{TID}/ai/status', OT)[1]['reason'] == 'AI is turned off for this server.'
st, b = call(f'/t/{TID}/ai/ask', OT, 'POST', {'question': 'hi'}); assert st == 403, (st, b)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_context(viewport={'width': 1366, 'height': 900}).new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- platform admin: plan add-on, AI settings, connection test ----
    page.goto(B + '/admin/plans')
    expect(page.locator('input[aria-label="Pro — everything: AI assistant"]')).to_be_checked()
    page.goto(B + '/admin/ai')
    expect(page.locator('.admin-stat:has-text("Status") b')).to_have_text('Off')
    page.check('text=Turn on the AI assistant')
    page.select_option('#ai-model_smart', 'claude-opus-5-5')
    page.fill('#ai-month', '5')
    page.click('button:has-text("Save AI settings")')
    expect(page.locator('.notice.info').first).to_contain_text('AI settings saved')
    expect(page.locator('.admin-stat:has-text("Status") b')).to_have_text('On')
    page.click('button:has-text("Test connection")')
    expect(page.locator('.notice:has-text("Connected to claude-haiku-5-5")')).to_be_visible()
    s = call('/admin/ai', OT)[1]['settings']; assert s['enabled'] and s['model_smart'] == 'claude-opus-5-5' and s['monthly_usd'] == 5, s

    # ---- fill a setup sheet from a photo, with review ----
    page.goto(B + '/setups'); page.click('a:has-text("Heat 1") >> nth=0')
    expect(page.locator('.ai-bar')).to_be_visible()
    before = page.input_value('#f-session')
    page.set_input_files('input[aria-label="Photos to read"]', png)
    rv = page.locator('.ai-review')
    expect(rv).to_contain_text('Read from your photo')
    expect(rv.locator('.ai-item:has-text("Ride height")')).to_contain_text('LF 4.5')
    rv.locator('input[aria-label="Use Session"]').uncheck()          # keep the session name as it is
    shot(page, 'p9-01-photo-review', full=False)
    rv.locator('button:has-text("Apply")').click()
    expect(page.locator('#f-temp')).to_have_value('24')
    expect(page.locator('#f-ride_height-LF')).to_have_value('4.5')
    assert page.input_value('#f-session') == before

    # ---- voice debrief (typed transcript) ----
    page.click('button:has-text("Voice debrief")')
    page.fill('textarea[aria-label="Debrief"]', 'Track went slick and rubbered up, car was loose exit with no drive off and a bit of chatter. Try a softer RR bar next time.')
    page.click('button:has-text("Fill feedback")')
    rv = page.locator('.ai-review')
    expect(rv).to_contain_text('From the debrief')
    expect(rv.locator('.ai-item:has-text("Driver — car behaviour")')).to_contain_text('Loose exit')
    shot(page, 'p9-02-debrief-review', full=False)
    rv.locator('button:has-text("Apply")').click()
    expect(page.locator('.field:has(#f-driver_feel) .chip.active:has-text("Loose exit")')).to_be_visible()
    expect(page.locator('.field:has(#f-driver_feel) .chip.active:has-text("Chatter on entry")')).to_be_visible()
    expect(page.locator('#f-changes_next')).to_have_value('Try a softer RR bar next time.')
    assert 'loose exit' in page.input_value('#f-driver_comments').lower()
    save(page)

    # ---- dyno printout (PDF) → settings sweep ----
    page.goto(B + '/workshop/dyno'); page.click('a:has-text("New shock run")')
    page.select_option('#f-adjust_type', 'Single adjustable')
    page.set_input_files('input[aria-label="Photos to read"]', pdf)
    rv = page.locator('.ai-review')
    expect(rv.locator('.ai-item:has-text("2 settings")')).to_be_visible()
    rv.locator('button:has-text("Apply")').click()
    expect(page.locator('.sweep-item')).to_have_count(2)
    page.fill('#f-label', 'AI read printout'); save(page)

    # ---- Ask RaceOps ----
    page.goto(B + '/ask')
    expect(page.locator('.ask-empty')).to_be_visible()
    page.click('.ask-suggest button:has-text("slick")')
    ans = page.locator('.msg.assistant').last
    expect(ans).to_contain_text('Found')
    expect(ans.locator('a.cite')).to_have_count(1)
    page.fill('textarea[aria-label="Question"]', 'And when the track was tacky?'); page.keyboard.press('Enter')
    expect(page.locator('.msg.assistant')).to_have_count(2)
    shot(page, 'p9-03-ask')
    page.locator('.msg.assistant').first.locator('a.cite').click()
    page.wait_for_url('**/r/setup/**')

    # ---- usage shows up; team switch and allowance ----
    page.goto(B + '/admin/ai')
    expect(page.locator('tr:has-text("Burlace Racing") td.num').first).not_to_have_text('0')
    expect(page.locator('.activity .row-title:has-text("Ask RaceOps")').first).to_be_visible()
    shot(page, 'p9-04-admin-ai')
    page.goto(B + '/team/members')
    sec = page.locator('.card:has(.card-head:has-text("AI assistant"))')
    expect(sec).to_contain_text('of US$5.00 allowance')
    sec.locator('button:has-text("Turn AI off for this team")').click()
    expect(sec).to_contain_text('Off for this team')
    assert call(f'/t/{TID}/ai/status', OT)[1]['reason'] == 'AI is turned off for this team.'
    page.goto(B + '/setups'); page.click('a:has-text("Heat 1") >> nth=0')
    expect(page.locator('.ai-bar')).to_contain_text('AI is turned off for this team.')
    page.goto(B + '/team/members'); page.click('button:has-text("Turn AI on for this team")')
    expect(sec).to_contain_text('On')
    call(f'/admin/tenants/{TID}', OT, 'PATCH', {'ai_budget_usd': 0})
    assert 'allowance' in call(f'/t/{TID}/ai/status', OT)[1]['reason']
    call(f'/admin/tenants/{TID}', OT, 'PATCH', {'ai_budget_usd': None})

    # ---- a crew member (Mechanic role) gets AI too; a role without it doesn't ----
    st, crew = call('/auth/login', method='POST', body={'email': 'crew@test.com', 'password': 'password2'})
    assert call(f'/t/{TID}/ai/status', crew['token'])[1]['available']
    roles = call(f'/t/{TID}/roles', OT)[1]; mech = next(r for r in roles if r['name'] == 'Mechanic')
    call(f'/t/{TID}/roles/{mech["id"]}', OT, 'PATCH', {'permissions': [p for p in mech['permissions'] if p != 'ai.view']})
    st, b = call(f'/t/{TID}/ai/ask', crew['token'], 'POST', {'question': 'hi'}); assert st == 403 and 'role' in b['error'], (st, b)
    call(f'/t/{TID}/roles/{mech["id"]}', OT, 'PATCH', {'permissions': mech['permissions']})

    # mobile
    mp = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    mp.on('pageerror', lambda e: errors.append(str(e)))
    mp.goto(B); mp.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    mp.goto(B + '/ask'); expect(mp.locator('text=Synced')).to_be_visible(timeout=30000)
    mp.wait_for_timeout(600); shot(mp, 'p9-10-mobile-ask', full=False)
    w = mp.evaluate('document.documentElement.scrollWidth'); assert w <= 391, w
    mp.goto(B + '/setups'); mp.click('a:has-text("Heat 1") >> nth=0'); mp.click('button:has-text("Voice debrief")')
    mp.fill('textarea[aria-label="Debrief"]', 'Track was tacky early, car tight entry. Try more stagger.'); mp.locator('button:has-text("Fill feedback")').evaluate("e => e.scrollIntoView({block: 'center'})"); mp.click('button:has-text("Fill feedback")')
    expect(mp.locator('.ai-review')).to_be_visible(); mp.locator('.ai-review').scroll_into_view_if_needed(); shot(mp, 'p9-11-mobile-debrief', full=False)
    br.close()

# turn AI back off so other suites see the default
call('/admin/ai', OT, 'PUT', {'enabled': False, 'model_smart': 'claude-sonnet-5-5', 'monthly_usd': 10})
print('errors:', errors[:10])
print('OK')
