# API responses are never cached; a device that can't sync while the server answers shows "Can't sync" and
# Repair this device fixes it (keeping the sign-in), and does nothing when the server can't be reached.
import json, sys, os, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
errors = []

def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, dict(r.headers), json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read() or b'{}')
hdr = lambda h, k: next((v for n, v in h.items() if n.lower() == k), None)

# ---- API: no-store everywhere, and the clear-cache endpoint
st, h, _ = call('/health')
assert st == 200 and hdr(h, 'cache-control') == 'no-store', h
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[2]; OT = o['token']
TID = o['memberships'][0]['tenant_id']
st, h, _ = call(f'/t/{TID}/sync?since=0', OT)
assert st == 200 and hdr(h, 'cache-control') == 'no-store', h
st, h, _ = call(f'/t/{TID}/sync?since=0')            # errors too
assert st == 401 and hdr(h, 'cache-control') == 'no-store', (st, h)
st, h, b = call('/device/clear-cache', method='POST')
assert st == 200 and b == {'ok': True} and hdr(h, 'clear-site-data') == '"cache"', (st, h, b)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    # service workers blocked so page.route sees the app's API requests
    ctx = br.new_context(viewport={'width': 1366, 'height': 900}, service_workers='block')
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    s = {'token': OT, 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('.sync-badge:has-text("Synced")')).to_be_visible(timeout=30000)
    shot = lambda n: page.screenshot(path=f'{OUT}/{n}.png', full_page=True)

    # ---- sync fails with no answer, but the server's health check answers: "Can't sync"
    page.route('**/api/t/*/sync*', lambda r: r.abort())
    badge = page.locator('.sync-badge')
    badge.click(); expect(badge).to_contain_text('Offline', timeout=10000)
    badge.click(); expect(badge).to_contain_text('Can’t sync', timeout=10000)
    assert 'Repair this device' in (badge.get_attribute('title') or '')
    shot('01-cant-sync-badge')
    badge.click()                                        # takes you to Profile & device
    expect(page).to_have_url(f'{B}/profile')
    expect(page.locator('.notice:has-text("still can\'t sync")')).to_be_visible()
    repair = page.locator('button:has-text("Repair this device")')
    expect(repair).to_have_class('btn primary')
    shot('02-profile-repair')

    # ---- repair with the server unreachable: nothing changes, no reload
    page.route('**/api/device/clear-cache', lambda r: r.abort())
    page.evaluate("window.__notReloaded = true")
    page.once('dialog', lambda d: d.accept())
    repair.click()
    expect(page.locator('.notice.info:has-text("Can\'t reach the server")')).to_be_visible(timeout=10000)
    assert page.evaluate("window.__notReloaded === true"), 'page reloaded although the server could not be reached'
    page.unroute('**/api/device/clear-cache')

    # ---- repair with the server back: clears, reloads, still signed in, syncs again
    page.unroute('**/api/t/*/sync*')
    cleared = []
    page.on('response', lambda r: r.url.endswith('/api/device/clear-cache') and cleared.append(r.status))  # the header is checked above
    page.evaluate("caches.open('raceops-test').then((c) => c.put('/probe', new Response('x')))")
    page.once('dialog', lambda d: d.accept())
    with page.expect_navigation():
        repair.click()
    assert cleared == [200], cleared
    expect(page).to_have_url(f'{B}/profile')
    expect(page.locator('.sync-badge:has-text("Synced")')).to_be_visible(timeout=30000)
    assert page.evaluate("caches.keys().then((k) => !k.includes('raceops-test'))"), 'Cache Storage not cleared'
    assert page.evaluate("JSON.parse(localStorage.getItem('raceops.session')).token") == OT, 'session lost'
    expect(page.locator('.notice:has-text("still can\'t sync")')).to_have_count(0)
    shot('03-repaired')
    br.close()

assert not errors, errors
print('e2e33 device repair OK')
