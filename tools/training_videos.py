#!/usr/bin/env python3
"""
Record the short training videos in docs/guide/video/ (and their poster frames in docs/guide/img/).

Run against a TEST server (it creates a practice team called "Practice — videos"):

    python3 tools/training_videos.py --url http://localhost:8080 --email admin@example.com --password '…'
    python3 tools/training_videos.py … --only training-owner

The account must be a platform admin. Each video is a scripted walkthrough of one training exercise,
with a caption bar and a visible pointer, recorded by Playwright (Chromium) and re-encoded with ffmpeg
(VP9 WebM, 1280×720). Change a script below when the screens change, and re-run it.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, urllib.error, urllib.request
from playwright.sync_api import sync_playwright, expect

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:8080')
ap.add_argument('--email', required=True)
ap.add_argument('--password', required=True)
ap.add_argument('--only', help='comma-separated video names to record')
args = ap.parse_args()
B = args.url.rstrip('/')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
VIDEO_DIR = os.path.join(ROOT, 'docs', 'guide', 'video')
IMG_DIR = os.path.join(ROOT, 'docs', 'guide', 'img')
ONLY = set(args.only.split(',')) if args.only else None
os.makedirs(VIDEO_DIR, exist_ok=True)


def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


st, login = call('/auth/login', method='POST', body={'email': args.email, 'password': args.password})
if st != 200:
    sys.exit(f'Sign-in failed ({st}): {login}')
T = login['token']
st, team = call('/admin/tenants', T, 'POST', {'name': 'Practice — videos', 'plan': 'pro', 'practice': True})
if st != 200:
    sys.exit(f'Could not create the practice team ({st}): {team} — the account must be a platform admin.')
TID = team['id']
login = call('/auth/login', method='POST', body={'email': args.email, 'password': args.password})[1]
RECS = call(f'/t/{TID}/sync?since=0', T)[1]['records']
by_name = lambda type, name: next(r for r in RECS if r['type'] == type and (r['data'].get('values') or {}).get('name' if type != 'job' else 'job_no') == name)

# a pointer you can see, and a caption bar that survives page changes
INIT = """
(() => {
  const css = `#tv-cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
    background:rgba(232,90,32,.35);border:2px solid #e85a20;pointer-events:none;transition:transform .15s}
    #tv-cursor.down{transform:scale(.6)}
    #tv-cap{position:fixed;z-index:2147483646;left:50%;bottom:22px;transform:translateX(-50%);max-width:86%;padding:12px 20px;border-radius:12px;
    background:rgba(20,22,27,.92);color:#fff;font:600 20px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.3)}
    #tv-cap:empty{display:none}`;
  const add = () => {
    if (document.getElementById('tv-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const c = document.createElement('div'); c.id = 'tv-cursor'; document.body.appendChild(c);
    const cap = document.createElement('div'); cap.id = 'tv-cap'; cap.textContent = sessionStorage.getItem('tv-cap') || ''; document.body.appendChild(cap);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => c.classList.add('down'), true);
    addEventListener('mouseup', () => c.classList.remove('down'), true);
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();
"""

VIDEOS = []
video = lambda f: VIDEOS.append(f) or f


def say(page, text, wait=2200):
    page.evaluate("t => { sessionStorage.setItem('tv-cap', t); const c = document.getElementById('tv-cap'); if (c) c.textContent = t; }", text)
    page.wait_for_timeout(wait)


def click(page, loc, pause=900):
    loc = page.locator(loc) if isinstance(loc, str) else loc
    loc.first.scroll_into_view_if_needed()
    loc.first.hover(); page.wait_for_timeout(350)
    loc.first.click(); page.wait_for_timeout(pause)


def synced(page):
    expect(page.locator('text=Synced')).to_be_visible(timeout=30000)


# ---------------------------------------------------------------- the videos
@video
def training_feature_sheet(page):
    ev = by_name('event', 'Valley Speedway — Club night')
    say(page, 'Tonight: Heat 1 is done and the car was loose off the corners')
    click(page, '.sidebar .nav-link:has-text("Events")')
    click(page, 'a.list-row:has-text("Valley Speedway — Club night")', 1500)
    say(page, 'Add the Feature: pick it in the list, then + Add session')
    page.select_option('.add-session select', 'Feature'); page.wait_for_timeout(700)
    click(page, '.add-session button:has-text("Add session")', 1500)
    say(page, 'Copy this session starts from Heat 1 — results and feedback aren’t copied')
    click(page, 'button:has-text("Copy this session")', 1500)
    say(page, 'One click of rebound out of the RR shock')
    rr = page.locator('#sec-shocks'); rr.scroll_into_view_if_needed(); page.wait_for_timeout(600)
    click(page, 'button[aria-label="Less RR Reb"]', 1200)
    say(page, 'Half a psi more in the RR')
    click(page, page.locator('.cg-cell:has(#f-pressure_cold-RR) button[aria-label^="More"]'), 1200)
    say(page, 'And a degree more top wing')
    click(page, 'button[aria-label="More Top wing angle"]', 500)
    click(page, 'button[aria-label="More Top wing angle"]', 1200)
    say(page, 'Each change shows what it was. Changes only shows just those')
    page.locator('label:has-text("Changes only") input').check(); page.wait_for_timeout(500)
    page.evaluate('window.scrollTo({ top: 0, behavior: "smooth" })'); page.wait_for_timeout(2500)
    say(page, 'Save — it’s on the phone straight away, and syncs when there’s signal')
    click(page, page.get_by_role('button', name='Save', exact=True), 2000)
    say(page, '', 300)


@video
def training_workshop(page):
    say(page, 'Between rounds: the check after Heat 1')
    click(page, '.sidebar .nav-link:has-text("Between-round checks")', 1500)
    click(page, '.list-row:has-text("Heat 1")', 1800)
    page.get_by_text('Small oil weep on the RR shock.').last.scroll_into_view_if_needed(); page.wait_for_timeout(800)
    say(page, 'The issue noted: a small oil weep on the RR shock')
    say(page, 'Back in the workshop: what needs attention')
    click(page, '.sidebar .nav-area:has-text("In the Workshop")', 2000)
    say(page, 'The oil change is due and the RR shock is close to its rebuild', 3000)
    click(page, '.sidebar .nav-link:has-text("Car maintenance")', 1200)
    click(page, '.tabs button:has-text("Schedules")', 1500)
    say(page, 'Oil change done? Press Done today and the count starts again')
    click(page, page.locator('.list-row:has-text("Oil and filter change") button:has-text("Done today")'), 2000)
    say(page, '', 300)


@video
def training_driver(page):
    say(page, 'Tonight’s meeting, on your phone or tablet')
    click(page, '.sidebar .nav-link:has-text("Events")')
    click(page, 'a.list-row:has-text("Valley Speedway — Club night")', 1500)
    say(page, 'Open the Heat 1 sheet')
    click(page, page.locator('a:has-text("Heat 1")'), 2000)
    say(page, 'Jump straight to a section: Tires…')
    click(page, '.sheet-nav .sn-chip:has-text("Tires")', 2000)
    say(page, '…or Wing')
    click(page, '.sheet-nav .sn-chip:has-text("Wing")', 2000)
    say(page, 'Where are we racing next? Team Management → Calendar')
    click(page, '.sidebar .nav-link:has-text("Calendar")', 1500)
    page.locator('.list-row:has-text("Rd 9")').first.scroll_into_view_if_needed(); page.wait_for_timeout(800)
    say(page, 'Round 9 at Lakeside next week', 2500)
    say(page, '', 300)


@video
def training_shop_job(page):
    say(page, 'Engine Shop → Jobs: Sam Hart’s freshen, J-1001')
    click(page, '.sidebar .nav-link:has-text("Jobs")', 1500)
    click(page, page.locator('.list-row:has-text("J-1001")'), 2000)
    say(page, 'Record what you found')
    page.locator('#f-findings').scroll_into_view_if_needed(); page.wait_for_timeout(500)
    page.locator('#f-findings').click(); page.keyboard.type('Cylinder 4 ring gap out of spec.', delay=45); page.wait_for_timeout(800)
    say(page, 'Waiting on parts')
    page.locator('#f-status').scroll_into_view_if_needed(); page.select_option('#f-status', 'Waiting on parts'); page.wait_for_timeout(1200)
    say(page, 'Save, then print the job sheet and handover pack')
    click(page, page.get_by_role('button', name='Save', exact=True), 2000)
    click(page, 'a:has-text("Job sheet / handover pack")', 2500)
    page.mouse.wheel(0, 500); page.wait_for_timeout(1500)
    say(page, 'Work done, parts and labour — ready for the customer', 3000)
    say(page, '', 300)


@video
def training_owner(page):
    say(page, 'Team → Members & invites: invite your crew with the right role')
    click(page, '.sidebar .nav-link:has-text("Members & invites")', 1500)
    inv = page.locator('form.inline-row:has(input[type=email])')
    inv.locator('input[type=email]').click(); page.keyboard.type('mechanic@example.com', delay=40)
    inv.locator('select').select_option(label='Mechanic'); page.wait_for_timeout(800)
    say(page, 'Create the link and send it by text or email')
    click(page, inv.locator('button'), 2000)
    say(page, 'Plan the year: Team Management → Calendar')
    click(page, '.sidebar .nav-link:has-text("Calendar")', 1800)
    rd9 = next(r for r in RECS if r['type'] == 'event' and str((r['data'].get('values') or {}).get('round')) == '9')
    row = page.locator(f'[data-event="{rd9["id"]}"]')
    row.scroll_into_view_if_needed(); page.wait_for_timeout(600)
    say(page, 'Round 9 next week — not sure yet, so Tentative')
    row.locator('select[aria-label^="Going to"]').select_option('Tentative'); page.wait_for_timeout(1500)
    say(page, 'Quick edit opens right under it, with Save at the top')
    click(page, row.locator('button:has-text("Edit")'), 1500)
    qe = page.locator('[data-testid="quick-edit"]')
    qe.locator('input[aria-label="Sanctioning body"]').click(); page.keyboard.type('Speedway Australia', delay=40); page.wait_for_timeout(600)
    click(page, qe.locator('.qe-head button:has-text("Save")'), 2000)
    say(page, '', 300)


# ---------------------------------------------------------------- record
def encode(raw, name):
    out = os.path.join(VIDEO_DIR, f'{name}.webm')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1',
                    '-deadline', 'good', '-cpu-used', '4', '-an', '-vf', 'scale=1280:-2', out], check=True)
    poster = os.path.join(IMG_DIR, f'{name}.webp')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '4', '-i', out, '-frames:v', '1', '-vf', 'scale=960:-2', poster], check=True)
    return out


with sync_playwright() as pw:
    br = pw.chromium.launch(slow_mo=60)
    tmp = tempfile.mkdtemp()
    made = []
    for fn in VIDEOS:
        name = fn.__name__.replace('_', '-')
        if ONLY and name not in ONLY:
            continue
        ctx = br.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=tmp, record_video_size={'width': 1280, 'height': 720})
        ctx.add_init_script(INIT)
        page = ctx.new_page()
        s = {'token': login['token'], 'user': login['user'], 'memberships': login['memberships'], 'platform': login.get('platform'), 'tenantId': TID}
        page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        page.goto(B); synced(page); page.wait_for_timeout(800)
        try:
            fn(page)
        finally:
            raw = page.video.path()
            ctx.close()
        out = encode(raw, name)
        made.append((name, os.path.getsize(out)))
        print(f'  {name}.webm  {os.path.getsize(out) // 1024} KB')
        # each video starts from the original demo data
        call(f'/t/{TID}/practice/reset', T, 'POST', {})
        RECS[:] = call(f'/t/{TID}/sync?since=0', T)[1]['records']
    shutil.rmtree(tmp, ignore_errors=True)
    br.close()
print(f'Recorded {len(made)} videos into docs/guide/video. Remember to delete the "Practice — videos" team on that server.')
