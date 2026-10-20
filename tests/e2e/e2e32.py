# Event lists show the round and track first; the calendar date form has Save and Cancel at the top.
import json, sys, os, uuid, urllib.request, urllib.error
from datetime import datetime, timezone, date, timedelta
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
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}
d = lambda n: (date.today() + timedelta(days=n)).isoformat()
def push(tok, tid, *recs):
    r = call(f'/t/{tid}/sync', tok, 'POST', {'changes': list(recs)})[1]['results']
    assert all(x['status'] == 'applied' for x in r), r

o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]; OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Rounds Display', 'plan': 'pro'}); TID = t['id']
call(f'/admin/tenants/{TID}/join', OT, 'POST', {})
o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]; OT = o['token']
assert any(m['tenant_id'] == TID for m in o['memberships']), 'admin joined the team'
recs = call(f'/t/{TID}/sync?since=0', OT)[1]['records']
form = lambda target: next(r['id'] for r in recs if r['type'] == 'form' and r['data']['target'] == target)
TF, SF, FF = form('track'), form('series'), form('fixture')
track = rec('track', {'name': 'Rounds Park Speedway', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TF)
ser = rec('series', {'name': 'Rounds Display Series', 'season': str(date.today().year)}, form_id=SF)
car = rec('car', {'name': 'Display car', 'number': '32'})
ev = rec('event', {'name': 'Spring night', 'date': d(10), 'venue': track['id'], 'series': ser['id'], 'round': '4', 'car': car['id'], 'intent': 'Planned'})
push(OT, TID, track, ser, car, ev)
gfx = rec('fixture', {'name': 'Display Rd 2', 'date': d(20), 'venue': track['id'], 'round': '2', 'status': 'Scheduled'}, form_id=FF, scope='global')
push(OT, TID, gfx)

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    s = {'token': OT, 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # ---- event lists: round and track first
    page.goto(B + '/events')
    row = page.locator('a.list-row:has-text("Spring night")')
    expect(row.locator('.row-sub')).to_contain_text('Rd 4 · Rounds Park Speedway · Rounds Display Series')
    page.goto(B + '/track')
    expect(page.locator('.next-event')).to_contain_text('Rd 4 · Rounds Park Speedway')
    page.goto(B + '/calendar')
    expect(page.locator('.list-row:has-text("Spring night") .row-sub')).to_contain_text('Rd 4 · Rounds Park Speedway')
    page.goto(f"{B}/tracks/{track['id']}")
    expect(page.locator('.list-row:has-text("Spring night")')).to_contain_text('Rd 4')
    shot = lambda n: page.screenshot(path=f'{OUT}/{n}.png', full_page=True)

    # ---- the calendar date form: Save and Cancel above the fields
    page.goto(B + '/calendar?tab=shared&show=all')
    r = page.locator('.list-row:has-text("Display Rd 2")')
    expect(r.locator('.row-sub')).to_contain_text('Rd 2 · Rounds Park Speedway')
    r.locator('button:has-text("Edit")').click()
    ed = page.locator('[data-testid="fx-editor"]')
    head = ed.locator('.fx-editor-head')
    expect(head).to_contain_text('Edit calendar date')
    expect(head.locator('button:has-text("Save")')).to_be_visible()
    expect(head.locator('button:has-text("Cancel")')).to_be_visible()
    save_y = head.locator('button:has-text("Save")').bounding_box()['y']
    first_field_y = ed.locator('.field').first.bounding_box()['y']
    assert save_y < first_field_y, (save_y, first_field_y)
    shot('32-01-editor')
    ed.locator('input#f-name').fill('Display Rd 2 (moved)')
    head.locator('button:has-text("Save")').click()
    expect(page.locator('.list-row:has-text("Display Rd 2 (moved)")')).to_be_visible(timeout=15000)
    br.close()

assert not errors, errors
print('E2E32 OK')
