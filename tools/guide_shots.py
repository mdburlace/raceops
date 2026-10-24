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
call('/me', T, 'PATCH', {'prefs': {'setup_layout': {}}})  # pictures show the standard section order
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
top_wing = rec('asset', {'name': 'Top wing — 25 sq ft', 'category': 'Wing', 'status': 'In Service', 'position': 'Top', 'car': car['id'], 'spec': '4" sideboards'}, form_id=AF)
front_wing = rec('asset', {'name': 'Front wing — 6 sq ft', 'category': 'Wing', 'status': 'In Service', 'position': 'Front', 'car': car['id']}, form_id=AF)
TIF = form('tire')
tyres = {c: rec('tire', {'name': n, 'brand': 'Hoosier', 'compound': cp, 'circumference': ci, 'position': c, 'status': 'Mounted', 'available_for': [car['id']]}, form_id=TIF)
         for c, n, cp, ci in [('LF', 'LF-04', 'Medium', '84'), ('RF', 'RF-02', 'Medium', '88'), ('LR', 'LR-07', 'Medium', '93'), ('RR', 'RR-12', 'Hard', '105.5')]}
ev_old = rec('event', {'name': 'Valley Speedway — June', 'date': d(120), 'track': 'Valley Speedway', 'car': car['id']})
ev = rec('event', {'name': 'Valley Speedway — Club night', 'date': d(0), 'track': 'Valley Speedway', 'car': car['id']})
S = lambda **v: {'car': car['id'], 'engine': {'asset': eng['id']}, 'shocks': {c: {'asset': s['id']} for c, s in shocks.items()}, **v}
old = rec('setup', S(event=ev_old['id'], session='Feature', laps='30', fuel_start='9', fuel_finish='2.7', finish='3'), form_id=SF)
heat = rec('setup', S(event=ev['id'], session='Heat 1', order=10, laps='10', fuel_start='5', fuel_finish='3', finish='2', temp='68', baro='29.82',
                      pressure_cold={'LF': '12', 'RF': '14', 'LR': '10', 'RR': '16'}, wing_angle='13', top_wing={'asset': top_wing['id']}, front_wing={'asset': front_wing['id']}, wicker='1"', front_wicker='1/2"', nose_wing='8', wing_position='2', tires={c: {'asset': t['id']} for c, t in tyres.items()}, tire_spec={'LF': 'H-12', 'RF': 'H-12', 'LR': 'Medium', 'RR': 'Hard'}, shock_adjust={'LF': 'Comp 4 · Reb 6', 'RF': 'Comp 6 · Reb 8', 'RR': 'LS comp 3 · HS comp 2 · Reb 9'}), form_id=SF)
feat = rec('setup', S(event=ev['id'], session='Feature', order=20, planned_laps='30', temp='64', baro='29.85', copied_from=heat['id'],
                      pressure_cold={'LF': '12', 'RF': '14.5', 'LR': '10', 'RR': '16.5'}, wing_angle='14', tire_spec={'LF': 'H-12', 'RF': 'H-12', 'LR': 'Medium', 'RR': 'Hard'},
                      shock_adjust={'LF': 'Comp 5 · Reb 6', 'RF': 'Comp 6 · Reb 9', 'RR': 'LS comp 3 · HS comp 2 · Reb 9'},
                      top_wing={'asset': top_wing['id']}, front_wing={'asset': front_wing['id']}, wicker='1"', front_wicker='1/2"', nose_wing='8', wing_position='2',
                      tires={c: {'asset': t['id']} for c, t in tyres.items()},
                      bump_type={'LF': 'Penske', 'RF': 'Penske'}, bump_spec={'LF': '70A', 'RF': '80A'}, bump_height={'LF': '1.25', 'RF': '1.25'},
                      bump_packers={'LF': '1', 'RF': '2'}, bump_gap={'LF': '0.75', 'RF': '0.6'},
                      blocked={'LF': '1.5', 'RF': '1.375', 'LR': '2', 'RR': '2.25'}, turns={'LF': '3', 'RF': '2.5', 'LR': '4', 'RR': '5'},
                      ride_height={'LF': '9.25', 'RF': '9.5', 'LR': '4.5', 'RR': '4.75'}, rake='1.5', tilt='0.25', lr_radius_rod='hole 3', rr_radius_rod='hole 2',
                      rear_steer='lead RR 1/8"', birdcage_angle={'LR': '-1', 'RR': '2'}, jl_length='14.5', jl_upper_strap='6.25', jl_lower_strap='6',
                      jl_mount_upper='hole 2', jl_mount_lower='hole 4', jl_birdcage_mount='top hole'), form_id=SF)
# a season of earlier nights so Analytics has something to show
season = []
for n in range(8):
    tr = ['Lakeside Raceway', 'Valley Speedway', 'Hilltop Oval'][n % 3]
    e = rec('event', {'name': f'{tr} Club Championship', 'round': str(n + 1), 'date': d(112 - n * 14), 'track': tr, 'car': car['id'], 'intent': 'Planned',
                      **({'outcome': 'Withdrew during the event', 'withdraw_reason': 'Engine'} if n == 3 else {'outcome': 'Raced the feature'})})
    season.append(e)
    for k, (sess, order) in enumerate([('Heat 1', 10), ('Feature', 20)]):
        stg = 5 + (n % 4) * 0.5
        st = 4 + (n * 3 + k) % 7
        fin = max(1, st - round((5.75 - stg) * 3) + (n + k) % 3 - 1)
        season.append(rec('setup', S(event=e['id'], session=sess, order=order, start=str(st), finish=str(fin), stagger_cold=str(stg),
                                     wing_angle=str(12 + n % 3), adr=str(90 + n * 1.5), main_jet=str(46 + n // 3), laps='10' if k == 0 else '30',
                                     fuel_start='5' if k == 0 else '9', fuel_finish='3' if k == 0 else str(round(3 - n * 0.05, 2)),
                                     tach_high=str(8600 - n * 12), blocked={'LF': '1.5', 'RF': '1.375', 'LR': '2', 'RR': '2.25'},
                                     turns={'LF': '3', 'RF': '2.5', 'LR': '4' if n % 2 else '4.5', 'RR': '5'}, track_conditions=[['Heavy', 'Tacky'], ['Slick'], ['Tacky'], ['Dry slick']][n % 4],
                                     driver_feel=['Loose exit'] if k == 0 and n % 2 == 0 else []), form_id=SF))
heat['data']['values']['adr'] = '91'
# the engine's tune (two versions, the newer active) and two engine checks, the later with a weak spring
TB = {'engine': eng['id'], 'source': 'Engine builder', 'builder': 'Hart Engines', 'induction': 'Engler 2.9', 'fuel_by': 'ADR %', 'plugs': 'NGK R5671A-10', 'plug_gap': '0.024',
      'lash_int': '0.012', 'lash_exh': '0.016', 'lash_when': 'Cold', 'spring_int': '280', 'spring_exh': '280', 'timing': '30° BTDC', 'ls_psi': '40–50', 'ls_pill': '80',
      'nozzles_down': '435', 'nozzles_up': '165', 'fuel_pump': 'Waterman 500', 'metering_block': '20–22', 'hs_type': 'IRL'}
chart = [{'from': a, 'to': b, 'main': m, 'hs_psi': p, 'hs': '72'} for a, b, m, p in [('87', '89', '75', '106'), ('90', '93', '70', '108'), ('94', '97', '68', '110'), ('98', '100', '66', '112')]]
tune1 = rec('engine_tune', {**TB, 'name': '2026 v1', 'date': d(130), 'active': False, 'fuel_chart': chart}, form_id=form('engine_tune'))
tune2 = rec('engine_tune', {**TB, 'name': '2026 v2', 'date': d(60), 'active': True, 'fuel_chart': chart}, form_id=form('engine_tune'))
CY = ['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8']
ck = lambda n, sp, plug, **x: rec('engine_check', {'engine': eng['id'], 'date': d(n), 'engine_tune': tune2['id'], 'leakdown_temp': 'Cold', 'leakdown': {c: '4' for c in CY},
    'lash_int': {c: '0.012' for c in CY}, 'lash_exh': {c: '0.016' for c in CY}, 'spring_int': sp, 'spring_exh': {c: '276' for c in CY}, 'plug_read': plug, 'plug_gap': '0.024', **x}, form_id=form('engine_check'))
chk1 = ck(35, {c: '278' for c in CY}, {c: 'Good' for c in CY})
chk2 = ck(5, {c: ('246' if c == '#5' else '276') for c in CY}, {c: ('Lean' if c == '#6' else 'Good') for c in CY}, parts_needed='Intake spring for #5.')
push(car, eng, *shocks.values(), spare, top_wing, front_wing, *tyres.values(), ev_old, ev, old, heat, feat, *season, tune1, tune2, chk1, chk2)

# calendars: the racing year starts with the first demo round; a shared series and track dates
# (shared with every team on this server — another reason to use a test server)
start = date.today() - timedelta(days=125)
settings = next(m for m in login['memberships'] if m['tenant_id'] == TID).get('settings') or {}
call(f'/t/{TID}', T, 'PATCH', {'settings': {**settings, 'calendar_season_start': start.month}})
up = lambda n: (date.today() + timedelta(days=n)).isoformat()
FX, TRF, SEF = form('fixture'), form('track'), form('series')
gtrack = rec('track', {'name': 'Valley Speedway', 'city': 'Valley', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TRF, scope='global')
gtrack2 = rec('track', {'name': 'Lakeside Raceway', 'city': 'Lakeside', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TRF, scope='global')
gser = rec('series', {'name': 'Summer Sprintcar Series', 'season': str(start.year), 'class': '410 Sprint'}, form_id=SEF, scope='global')
gfx = [rec('fixture', {k: x for k, x in v.items() if x}, form_id=FX, scope='global') for v in [
    {'name': 'Summer Series Rd 1', 'date': up(9), 'venue': gtrack['id'], 'series': gser['id'], 'round': 1, 'classes': ['410 Sprint'], 'status': 'Scheduled'},
    {'name': 'Lakeside Club Night', 'date': up(16), 'venue': gtrack2['id'], 'classes': ['410 Sprint', '360 Sprint'], 'status': 'Scheduled'},
    {'name': 'Summer Series Rd 2', 'date': up(23), 'end_date': up(24), 'venue': gtrack2['id'], 'series': gser['id'], 'round': 2, 'classes': ['410 Sprint'], 'status': 'Scheduled'},
    {'name': 'Summer Series Rd 3', 'date': up(37), 'venue': gtrack['id'], 'series': gser['id'], 'round': 3, 'classes': ['410 Sprint'], 'status': 'Scheduled'},
    {'name': 'Valley Speedway Classic', 'date': up(44), 'venue': gtrack['id'], 'classes': ['410 Sprint'], 'status': 'Scheduled', 'major': True},
    {'name': 'Australian Sprintcar Title', 'date': up(58), 'end_date': up(59), 'venue': gtrack2['id'], 'classes': ['410 Sprint'], 'status': 'Scheduled', 'major': True}]]
push(gtrack, gtrack2, gser, *gfx)
EF = form('event')
cal = [rec('event', {'name': f['data']['values']['name'], 'date': f['data']['values']['date'], 'end_date': f['data']['values'].get('end_date'), 'venue': f['data']['values']['venue'],
                     'series': f['data']['values'].get('series'), 'round': f['data']['values'].get('round'), 'fixture': f['id'], 'car': car['id'],
                     'intent': 'Tentative' if i == 1 else 'Planned'}, form_id=EF) for i, f in enumerate(gfx[:3])]
for c in cal: c['data']['values'] = {k: x for k, x in c['data']['values'].items() if x}
entry = rec('season_plan', {'series': gser['id'], 'season': str(start.year), 'car': car['id'], 'class': '410 Sprint', 'participation': 'Partial series'}, form_id=form('season_plan'))
push(*cal, entry)
# a two-night meeting with a night off between (multi-day events)
two_nights = rec('event', {'name': 'Valley Two-Night Classic', 'venue': gtrack['id'], 'car': car['id'], 'intent': 'Planned', 'event_type': 'Special event',
                           'multi_day': True, 'date': up(50), 'end_date': up(52),
                           'days': [{'n': 1, 'date': up(50), 'label': 'Practice & prelims', 'time': '18:00'}, {'n': 2, 'date': up(52), 'label': 'Finals', 'time': '17:30'}]}, form_id=EF)
push(two_nights)
# requests to the shared calendars: a team-only track with its major event, and a change to a shared date
mud = rec('track', {'name': 'Mudtown Raceway', 'city': 'Mudtown', 'region': 'QLD', 'country': 'Australia', 'status': 'Active'}, form_id=TRF)
mud_ev = rec('event', {'name': 'Mudtown Classic night 1', 'date': up(30), 'venue': mud['id'], 'car': car['id'], 'intent': 'Planned', 'major': True, 'major_name': 'Mudtown Classic'}, form_id=EF)
push(mud, mud_ev)
call(f'/t/{TID}/calendar/requests', T, 'POST', {'kind': 'change', 'subject_type': 'fixture', 'subject_id': gfx[2]['id'],
     'values': {**gfx[2]['data']['values'], 'date': up(22), 'end_date': up(23)}, 'note': 'Moved forward a day — series Facebook page'})
call(f'/t/{TID}/calendar/requests', T, 'POST', {'kind': 'share', 'subject_type': 'track', 'subject_id': mud['id'], 'events': [mud_ev['id']], 'note': 'Club track, 2026-27 fixture list'})
# follow the series, then (as platform admin) add a round that has run, with results, a clashing club night, and move round 3
push(rec('follow', {'entity_type': 'series', 'entity': gser['id']}, form_id=form('follow')))
call('/admin/calendar/fixtures/new', T, 'PUT', {'values': {'name': 'Summer Series Opener', 'date': up(-5), 'venue': gtrack['id'], 'series': gser['id'], 'round': 0,
     'classes': ['410 Sprint'], 'status': 'Scheduled', 'entries': 24, 'results_note': 'Track dried out for the feature.',
     'results': [{'pos': '1', 'number': '17', 'driver': 'Sam Hart', 'team': 'Hart Racing'}, {'pos': '2', 'number': '5', 'driver': 'Jo Reid', 'team': 'Reid Motorsport'},
                 {'pos': '3', 'number': '88', 'driver': 'Alex Moore', 'team': 'Demo Racing'}]}})
call('/admin/calendar/fixtures/new', T, 'PUT', {'values': {'name': 'Valley Midweek Special', 'date': up(16), 'venue': gtrack['id'], 'classes': ['410 Sprint'], 'status': 'Scheduled'}})
call(f'/admin/calendar/fixtures/{gfx[3]["id"]}', T, 'PUT', {'values': {**gfx[3]['data']['values'], 'date': up(38)}})

# feedback & roadmap: a problem report, two requests on the roadmap (one with votes), and an idea in the pipeline
fb_bug = call('/feedback', T, 'POST', {'kind': 'bug', 'title': 'Stagger resets after saving a setup sheet', 'description': 'After pressing Save the stagger goes back to blank.',
              'steps': '1. Open a setup sheet\n2. Type 4.5 in stagger\n3. Save', 'expected': 'Stagger stays 4.5', 'page': '/setups', 'tenant_id': TID})[1]['item']
fb_feat = call('/feedback', T, 'POST', {'kind': 'feature', 'title': 'Log tyre pressures for every session', 'description': 'See how pressures build over a night.'})[1]['item']
fb_enh = call('/feedback', T, 'POST', {'kind': 'enhancement', 'title': 'Show the weather on the event list', 'description': 'Handy when picking a night.'})[1]['item']
call(f'/admin/feedback/{fb_feat["id"]}', T, 'PATCH', {'public_summary': 'Record tyre pressures per session and see the trend'})
call(f'/admin/feedback/{fb_feat["id"]}/decide', T, 'POST', {'action': 'approve', 'lane': 'next'})
call(f'/feedback/{fb_feat["id"]}/vote', T, 'POST', {})
call(f'/admin/feedback/{fb_enh["id"]}/decide', T, 'POST', {'action': 'approve', 'lane': 'now'})
call(f'/admin/feedback/{fb_bug["id"]}', T, 'PATCH', {'priority': 'high', 'areas': ['module:setups', 'system:sync'], 'acceptance': '- Stagger saves on desktop and phone'})
call(f'/admin/feedback/{fb_bug["id"]}/decide', T, 'POST', {'action': 'approve', 'lane': 'now'})
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'e2e', 'fixtures')
def attach(path, name):  # a file on a feedback item (multipart upload)
    bd = 'xGuideShots'
    body = (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + open(os.path.join(FIX, name), 'rb').read() + f'\r\n--{bd}--\r\n'.encode()
    urllib.request.urlopen(urllib.request.Request(B + '/api' + path, method='POST', data=body, headers={'authorization': f'Bearer {T}', 'content-type': f'multipart/form-data; boundary={bd}'}))
attach(f'/admin/feedback/{fb_bug["id"]}/files', 'ai-sheet.png')
attach(f'/admin/feedback/{fb_bug["id"]}/files', 'ai-printout.pdf')
fb_idea = call('/admin/feedback', T, 'POST', {'title': 'Bulk-edit pressures across a night’s sheets', 'kind': 'feature', 'description': 'Change one value on several setup sheets at once.',
               'areas': ['module:setups'], 'public': True, 'public_summary': 'Change a value on several setup sheets at once'})[1]['item']
call(f'/admin/feedback/{fb_idea["id"]}/decide', T, 'POST', {'action': 'approve', 'lane': 'later'})

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
    want = [shot('setup-shocks'), shot('fuel-planner'), shot('setup-wing'), shot('setup-tires')]
    if any(want):
        page.goto(f"{B}/r/setup/{feat['id']}"); settle(page)
        # close-ups of one section: let the sticky title and save bar scroll away so they don't cover it
        page.add_style_tag(content='.page-head, .save-bar, .topbar { position: static !important; }')
        page.set_viewport_size({'width': 1280, 'height': 1600})
        if 'setup-shocks' in SHOTS:
            sec = page.locator('#sec-shocks')
            sec.scroll_into_view_if_needed(); settle(page)
            save('setup-shocks', sec.screenshot())
        for name, sid in [('setup-wing', 'wing'), ('setup-tires', 'tires')]:
            if name in SHOTS:
                sec = page.locator(f'#sec-{sid}')
                sec.scroll_into_view_if_needed(); settle(page)
                save(name, sec.screenshot())
        if 'fuel-planner' in SHOTS:
            sec = page.locator('section.form-section:has([data-testid="fuel-planner"])')
            sec.scroll_into_view_if_needed(); settle(page)
            save('fuel-planner', sec.screenshot())
        page.set_viewport_size({'width': 1280, 'height': 820})
        page.goto(B + '/'); settle(page)  # back to normal for the full-page shots below
    if shot('engine-tune-panel'):
        page.goto(f"{B}/r/setup/{heat['id']}"); settle(page)
        page.add_style_tag(content='.page-head, .save-bar, .topbar { position: static !important; }')
        sec = page.locator('#sec-engine'); sec.scroll_into_view_if_needed(); settle(page)
        save('engine-tune-panel', sec.screenshot())
        page.goto(B + '/'); settle(page)
    if shot('engine-tunes'):
        page.goto(B + '/tunes'); settle(page)
        save('engine-tunes', page.screenshot())
    if shot('engine-check-compare'):
        page.goto(f"{B}/r/engine_check/{chk2['id']}"); settle(page)
        page.add_style_tag(content='.page-head, .save-bar, .topbar { position: static !important; }')
        sec = page.locator('.check-compare'); sec.scroll_into_view_if_needed(); settle(page)
        save('engine-check-compare', sec.screenshot())
        page.goto(B + '/'); settle(page)
    if shot('setup-chassis'):
        page.goto(f"{B}/r/setup/{feat['id']}"); settle(page)
        page.add_style_tag(content='.page-head, .save-bar, .topbar { position: static !important; }')
        page.set_viewport_size({'width': 1280, 'height': 1600})
        sec = page.locator('#sec-chassis'); sec.scroll_into_view_if_needed(); settle(page)
        save('setup-chassis', sec.screenshot())
        page.set_viewport_size({'width': 1280, 'height': 820})
        page.goto(B + '/'); settle(page)
    for name in ('setup-quick-add', 'setup-angle-finder'):
        if shot(name):
            m = page_for(390, 844, mobile=True)
            m.goto(f"{B}/r/setup/{feat['id']}"); settle(m)
            box = 'blocked-RF' if name == 'setup-quick-add' else 'wing_angle'
            m.locator(f'#f-{box}').scroll_into_view_if_needed()
            m.locator(f'#f-{box}').dispatch_event('contextmenu')   # what a long press does
            qa = m.locator('[data-testid="quick-add"]'); expect(qa).to_be_visible()
            if name == 'setup-angle-finder':
                qa.get_by_role('button', name='Angle finder').click()
                for _ in range(30): m.evaluate("dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 14.5, gamma: 0 }))")
            m.wait_for_timeout(500)
            save(name, m.screenshot())
            m.context.close()
    if shot('team-photos'):
        from PIL import ImageDraw
        def picture(w, h, top, bottom, text):
            im = Image.new('RGB', (w, h))
            dr = ImageDraw.Draw(im)
            for y in range(h):
                k = y / h; dr.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(3)))
            dr.ellipse([w * .3, h * .25, w * .7, h * .75], fill=(255, 255, 255))
            dr.text((w * .5, h * .5), text, fill=top, anchor='mm', font_size=int(h * .22))
            b = io.BytesIO(); im.save(b, 'JPEG', quality=90); return b.getvalue()
        def put_photo(path, data):
            bd = uuid.uuid4().hex
            body = (f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n').encode() + data + f'\r\n--{bd}--\r\n'.encode()
            req = urllib.request.Request(B + '/api' + path, method='PUT', data=body, headers={'content-type': f'multipart/form-data; boundary={bd}', 'authorization': f'Bearer {T}'})
            urllib.request.urlopen(req).read()
        put_photo(f'/t/{TID}/photo', picture(800, 600, (226, 86, 26), (40, 20, 10), '#17'))
        crew = next(r for r in call(f'/t/{TID}/roles', T)[1] if r['name'] == 'Crew Chief')
        st_, inv = call(f'/t/{TID}/invites', T, 'POST', {'email': f'sam.{uuid.uuid4().hex[:6]}@example.com', 'role_id': crew['id']})
        call(f'/invites/{inv["token"]}/accept', method='POST', body={'name': 'Sam Torres', 'password': uuid.uuid4().hex})
        sam = next(m for m in call(f'/t/{TID}/members', T)[1] if m['name'] == 'Sam Torres')
        put_photo(f'/t/{TID}/members/{sam["id"]}/photo', picture(400, 400, (30, 90, 200), (10, 20, 50), 'ST'))
        t = page_for(1280, 1400)
        t.goto(f'{B}/team/members'); settle(t)
        t.add_style_tag(content='.page-head, .save-bar, .topbar { position: static !important; }')
        t.wait_for_timeout(1200)   # the photos load
        page_png = Image.open(io.BytesIO(t.screenshot(full_page=True)))
        boxes = [t.locator('section', has=t.locator(sel)).last.bounding_box() for sel in ('[data-testid="team-profile"]', '[data-testid="member-row"]')]
        sy = t.evaluate('scrollY')
        crops = [page_png.crop((int(b['x']), int(b['y'] + sy), int(b['x'] + b['width']), int(b['y'] + sy + b['height']))) for b in boxes]
        both = Image.new('RGB', (max(c.width for c in crops), sum(c.height for c in crops) + 12), (243, 242, 239))
        both.paste(crops[0], (0, 0)); both.paste(crops[1], (0, crops[0].height + 12))
        out = io.BytesIO(); both.save(out, 'PNG'); save('team-photos', out.getvalue())
        t.context.close()
    if shot('setup-quick-edit'):
        q = page_for(1280, 820)
        q.goto(f"{B}/r/setup/{feat['id']}"); settle(q)
        q.locator('.sheet-nav .sn-chip:has-text("Tires")').click(); q.wait_for_timeout(1200)
        save('setup-quick-edit', q.screenshot())
    for name, tab in [('analytics-performance', ''), ('analytics-setups', '?tab=setups')]:
        if shot(name):
            a = page_for(1280, 820)
            a.goto(f'{B}/analytics{tab}'); a.wait_for_timeout(1200)
            save(name, a.screenshot())
    if shot('event-sessions'):
        page.goto(f"{B}/events/{ev['id']}"); settle(page)
        save('event-sessions', page.screenshot())
    if shot('event-days'):
        page.goto(f"{B}/r/event/{two_nights['id']}"); settle(page)
        sec = page.locator('[data-testid="days-field"]').locator('xpath=ancestor::section[1]').bounding_box()
        days = page.locator('[data-testid="days-field"]').bounding_box()   # the event card down to the last day
        save('event-days', page.screenshot(clip={'x': sec['x'], 'y': sec['y'], 'width': sec['width'], 'height': days['y'] + days['height'] - sec['y'] + 16}))
    if shot('calculators'):
        page.goto(B + '/calculators'); settle(page)
        save('calculators', page.screenshot())
    if shot('calendar-ours'):
        page.goto(B + '/calendar'); settle(page)
        save('calendar-ours', page.screenshot())
    if shot('calendar-shared'):
        page.goto(B + '/calendar?tab=shared&show=all'); settle(page)
        save('calendar-shared', page.screenshot())
    if shot('calendar-admin'):
        page.goto(B + '/admin/calendar?show=major'); settle(page)
        save('calendar-admin', page.screenshot())
    if shot('calendar-suggestions'):
        page.goto(B + '/admin/calendar?tab=requests'); settle(page)
        save('calendar-suggestions', page.screenshot())
    if shot('calendar-requests'):
        page.goto(B + '/calendar?tab=requests'); settle(page)
        save('calendar-requests', page.screenshot())
    if shot('calendar-updates'):
        page.goto(B + '/calendar?tab=updates'); settle(page)
        save('calendar-updates', page.screenshot())
    if shot('calendar-clashes'):
        page.goto(B + '/calendar?tab=shared&show=clashes'); settle(page)
        save('calendar-clashes', page.screenshot())
    if shot('calendar-results'):
        page.goto(B + f'/calendar?tab=shared&show=series:{gser["id"]}'); settle(page)
        page.get_by_role('button', name='Results', exact=True).first.click(); settle(page)
        save('calendar-results', page.screenshot())
    if shot('feedback-send'):
        page.goto(B + '/feedback?from=/setups'); settle(page)
        page.click('button[role="radio"]:has-text("Something isn’t working")')
        page.get_by_label('Title').fill('Stagger resets after saving a setup sheet')
        page.get_by_label('Details').fill('After pressing Save the stagger goes back to blank.')
        page.get_by_label('Attach files').set_input_files([os.path.join(FIX, 'ai-sheet.png'), os.path.join(FIX, 'sheet.csv')]); settle(page)
        page.locator('[data-testid="fb-picked"]').scroll_into_view_if_needed(); page.mouse.wheel(0, 200); settle(page)
        save('feedback-send', page.screenshot())
    if shot('feedback-roadmap'):
        page.goto(B + '/feedback?tab=roadmap'); settle(page)
        save('feedback-roadmap', page.screenshot())
    if shot('feedback-admin'):
        page.goto(B + '/admin/feedback?view=pipeline'); settle(page)
        page.click('[data-testid="fb-row"]:has-text("Stagger resets")'); settle(page)
        save('feedback-admin', page.screenshot())
    if shot('calendar-public'):
        pub = call(f'/t/{TID}/calendar/publish', T, 'PUT', {'on': True, 'show_cars': True, 'show_tentative': True, 'show_results': True})[1]['calendar_publish']
        m = page_for(390, 844, mobile=True)
        m.goto(f"{B}/c/{pub['token']}"); settle(m)
        save('calendar-public', m.screenshot())
    if shot('mobile-setup'):
        m = page_for(390, 844, mobile=True)
        m.goto(f"{B}/r/setup/{feat['id']}"); settle(m)
        m.locator('.sheet-nav .sn-chip:has-text("Shocks")').click(); m.wait_for_timeout(1200)
        save('mobile-setup', m.screenshot())
    br.close()

print(f'Saved {len(SHOTS)} pictures to {os.path.relpath(args.out)}. Remember to delete the "Guide demo" team on that server.')
