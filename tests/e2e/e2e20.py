import json, sys, os, uuid, urllib.request, urllib.error
from datetime import datetime, timezone
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
now = datetime.now(timezone.utc).isoformat()
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]; OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Class Team', 'plan': 'pro'}); TID = t['id']
st, r = call(f'/t/{TID}', OT, 'PATCH', {'settings': {'classes': ['Club Wingless', '410 Sprintcars']}}); assert st == 200, r
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
old = {'id': str(uuid.uuid4()), 'type': 'car', 'data': {'values': {'name': 'Old car', 'number': '1', 'class': '410 Winged Sprint'}}, 'client_updated_at': now}
call(f'/t/{TID}/sync', OT, 'POST', {'changes': [old]})
with sync_playwright() as pw:
    br = pw.chromium.launch(); page = br.new_page(viewport={'width': 1280, 'height': 860})
    page.on('pageerror', lambda e: errors.append(str(e)))
    sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    page.goto(B + '/r/car/new'); expect(page.locator('#f-class')).to_be_visible()
    opts = page.evaluate("[...document.querySelectorAll('#dl-class option')].map(o => o.value)")
    assert opts[:2] == ['Club Wingless', '410 Sprintcars'], opts          # team classes first
    assert 'Late Models' in opts and '410 Winged Sprint' not in opts and opts.count('410 Sprintcars') == 1, opts
    expect(page.locator('#f-class')).to_have_attribute('placeholder', 'Choose or type a class')
    page.fill('#f-number', '9'); page.fill('#f-name', 'New car'); page.fill('#f-class', 'Club Wingless')
    page.get_by_role('button', name='Save', exact=True).click(); page.wait_for_timeout(2000)
    cars = [x for x in call(f'/t/{TID}/sync?since=0', OT)[1]['records'] if x['type'] == 'car']
    assert any(c['data']['values'].get('class') == 'Club Wingless' for c in cars), cars
    page.goto(f"{B}/r/car/{old['id']}")
    expect(page.locator('#f-class')).to_have_value('410 Winged Sprint')   # old value kept until changed
    page.fill('#f-class', 'My own class'); expect(page.locator('#f-class')).to_have_value('My own class')
    page.screenshot(path=f'{OUT}/20-01-car-class.png')
    # Tracks: classes from cars offered as quick picks
    page.goto(B + '/tracks')
    expect(page.locator('text=Classes we race')).to_be_visible()
    br.close()
assert not errors, errors
print('E2E20 OK')
