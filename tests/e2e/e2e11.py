import os
import json, sys, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []

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

st, o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})
OT, TID = o['token'], o['memberships'][0]['tenant_id']
# start clean
call('/me', OT, 'PATCH', {'prefs': {'theme': 'system', 'custom_themes': [], 'nav_collapsed': []}})

# ---- server validation ----
st, r = call('/me', OT, 'PATCH', {'prefs': {'theme': 'BAD THEME!', 'nav_collapsed': ['track', 'track', '<x>'], 'junk': 1,
                                              'custom_themes': [{'id': 'c-good1', 'name': 'Ok', 'base': 'dark', 'colors': {'bg': '#000000', 'surface': '#111111', 'ink': '#FFFFFF', 'accent': '#ff0000', 'side': '#000000'}},
                                                                {'id': 'c-bad1', 'name': 'Bad', 'colors': {'bg': 'red'}}]}})
assert st == 200, r
p = r['prefs']
assert p['theme'] == 'system' and p['nav_collapsed'] == ['track'] and 'junk' not in p, p
assert [t['id'] for t in p['custom_themes']] == ['c-good1'] and p['custom_themes'][0]['colors']['ink'] == '#ffffff', p
assert call('/me', OT)[1]['user']['prefs']['nav_collapsed'] == ['track']
call('/me', OT, 'PATCH', {'prefs': {'theme': 'system', 'custom_themes': [], 'nav_collapsed': []}})

def wait_css(page, var, val):
    page.wait_for_function(f"getComputedStyle(document.documentElement).getPropertyValue('--{var}').trim() === '{val}'", timeout=5000)

def css(page, var):
    return page.evaluate(f"getComputedStyle(document.documentElement).getPropertyValue('--{var}').trim()")

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    assert css(page, 'accent') == '#e2561a', css(page, 'accent')

    # ---- collapsible sidebar sections ----
    side = page.locator('aside.sidebar')
    expect(side.locator('a.nav-link:has-text("Setup sheets")')).to_be_visible()
    side.locator('button[aria-label="Collapse At the Track"]').click()
    expect(side.locator('a.nav-link:has-text("Setup sheets")')).to_have_count(0)
    expect(side.locator('button[aria-label="Expand At the Track"]')).to_have_attribute('aria-expanded', 'false')
    expect(side.locator('a.nav-area:has-text("At the Track")')).to_be_visible()   # heading still there
    page.goto(B + '/events')                                                       # in a collapsed section: dot shows
    expect(side.locator('.nav-group.collapsed .nav-dot')).to_be_visible()
    side.locator('button[aria-label="Collapse In the Workshop"]').click()
    expect(side.locator('a.nav-link:has-text("Assets")')).to_have_count(0)
    shot(page, 'p11-01-collapsed', full=False)
    page.wait_for_timeout(800)
    assert sorted(call('/me', OT)[1]['user']['prefs']['nav_collapsed']) == ['track', 'workshop']
    page.reload(); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    expect(side.locator('a.nav-link:has-text("Assets")')).to_have_count(0)        # remembered
    side.locator('button[aria-label="Expand At the Track"]').click()
    expect(side.locator('a.nav-link:has-text("Setup sheets")')).to_be_visible()
    page.keyboard.press('Tab')  # focusable toggles (no assertion; just make sure no errors)

    # ---- themes ----
    page.goto(B + '/profile')
    ap = page.locator('section.appearance')
    expect(ap.locator('.theme-pick[aria-pressed="true"]')).to_contain_text('Match this device')
    ap.locator('.theme-pick:has-text("Midnight")').click()
    expect(ap.locator('.theme-pick[aria-pressed="true"]')).to_contain_text('Midnight')
    assert css(page, 'accent') == '#22c3d6' and css(page, 'bg') == '#0b1220', (css(page, 'accent'), css(page, 'bg'))
    assert page.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(11, 18, 32)'
    shot(page, 'p11-02-midnight')
    ap.locator('.theme-pick:has-text("Sunlight")').click()
    assert css(page, 'ink') == '#000000'

    # sidebar section checkboxes
    ap.locator('label.check-row:has-text("In the Workshop") input').check()
    expect(side.locator('a.nav-link:has-text("Assets")')).to_be_visible()
    ap.locator('button:has-text("Collapse all")').click()
    expect(side.locator('.nav-group:not(.collapsed)')).to_have_count(0)
    ap.locator('button:has-text("Expand all")').click()
    expect(side.locator('.nav-group.collapsed')).to_have_count(0)

    # custom theme: live preview, contrast warning, cancel restores
    ap.locator('button:has-text("Create a custom theme")').click()
    ed = page.locator('.theme-editor')
    expect(ed).to_be_visible()
    ed.locator('#th-accent').fill('#ffff00')                      # yellow on white: poor contrast
    wait_css(page, 'accent', '#ffff00')                            # previewing
    expect(ed.locator('.notice')).to_contain_text('Accent on cards')
    ed.locator('button:has-text("Cancel")').click()
    expect(ed).to_have_count(0)
    assert css(page, 'ink') == '#000000' and css(page, 'accent') == '#b83a0b'   # back to Sunlight

    ap.locator('button:has-text("Create a custom theme")').click()
    ed.locator('#th-name').fill('Team colours')
    ed.locator('button:has-text("Dark")').click()
    for k, v in {'bg': '#0d1b2a', 'surface': '#1b263b', 'ink': '#e0e1dd', 'accent': '#ffb703', 'side': '#0b132b'}.items():
        ed.locator(f'#th-{k}').fill(v)
    ed.locator('#th-side').fill('#zz')                                        # invalid hex blocks saving
    expect(ed.locator('button:has-text("Save theme")')).to_be_disabled()
    ed.locator('#th-side').fill('#0b132b')
    expect(ed.locator('.ok-text')).to_contain_text('Contrast looks good')
    shot(page, 'p11-03-editor')
    ed.locator('button:has-text("Save theme")').click()
    expect(ap.locator('.theme-pick[aria-pressed="true"]')).to_contain_text('Team colours')
    assert css(page, 'accent') == '#ffb703' and css(page, 'accent-ink') == '#15110e', css(page, 'accent-ink')
    page.wait_for_timeout(800)
    sp = call('/me', OT)[1]['user']['prefs']
    assert sp['theme'].startswith('c-') and sp['custom_themes'][0]['name'] == 'Team colours', sp

    # edit it
    card = ap.locator('.theme-card:has-text("Team colours")')
    card.locator('button:has-text("Edit")').click()
    ed.locator('#th-name').fill('Team colours 2026')
    ed.locator('button:has-text("Save theme")').click()
    expect(ap.locator('.theme-card:has-text("Team colours 2026")')).to_be_visible()
    shot(page, 'p11-04-profile')

    # follows the user to another device, and paints before sign-in data loads (cached)
    ctx2 = br.new_context(viewport={'width': 390, 'height': 844})
    m = ctx2.new_page()
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    m.goto(B); expect(m.locator('text=Synced')).to_be_visible(timeout=30000)
    m.wait_for_timeout(500)
    assert css(m, 'accent') == '#ffb703', css(m, 'accent')
    m.reload()
    assert m.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()") == '#ffb703'
    m.click('button[aria-label="Menu"]')
    m.locator('aside button[aria-label="Collapse Team Management"]').click()
    expect(m.locator('aside a.nav-link:has-text("Members & invites")')).to_have_count(0)
    shot(m, 'p11-05-mobile-drawer', full=False)
    m.mouse.click(380, 400)
    m.goto(B + '/profile'); m.wait_for_timeout(500)
    w = m.evaluate('document.documentElement.scrollWidth'); assert w <= 391, w
    m.locator('section.appearance').scroll_into_view_if_needed(); shot(m, 'p11-06-mobile-profile')

    # offline change is kept and sent when back online
    ctx.set_offline(True)
    ap.locator('.theme-pick:has-text("Racing green")').click()
    assert css(page, 'accent') == '#1e6b45'
    page.wait_for_timeout(500)
    assert call('/me', OT)[1]['user']['prefs']['theme'] != 'racing-green'
    ctx.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    page.wait_for_timeout(1500)
    assert call('/me', OT)[1]['user']['prefs']['theme'] == 'racing-green'

    # delete the custom theme
    page.once('dialog', lambda d: d.accept())
    ap.locator('.theme-card:has-text("Team colours 2026") button:has-text("Delete")').click()
    expect(ap.locator('.theme-card:has-text("Team colours")')).to_have_count(0)

    # back to the default for the other suites
    ap.locator('.theme-pick:has-text("Match this device")').click()
    ap.locator('button:has-text("Expand all")').click()
    page.wait_for_timeout(800)
    assert css(page, 'accent') == '#e2561a'
    br.close()

p = call('/me', OT)[1]['user']['prefs']
assert p['theme'] == 'system' and p['custom_themes'] == [] and p['nav_collapsed'] == [], p
errs = [e for e in errors if 'favicon' not in e]
print('errors:', errs)
assert not errs
print('E2E11 OK')
