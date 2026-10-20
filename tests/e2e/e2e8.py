import os
import json, sys, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect

B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]
errors = []

def call(path, token=None, method='GET', body=None, headers=None):
    h = {'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {}), **(headers or {})}
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read()), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}'), dict(e.headers)

def login(email, pw, xff=None):
    return call('/auth/login', method='POST', body={'email': email, 'password': pw}, headers={'X-Forwarded-For': xff} if xff else None)

st, owner, _ = login('owner@test.com', 'password1'); assert st == 200
OT = owner['token']

# ---- account lockout: 5 wrong passwords lock the account ----
for i in range(5):
    st, b, _ = login('owner@test.com', 'wrong', xff='198.51.100.1'); assert st == 401, (i, st, b)
st, b, h = login('owner@test.com', 'password1', xff='198.51.100.2')     # right password, other address: still locked
assert st == 429 and 'Too many sign-in attempts' in b['error'] and int(h['Retry-After']) > 800, (st, b, h)
print('account locked:', b['error'])
st, _, _ = login('crew@test.com', 'password2', xff='198.51.100.1'); assert st == 200   # other accounts unaffected
locks = call('/admin/lockouts', OT)[1]['entries']
assert any(e['key'] == 'acct:owner@test.com' and e['locked'] for e in locks), locks
assert call('/me', OT)[0] == 200                                                   # existing sessions keep working

# ---- address lockout (through the proxy header): 20 failures from one address ----
for i in range(20):
    login(f'nobody{i}@test.com', 'x', xff='203.0.113.9')
st, b, _ = login('crew@test.com', 'password2', xff='203.0.113.9'); assert st == 429, (st, b)
st, _, _ = login('crew@test.com', 'password2', xff='203.0.113.10'); assert st == 200   # a different address is fine
locks = call('/admin/lockouts', OT)[1]['entries']
assert any(e['key'] == 'ip:203.0.113.9' and e['locked'] for e in locks), locks

# ---- wrong current password when changing it counts too ----
st, crew, _ = login('crew@test.com', 'password2'); CT = crew['token']
for i in range(5):
    st, b, _ = call('/me', CT, 'PATCH', {'current_password': 'nope', 'new_password': 'whatever123'}); assert st == 400, (st, b)
st, b, _ = call('/me', CT, 'PATCH', {'current_password': 'password2', 'new_password': 'whatever123'}); assert st == 429, (st, b)
call('/admin/lockouts', OT, 'DELETE', {'key': 'acct:crew@test.com'})

with sync_playwright() as pw:
    br = pw.chromium.launch()
    # the sign-in page shows the lockout message
    lp = br.new_page(viewport={'width': 1366, 'height': 900})
    lp.on('pageerror', lambda e: errors.append(str(e)))
    lp.goto(B); lp.fill('input[type=email]', 'owner@test.com'); lp.fill('input[type=password]', 'password1'); lp.click('button:has-text("Sign in")')
    expect(lp.locator('.error-text')).to_contain_text('Too many sign-in attempts')
    lp.screenshot(path=f'{OUT}/p8-01-locked-signin.png')

    # admin unlocks from Users, then from System
    sess = {'token': OT, 'user': owner['user'], 'memberships': owner['memberships'], 'platform': owner['platform'], 'tenantId': owner['memberships'][0]['tenant_id']}
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B + '/admin/users'); page.fill('input[type=search]', 'owner')
    row = page.locator('.user-row:has-text("owner@test.com")')
    expect(row.locator('.pill-over')).to_contain_text('Sign-in locked')
    page.screenshot(path=f'{OUT}/p8-02-users-locked.png')
    row.locator('button:has-text("Unlock sign-in")').click()
    expect(row.locator('.pill-over')).to_have_count(0)
    page.goto(B + '/admin/system')
    sec = page.locator('.card:has(.card-head:has-text("Sign-in protection"))')
    expect(sec.locator('.list-row:has-text("203.0.113.9")')).to_contain_text('Locked until')
    page.screenshot(path=f'{OUT}/p8-03-system-lockouts.png', full_page=True)
    sec.locator('.list-row:has-text("203.0.113.9") button:has-text("Unlock")').click()
    expect(sec.locator('.list-row:has-text("203.0.113.9")')).to_have_count(0)
    page.select_option('select[aria-label="Activity filter"]', 'auth')
    expect(page.locator('.activity .row-title').first).to_contain_text('Unlocked sign-in')
    expect(page.locator('.activity .row-title:has-text("Sign-in locked out")')).not_to_have_count(0)

    # sign-in works again
    lp.click('button:has-text("Sign in")'); expect(lp.locator('h1')).to_contain_text("G'day")
    br.close()

st, _, _ = login('crew@test.com', 'password2', xff='203.0.113.9'); assert st == 200
print('errors:', errors[:10])
print('OK')
