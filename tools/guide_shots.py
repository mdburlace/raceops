#!/usr/bin/env python3
"""Pictures for the user guide (docs/guide/img), taken from the running app so they always show
the current screens. Run it after a change that alters a screen the guide pictures, then commit
the images with the change.

    pip install playwright pillow && playwright install chromium
    python3 tools/guide_shots.py --url http://localhost:8080 --email admin@example.com --password '…'

Use a test server, not your live one: it signs in as a platform admin and creates a team called
"Guide demo" filled with made-up data (delete it afterwards from Platform admin → Teams).
Each picture is saved as WebP; articles show them with ![alt text](img/<name>.webp).
"""
import argparse, io, json, os, sys, uuid, urllib.request, urllib.error
from datetime import date, datetime, timedelta, timezone

from PIL import Image
from playwright.sync_api import sync_playwright, expect

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--url', default='http://localhost:8080')
ap.add_argument('--email', required=True)
ap.add_argument('--password', required=True)
ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'guide', 'img'))
ap.add_argument('--only', help='comma-separated picture names to retake')
args = ap.parse_args()
B = args.url.rstrip('/')
os.makedirs(args.out, exist_ok=True)
ONLY = set(args.only.split(',')) if args.only else None


def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


st, login = call('/auth/login', method='POST', body={'email': args.email, 'password': args.password})
if st != 200:
    sys.exit(f'Sign-in failed ({st}): {login}')
T = login['token']
st, team = call('/admin/tenants', T, 'POST', {'name': 'Guide demo', 'plan': 'pro', 'team_type': 'race'})
if st not in (200, 201):
    sys.exit(f'Could not create the demo team ({st}): {team} — the account must be a platform admin.')
TID = team['id']
login = call('/auth/login', method='POST', body={'email': args.email, 'password': args.password})[1]

now = datetime.now(timezone.utc).isoformat()
d = lambda n: (date.today() - timedelta(days=n)).isoformat()
records = call(f'/t/{TID}/sync?since=0', T)[1]['records']
form = lambda target: next(r['id'] for r in records if r['type'] == 'form' and r['data']['target'] == target)
rec = lambda type, values, **x: {'id': str(uuid.uuid4()), 'type': type, 'data': {'values': values, **x}, 'client_updated_at': now}


def push(*recs):
    res = call(f'/t/{TID}/sync', T, 'POST', {'changes': list(recs)})[1]['results']
    bad = [r for r in res if r['status'] != 'applied']
    if bad:
        sys.exit(f'Could not save demo data: {bad}')


# ---- made-up demo data ----
AF, SF = form('asset'), form('setup')
car = rec('car', {'name': 'Car 17', 'number': '17', 'class': '410 Sprint', 'rp_ratio': '4.86', 'fuel_min': '1.5'})
eng = rec('asset', {'name': '410 #3', 'category': 'Engine', 'status': 'In Service', 'life_unit': 'Laps', 'life_limit': '600'}, form_id=AF)
shocks = {c: rec('asset', {'name': f'{c} {n}', 'category': 'Shock', 'status': 'In Service', 'position': c, 'adjust_type': t, 'car': car['id']}, form_id=AF)
          for c, n, t in [('LF', 'Penske 7500', 'Two-way'), ('RF', 'Penske 7500', 'Two-way'), ('LR', 'QA1 fixed', 'Non-adjustable'), ('RR', 'Penske 8760', 'Three-way')]}
spare = rec('asset', {'name': 'Spare Penske', 'category': 'Shock', 'status': 'In Service', 'adjust_type': 'Two-way'}, form_id=AF)
ev_old = rec('event', {'name': 'Valley Speedway — June', 'date': d(120), 'track': 'Valley Speedway', 'car': car['id']})
ev = rec('event', {'name': 'Valley Speedway — Club night', 'date': d(0), 'track': 'Valley Speedway', 'car': car['id']})
S = lambda **v: {'car': car['id'], 'engine': {'asset': eng['id']}, 'shocks': {c: {'asset': s['id']} for c, s in shocks.items()}, **v}
old = rec('setup', S(event=ev_old['id'], session='Feature', laps='30', fuel_start='9', fuel_finish='2.7', finish='3'), form_id=SF)
heat = rec('setup', S(event=ev['id'], session='Heat 1', order=10, laps='10', fuel_start='5', fuel_finish='3', finish='2', temp='68', baro='29.82'), form_id=SF)
feat = rec('setup', S(event=ev['id'], session='Feature', order=20, planned_laps='30', temp='64', baro='29.85',
                      shock_adjust={'LF': 'Comp 4 · Reb 6', 'RF': 'Comp 6 · Reb 8', 'RR': 'LS comp 3 · HS comp 2 · Reb 9'},
                      bump_type={'LF': 'Penske', 'RF': 'Penske'}, bump_spec={'LF': '70A', 'RF': '80A'}, bump_height={'LF': '1.25', 'RF': '1.25'},
                      bump_packers={'LF': '1', 'RF': '2'}, bump_gap={'LF': '0.75', 'RF': '0.6'}), form_id=SF)
push(car, eng, *shocks.values(), spare, ev_old, ev, old, heat, feat)

SHOTS = []
shot = lambda name: (ONLY is None or name in ONLY) and SHOTS.append(name) is None


def save(name, png):
    im = Image.open(io.BytesIO(png))
    im.save(os.path.join(args.out, f'{name}.webp'), 'WEBP', quality=82, method=6)
    print(f'  {name}.webp  {im.width}×{im.height}')


with sync_playwright() as pw:
    br = pw.chromium.launch()
    sess = {'token': login['token'], 'user': login['user'], 'memberships': login['memberships'], 'platform': login.get('platform'), 'tenantId': TID}

    def page_for(w, h, mobile=False):
        p = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile,
                           color_scheme='light').new_page()
        p.goto(B)
        p.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
        p.goto(B)
        expect(p.locator('text=Synced')).to_be_visible(timeout=30000)
        # the AI bar says why AI is off on a test server; keep that out of the pictures
        p.add_init_script("addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.ai-bar .muted.small { display: none !important; }'; document.head.append(s); });")
        return p

    page = page_for(1280, 820)
    settle = lambda p: p.wait_for_timeout(600)

    if shot('home-checklist'):
        page.goto(B + '/'); settle(page)
        save('home-checklist', page.locator('[data-testid="setup-checklist"]').screenshot())
    if shot('help-home'):
        page.goto(B + '/help'); settle(page)
        save('help-home', page.screenshot())
    want = [shot('setup-shocks'), shot('fuel-planner')]
    if any(want):
        page.goto(f"{B}/r/setup/{feat['id']}"); settle(page)
        # close-ups of one section: let the sticky title and save bar scroll away so they don't cover it
        page.add_style_tag(content='.page-head, .save-bar, .topbar { position: static !important; }')
        if 'setup-shocks' in SHOTS:
            sec = page.locator('section.form-section:has(h3:text-is("Shocks"))')
            sec.scroll_into_view_if_needed(); settle(page)
            save('setup-shocks', sec.screenshot())
        if 'fuel-planner' in SHOTS:
            sec = page.locator('section.form-section:has([data-testid="fuel-planner"])')
            sec.scroll_into_view_if_needed(); settle(page)
            save('fuel-planner', sec.screenshot())
    if shot('event-sessions'):
        page.goto(f"{B}/events/{ev['id']}"); settle(page)
        save('event-sessions', page.screenshot())
    if shot('calculators'):
        page.goto(B + '/calculators'); settle(page)
        save('calculators', page.screenshot())
    if shot('mobile-setup'):
        m = page_for(390, 844, mobile=True)
        m.goto(f"{B}/r/setup/{feat['id']}"); settle(m)
        save('mobile-setup', m.screenshot())
    br.close()

print(f'Saved {len(SHOTS)} pictures to {os.path.relpath(args.out)}. Remember to delete the "Guide demo" team on that server.')
