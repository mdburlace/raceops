#!/usr/bin/env python3
"""
Record the short training videos in docs/guide/video/ (and their poster frames in docs/guide/img/).

Run against a TEST server (it creates a practice team called "Practice — videos"):

    python3 tools/training_videos.py --url http://localhost:8080 --email admin@example.com --password '…'
    python3 tools/training_videos.py … --only training-owner

The account must be a platform admin. While it records, the account uses the standard look and layout (theme,
sidebar sections open, standard setup sheet layout, Calendar list view); its own settings are put back at the end. Each video is a scripted walkthrough of one training exercise,
with a visible pointer, recorded by Playwright (Chromium) and re-encoded with ffmpeg (VP9 WebM, 1280×720).
Change a script below when the screens change, and re-run it.

Voice-over: each say() line is spoken by a text-to-speech voice. The short caption shows in the caption bar in the
picture, as it always has, and the words spoken go in a captions file (docs/guide/video/<name>.vtt) that viewers
can turn on with the player's CC button. say(page, 'short caption', speak='what the voice
says') lets the voice explain more than the caption; the captions file follows the voice. Pick the voice with
--tts (see tools/narration.py):

    AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=australiaeast python3 tools/training_videos.py --tts azure …
    AWS_PROFILE=raceops-voice python3 tools/training_videos.py --tts polly …      # Amazon Polly, Matthew (needs boto3)
    python3 tools/training_videos.py --tts piper --voice ~/voices/en_GB-alba-medium.onnx …
    python3 tools/training_videos.py --tts none …     # silent, with just the caption bar

The default, auto, uses Azure when AZURE_SPEECH_KEY is set, Amazon Polly when AWS credentials or AWS_PROFILE are
set, Piper when PIPER_VOICE is set, and otherwise none.
Every line is turned into speech before recording starts, so the video doesn't pause while a voice is made.

If a video can't be finished (a screen didn't look as the script expects), the others still record, the old video is
kept, and a screenshot and the page's text are saved in tools/.video-failures/ (ignored by Git).
"""
from datetime import date
import argparse, ast, json, os, shutil, subprocess, sys, tempfile, urllib.error, urllib.request
from playwright.sync_api import sync_playwright, expect

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import narration  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--url', default='http://localhost:8080')
ap.add_argument('--email', required=True)
ap.add_argument('--password', required=True)
ap.add_argument('--only', help='comma-separated video names to record')
ap.add_argument('--tts', default='auto', choices=['auto', 'azure', 'polly', 'piper', 'none'], help='voice-over provider (default auto)')
ap.add_argument('--voice', help='voice name (Azure, default en-AU-NatashaNeural; Polly, default Matthew) or model file (Piper)')
args = ap.parse_args()
TTS, VOICE = narration.choose(args.tts, args.voice)
NARRATOR = narration.Narrator(TTS, VOICE) if TTS != 'none' else None
TIMELINE = None  # the video being recorded, when narrated
print(f'Voice-over: {TTS}' + (f' ({VOICE})' if VOICE else ' — caption bar only, no audio'))
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
# Record with the standard look and layout, whatever this account has chosen (theme, folded sidebar sections,
# setup sheet layout, Calendar list or month), and put the account's own settings back at the end.
STANDARD_PREFS = {'theme': 'system', 'nav_collapsed': [], 'setup_layout': {}, 'calendar_view': 'agenda'}
OWN_PREFS = {k: v for k, v in (login['user'].get('prefs') or {}).items() if k in STANDARD_PREFS}
call('/me', T, 'PATCH', {'prefs': STANDARD_PREFS})
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


def say(page, text, wait=2200, speak=None):
    """Show the caption in the caption bar. With a voice-over, also speak the line (speak= if given, else the caption)
    and wait until it's said. say(page, '') ends the last line."""
    page.evaluate("t => { sessionStorage.setItem('tv-cap', t); const c = document.getElementById('tv-cap'); if (c) c.textContent = t; }", text)
    if not NARRATOR:
        page.wait_for_timeout(wait)
        return
    words = speak or text
    clip = NARRATOR.speak(narration.spoken(words)) if words else None
    TIMELINE.caption(words)
    if clip:
        TIMELINE.clip(*clip)
        wait = max(wait, int(clip[1] * 1000) + 450)
    page.wait_for_timeout(wait)


def prepare_voice():
    """Make the speech for every say() line written as plain text in this file, before recording starts."""
    lines = set()
    for node in ast.walk(ast.parse(open(os.path.abspath(__file__), encoding='utf-8').read())):
        if isinstance(node, ast.Call) and getattr(node.func, 'id', None) == 'say' and len(node.args) > 1:
            kw = {k.arg: k.value for k in node.keywords}
            v = kw.get('speak', node.args[1])
            if isinstance(v, ast.Constant) and isinstance(v.value, str) and v.value:
                lines.add(v.value)
    for i, line in enumerate(sorted(lines), 1):
        NARRATOR.speak(narration.spoken(line))
        print(f'\r  voice: {i}/{len(lines)} lines', end='', flush=True)
    print()


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
    say(page, 'Tonight: Heat 1 is done and the car was loose off the corners',
        speak='It’s club night at Valley Speedway. Heat 1 is done, and the driver says the car was loose off the corners. Here’s how to set up the Feature.')
    click(page, '.sidebar .nav-link:has-text("Events")')
    click(page, 'a.list-row:has-text("Valley Speedway — Club night")', 1500)
    say(page, 'Add the Feature: pick it in the list, then + Add session', speak='Open the event, pick Feature in the session list, then press Add session.')
    page.select_option('.add-session select', 'Feature'); page.wait_for_timeout(700)
    click(page, '.add-session button:has-text("Add session")', 1500)
    say(page, 'Copy this session starts from Heat 1 — results and feedback aren’t copied',
        speak='Copy this session starts the Feature sheet from the Heat 1 setup. Results and feedback aren’t copied, so the Feature starts clean.')
    click(page, 'button:has-text("Copy this session")', 1500)
    say(page, 'One click of rebound out of the RR shock', speak='First change: one click of rebound out of the RR shock.')
    rr = page.locator('#sec-shocks'); rr.scroll_into_view_if_needed(); page.wait_for_timeout(600)
    click(page, 'button[aria-label="Less RR Reb"]', 1200)
    say(page, 'Half a psi more in the RR', speak='Then half a psi more in the RR tyre.')
    click(page, page.locator('.cg-cell:has(#f-pressure_cold-RR) button[aria-label^="More"]'), 1200)
    say(page, 'And a degree more top wing', speak='And one degree more on the top wing.')
    click(page, 'button[aria-label="More Top wing angle"]', 500)
    click(page, 'button[aria-label="More Top wing angle"]', 1200)
    say(page, 'Long-press a box for the quick add screen: sixteenths and common values',
        speak='Long-press a number box for the quick add screen, with sixteenths and the team’s common values. Here, one and a quarter inches of block height.')
    bh = page.locator('#f-blocked-RF'); bh.scroll_into_view_if_needed(); page.wait_for_timeout(600)
    box = bh.bounding_box(); page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.down(); page.wait_for_timeout(700); page.mouse.up(); page.wait_for_timeout(900)
    qa = page.locator('[data-testid="quick-add"]')
    click(page, qa.get_by_role('button', name='Clear'), 500)
    click(page, qa.get_by_role('button', name='1', exact=True), 600)
    click(page, qa.get_by_role('button', name='plus 1/4'), 1500)
    click(page, qa.get_by_role('button', name='OK'), 1200)
    say(page, 'Each change shows what it was. Changes only shows just those',
        speak='Each change shows what it was before. Tick Changes only to see just the changes.')
    page.locator('label:has-text("Changes only") input').check(); page.wait_for_timeout(500)
    page.evaluate('window.scrollTo({ top: 0, behavior: "smooth" })'); page.wait_for_timeout(2500)
    say(page, 'Save — it’s on the phone straight away, and syncs when there’s signal',
        speak='Press Save. It’s on the phone straight away, and syncs to the rest of the team when there’s signal.')
    click(page, page.get_by_role('button', name='Save', exact=True), 2000)
    say(page, '', 300)


@video
def training_workshop(page):
    say(page, 'Between rounds: the check after Heat 1', speak='Between rounds, open the between-round check done after Heat 1.')
    click(page, '.sidebar .nav-link:has-text("Between-round checks")', 1500)
    click(page, '.list-row:has-text("Heat 1")', 1800)
    page.get_by_text('Small oil weep on the RR shock.').last.scroll_into_view_if_needed(); page.wait_for_timeout(800)
    say(page, 'The issue noted: a small oil weep on the RR shock', speak='The mechanic noted an issue: a small oil weep on the RR shock.')
    say(page, 'Back in the workshop: what needs attention', speak='Back in the workshop, In the Workshop shows what needs attention.')
    click(page, '.sidebar .nav-area:has-text("In the Workshop")', 2000)
    say(page, 'The oil change is due and the RR shock is close to its rebuild', 3000,
        speak='The oil change is due, and the RR shock is close to its rebuild.')
    click(page, '.sidebar .nav-link:has-text("Car maintenance")', 1200)
    click(page, '.tabs button:has-text("Schedules")', 1500)
    say(page, 'Oil change done? Press Done today and the count starts again',
        speak='In Car maintenance, open Schedules. When the oil change is done, press Done today and the count starts again.')
    click(page, page.locator('.list-row:has-text("Oil and filter change") button:has-text("Done today")'), 2000)
    say(page, '', 300)


@video
def training_driver(page):
    say(page, 'Tonight’s meeting, on your phone or tablet', speak='As a driver, you can read tonight’s setup on your phone or tablet. Open Events, then tonight’s meeting.')
    click(page, '.sidebar .nav-link:has-text("Events")')
    click(page, 'a.list-row:has-text("Valley Speedway — Club night")', 1500)
    say(page, 'Open the Heat 1 sheet')
    click(page, page.locator('a:has-text("Heat 1")'), 2000)
    say(page, 'Jump straight to a section: Tires…', speak='Jump straight to a section with the buttons at the top. Tires…')
    click(page, '.sheet-nav .sn-chip:has-text("Tires")', 2000)
    say(page, '…or Wing')
    click(page, '.sheet-nav .sn-chip:has-text("Wing")', 2000)
    say(page, 'Where are we racing next? Team Management → Calendar', speak='Where are we racing next? Open Team Management → Calendar.')
    click(page, '.sidebar .nav-link:has-text("Calendar")', 1500)
    rd9 = next(r for r in RECS if r['type'] == 'event' and str((r['data'].get('values') or {}).get('round')) == '9')
    page.locator(f'[data-event="{rd9["id"]}"]').scroll_into_view_if_needed(); page.wait_for_timeout(800)  # by the event, not its round label
    say(page, 'Round 9 at Lakeside next week', 2500)
    say(page, '', 300)


@video
def training_shop_job(page):
    say(page, 'Engine Shop → Jobs: Sam Hart’s freshen, J-1001', speak='In the Engine Shop, open Jobs, then Sam Hart’s freshen, J-1001.')
    click(page, '.sidebar .nav-link:has-text("Jobs")', 1500)
    click(page, page.locator('.list-row:has-text("J-1001")'), 2000)
    say(page, 'Record what you found', speak='Record what you found when you pulled it down.')
    page.locator('#f-findings').scroll_into_view_if_needed(); page.wait_for_timeout(500)
    page.locator('#f-findings').click(); page.keyboard.type('Cylinder 4 ring gap out of spec.', delay=45); page.wait_for_timeout(800)
    say(page, 'Waiting on parts', speak='Set the status to Waiting on parts.')
    page.locator('#f-status').scroll_into_view_if_needed(); page.select_option('#f-status', 'Waiting on parts'); page.wait_for_timeout(1200)
    say(page, 'Save, then print the job sheet and handover pack', speak='Save, then open the job sheet and handover pack to print.')
    click(page, page.get_by_role('button', name='Save', exact=True), 2000)
    click(page, 'a:has-text("Job sheet / handover pack")', 2500)
    page.mouse.wheel(0, 500); page.wait_for_timeout(1500)
    say(page, 'Work done, parts and labour — ready for the customer', 3000,
        speak='It lists the work done, the parts and the labour, ready for the customer.')
    say(page, '', 300)


@video
def training_owner(page):
    say(page, 'Team → Members & invites: invite your crew with the right role',
        speak='As the owner, open Team → Members & invites, and invite each crew member with the right role.')
    click(page, '.sidebar .nav-link:has-text("Members & invites")', 1500)
    inv = page.locator('form.inline-row:has(input[type=email])')
    inv.locator('input[type=email]').click(); page.keyboard.type('mechanic@example.com', delay=40)
    inv.locator('select').select_option(label='Mechanic'); page.wait_for_timeout(800)
    say(page, 'Create the link and send it by text or email', speak='Create the invite link, then send it by text or email.')
    click(page, inv.locator('button'), 2000)
    say(page, 'Plan the year: Team Management → Calendar', speak='To plan the year, open Team Management → Calendar.')
    click(page, '.sidebar .nav-link:has-text("Calendar")', 1800)
    rd9 = next(r for r in RECS if r['type'] == 'event' and str((r['data'].get('values') or {}).get('round')) == '9')
    row = page.locator(f'[data-event="{rd9["id"]}"]')
    row.scroll_into_view_if_needed(); page.wait_for_timeout(600)
    say(page, 'Round 9 next week — not sure yet, so Tentative', speak='Round 9 is next week. You’re not sure yet, so set it to Tentative.')
    row.locator('select[aria-label^="Going to"]').select_option('Tentative'); page.wait_for_timeout(1500)
    say(page, 'Quick edit opens right under it, with Save at the top',
        speak='Press Edit. Quick edit opens right under the round, with Save at the top. Add the sanctioning body, then Save.')
    click(page, row.locator('button:has-text("Edit")'), 1500)
    qe = page.locator('[data-testid="quick-edit"]')
    qe.locator('input[aria-label="Sanctioning body"]').click(); page.keyboard.type('Speedway Australia', delay=40); page.wait_for_timeout(600)
    click(page, qe.locator('.qe-head button:has-text("Save")'), 2000)
    say(page, '', 300)


# ---- helpers for the videos below
def type_in(page, loc, text, pause=600):
    """Click a box, clear it and type, so the viewer sees it typed."""
    loc = page.locator(loc) if isinstance(loc, str) else loc
    loc.scroll_into_view_if_needed(); loc.hover(); page.wait_for_timeout(250)
    loc.click(); loc.press('Control+a'); page.keyboard.type(text, delay=45); page.wait_for_timeout(pause)


def quick_add(page, loc):
    """Open the quick add screen on a number box (a long-press on a phone, a right-click on a computer)."""
    loc = page.locator(loc) if isinstance(loc, str) else loc
    loc.scroll_into_view_if_needed(); loc.hover(); page.wait_for_timeout(350)
    loc.click(button='right'); page.wait_for_timeout(900)
    return page.locator('[data-testid="quick-add"]')


def round9():
    return next(r for r in RECS if r['type'] == 'event' and str((r['data'].get('values') or {}).get('round')) == '9')


def open_tonight(page, session='Heat 1'):
    click(page, '.sidebar .nav-link:has-text("Events")')
    click(page, 'a.list-row:has-text("Valley Speedway — Club night")', 1500)
    if session:
        click(page, page.locator(f'a:has-text("{session}")'), 1800)


def jump(page, section):
    """Use the setup sheet's jump bar."""
    click(page, page.locator(f'.sheet-nav .sn-chip:has-text("{section}")'), 1300)


@video
def training_offline(page):
    say(page, 'No signal at the track? Keep working', speak='No signal at the track? Keep working. RaceOps saves everything on your phone first.')
    page.locator('.sync-badge').hover(); page.wait_for_timeout(400)
    say(page, 'The badge at the top shows Synced: everything is on the server',
        speak='The badge at the top right shows Synced: everything is on the server.')
    page.context.set_offline(True); page.wait_for_timeout(1800)
    say(page, 'Signal gone: the badge shows Offline', speak='Now the signal has gone, as if you turned on flight mode. The badge shows Offline.')
    click(page, '.sidebar .nav-link:has-text("Cars")', 1000)
    click(page, page.locator('main a:has-text("Car 17")'), 1500)
    say(page, 'Change something and save it as usual', speak='Change something and save it as usual.')
    f = page.locator('#f-notes'); f.scroll_into_view_if_needed(); f.click(); page.keyboard.press('End')
    page.keyboard.type(' New RR shock fitted tonight.', delay=45); page.wait_for_timeout(600)
    click(page, page.get_by_role('button', name='Save', exact=True), 1500)
    page.locator('.sync-badge').hover()
    say(page, 'Saved on the phone, queued to go up', 2500, speak='It’s saved on the phone. The badge shows one change queued, waiting to go up.')
    page.context.set_offline(False)
    expect(page.locator('.sync-badge')).to_contain_text('Synced', timeout=30000)
    say(page, 'Back in signal, it syncs by itself', 2500, speak='Back in signal, it syncs by itself. Synced, and the whole team has the change.')
    say(page, '', 300)


@video
def training_change_list(page):
    say(page, 'Race night: the crew chief calls the changes',
        speak='Race night. The crew chief starts the Feature sheet from Heat 1 and calls the changes.')
    open_tonight(page, None)
    page.select_option('.add-session select', 'Feature'); page.wait_for_timeout(600)
    click(page, '.add-session button:has-text("Add session")', 1500)
    click(page, 'button:has-text("Copy this session")', 1500)
    say(page, 'A little less stagger and a degree less top wing', speak='A little less stagger, and a degree less top wing.')
    type_in(page, '#f-stagger_cold', '5')
    type_in(page, '#f-wing_angle', '12', 900)
    jump(page, 'Change list')
    say(page, 'Add changes from this sheet lists them for the car chief',
        speak='Under Change list, press Add changes from this sheet. Each change is listed for the car chief, with what it was and what it is now.')
    click(page, page.locator('#sec-changes button:has-text("Add changes from this sheet")'), 2200)
    click(page, page.get_by_role('button', name='Save', exact=True), 2000)
    say(page, 'The car chief opens the Feature sheet…', speak='The car chief opens the Feature sheet.')
    click(page, page.locator('a:has-text("Feature")'), 1800)
    jump(page, 'Change list')
    say(page, '…and ticks each one off when it’s done on the car', speak='And ticks off each change once it’s done on the car.')
    click(page, 'input[aria-label="Done row 1"]', 1000)
    click(page, 'input[aria-label="Done row 2"]', 1200)
    say(page, 'Save: 2 of 2 done', speak='Save. Two of two done, and the crew chief can see it.')
    click(page, page.get_by_role('button', name='Save', exact=True), 1800)
    say(page, '', 300)


@video
def training_tyre_sheet(page):
    say(page, 'The tyre specialist: targets on the setup sheet', speak='For the tyre specialist: set the tyre targets on tonight’s setup sheet.')
    open_tonight(page)
    jump(page, 'Tyre targets')
    say(page, 'Target cold pressures for each corner', speak='Enter the target cold pressure for each corner.')
    for corner, psi in (('LF', '12'), ('RF', '14'), ('LR', '10'), ('RR', '15')):
        type_in(page, f'#f-target_pressure-{corner}', psi, 350)
    jump(page, 'Tires')
    page.locator('table.tyre-targets').scroll_into_view_if_needed(); page.wait_for_timeout(600)
    say(page, 'The tyre sheet compares the target with what was set', 3000,
        speak='The tyre sheet compares each target with what was set. The RR is one P S I over.')
    click(page, page.get_by_role('button', name='Save', exact=True), 1500)
    say(page, 'Each tyre keeps its own work log', speak='Each tyre keeps its own work log. Open Gears and tires, then Tires.')
    click(page, '.sidebar .nav-link:has-text("Gears & tires")', 1200)
    click(page, 'main button:has-text("Tires")', 1200)
    click(page, page.locator('main tr:has-text("RR-12") a'), 1500)
    say(page, 'Add a row: siped today, with its circumference', speak='Add a row: siped today, with its circumference and durometer.')
    plus = page.get_by_role('button', name='+ Row').last
    click(page, plus, 800)
    page.locator('input[aria-label="Date row 1"]').fill(date.today().isoformat()); page.wait_for_timeout(400)
    page.select_option('select[aria-label="Work row 1"]', 'Siped'); page.wait_for_timeout(600)
    type_in(page, 'input[aria-label="Circumference row 1"]', '105.25', 300)
    type_in(page, 'input[aria-label="Durometer row 1"]', '55', 300)
    page.select_option('select[aria-label="By row 1"]', index=1); page.wait_for_timeout(600)
    click(page, page.get_by_role('button', name='Save', exact=True), 1500)
    say(page, '', 300)


@video
def training_quick_add(page):
    say(page, 'Quick add: a big keypad for any number box', speak='The quick add screen gives you a big keypad for any number box on the setup sheet.')
    open_tonight(page)
    jump(page, 'Chassis')
    say(page, 'Long-press a box. On a computer, right-click', speak='Long-press a box on your phone, or right-click on a computer. Here, the RR turns.')
    qa = quick_add(page, '#f-turns-RR')
    say(page, 'Last session’s value, and the team’s common values', speak='It shows last session’s value and the values this team uses most.')
    click(page, qa.get_by_role('button', name='Clear'), 500)
    click(page, qa.get_by_role('button', name='5', exact=True), 500)
    click(page, qa.get_by_role('button', name='plus 1/2'), 1200)
    click(page, qa.get_by_role('button', name='OK'), 1000)
    say(page, '− and + beside Turns move half a turn', speak='The minus and plus buttons beside Turns move it half a turn at a time.')
    rr = page.locator('#f-turns-RR').locator('xpath=ancestor::*[contains(@class,"cg-cell")][1]')
    click(page, rr.locator('button[aria-label^="More"]'), 900)
    click(page, rr.locator('button[aria-label^="Less"]'), 1200)
    jump(page, 'Wing')
    say(page, 'Angles have a Pick list', speak='Angles have a Pick list. Choose thirteen and a half degrees for the top wing.')
    qa = quick_add(page, '#f-wing_angle')
    click(page, qa.get_by_role('button', name='13.5°', exact=True), 900)
    click(page, qa.get_by_role('button', name='OK'), 1000)
    say(page, 'On a phone, the Angle finder measures it for you', speak='On a phone, the Angle finder measures an angle for you. Lay the phone along the part and read it off.')
    jump(page, 'Chassis')
    qa = quick_add(page, '#f-rake')
    click(page, qa.get_by_role('button', name='Angle finder'), 2500)
    click(page, qa.locator('button:has-text("✕")'), 900)
    say(page, 'Save', speak='Then save the sheet.')
    click(page, page.get_by_role('button', name='Save', exact=True), 1500)
    say(page, '', 300)


@video
def training_shock_rebuild(page):
    say(page, 'The RR shock is nearly due for a rebuild', speak='The RR shock is nearly due for its rebuild. Open it from Assets.')
    click(page, '.sidebar .nav-link:has-text("Assets")', 1200)
    click(page, page.locator('main a:has-text("RR Penske 8760")'), 1500)
    say(page, 'Lifecycle: 9 of its 10 races used', speak='Lifecycle shows nine of its ten races used.')
    say(page, 'Send it away: Edit, then Out for Service', speak='To send it away, press Edit and set its status to Out for Service.')
    click(page, page.locator('main a:has-text("Edit"), main button:has-text("Edit")'), 1500)
    page.select_option('#f-status', 'Out for Service'); page.wait_for_timeout(900)
    click(page, page.get_by_role('button', name='Save', exact=True), 1800)
    say(page, 'Back from the rebuild: a dyno run', speak='When it comes back, record a dyno run. Open Shock and bar dyno, then New shock run.')
    click(page, '.sidebar .nav-link:has-text("Shock & bar dyno")', 1200)
    click(page, page.locator('main :text-is("New shock run")'), 1500)
    page.select_option('#f-asset', label='RR Penske 8760'); page.wait_for_timeout(500)
    page.select_option('#f-purpose', 'After rebuild'); page.wait_for_timeout(700)
    say(page, 'One block per adjuster setting tested', speak='Pick the shock and set the purpose to After rebuild. Then add a block for each adjuster setting you tested.')
    if not page.locator('input[aria-label="Setting 1 label"]').count():
        click(page, page.get_by_role('button', name='+ Setting'), 1000)
    type_in(page, 'input[aria-label="Setting 1 label"]', 'As raced', 300)
    page.select_option('select[aria-label="Setting 1 test speed"]', label='6.00 in/s'); page.wait_for_timeout(500)
    say(page, 'Readings: force at each velocity', speak='Enter the readings: the force at each velocity, compression and rebound.')
    for row, (co, rc) in enumerate((('20', '45'), ('38', '90'), ('52', '130')), start=2):  # velocities 1, 2 and 3 in/s are filled in already
        type_in(page, page.locator(f'input[aria-label="CO row {row}"]').first, co, 150)
        type_in(page, page.locator(f'input[aria-label="RC row {row}"]').first, rc, 150)
    click(page, page.get_by_role('button', name='Save', exact=True), 1800)
    say(page, 'Then put it back In Service', speak='Then set the shock back to In Service, and its count starts again.')
    click(page, '.sidebar .nav-link:has-text("Assets")', 1200)
    click(page, page.locator('main a:has-text("RR Penske 8760")'), 1500)
    click(page, page.locator('main a:has-text("Edit"), main button:has-text("Edit")'), 1500)
    page.select_option('#f-status', 'In Service'); page.wait_for_timeout(800)
    click(page, page.get_by_role('button', name='Save', exact=True), 1800)
    say(page, '', 300)


@video
def training_parts_order(page):
    say(page, 'A mechanic asked for a shock rebuild kit', speak='A mechanic has asked for a shock rebuild kit. Open Business, then Parts orders.')
    click(page, '.sidebar .nav-link:has-text("Parts orders")', 1500)
    say(page, 'The crew chief approves it', speak='The crew chief, or the owner, approves it.')
    click(page, page.get_by_role('button', name='Approve', exact=True), 1500)
    click(page, 'main button:has-text("All")', 1000)
    click(page, page.locator('main .list-row:has-text("RR shock rebuild kit"), main a:has-text("RR shock rebuild kit")'), 1500)
    say(page, 'When it arrives: Record as an expense', speak='When the kit arrives, press Record as an expense. The expense is filled in from the order.')
    click(page, page.get_by_role('button', name='Record as an expense'), 2000)
    click(page, page.get_by_role('button', name='Save', exact=True), 1800)
    say(page, 'It’s in Finance, against round 9', speak='It’s now in Finance, against round 9 at Lakeside.')
    page.goto(f"{B}/events/{round9()['id']}"); page.wait_for_timeout(1800)
    page.locator('text=PROFIT & LOSS').first.scroll_into_view_if_needed(); page.wait_for_timeout(500)
    say(page, 'And in that meeting’s profit and loss', 3000, speak='And in that meeting’s profit and loss, with the order and the expense beside it.')
    say(page, '', 300)


@video
def training_load_list(page):
    say(page, 'Loading the hauler for round 9', speak='Loading the hauler for round 9. Open Business, then Transport, then Load lists.')
    click(page, '.sidebar .nav-link:has-text("Transport")', 1200)
    click(page, 'main button:has-text("Load lists")', 1000)
    click(page, page.locator('main :text-is("New load list")'), 1500)
    say(page, 'Pick the event, the vehicle and a template', speak='Pick the event, the vehicle and a template.')
    page.select_option('#f-event', round9()['id']); page.wait_for_timeout(700)
    page.select_option('#f-vehicle', label='Hauler'); page.wait_for_timeout(700)
    page.select_option('select[aria-label="Template"]', label='Sprint car race weekend'); page.wait_for_timeout(700)
    say(page, 'One press adds the car, its engines and the template', speak='One press adds the event’s car, its engines and the template’s standard items.')
    click(page, page.locator('main button:has-text("Add the event")'), 1500)
    page.locator('input[aria-label="Loaded row 1"]').scroll_into_view_if_needed(); page.wait_for_timeout(500)
    say(page, 'Tick Loaded as each thing goes on — no signal needed', speak='Tick Loaded as each thing goes on the trailer. It works with no signal.')
    for n in (1, 2, 3):
        click(page, f'input[aria-label="Loaded row {n}"]', 600)
    click(page, page.get_by_role('button', name='Save', exact=True), 1800)
    say(page, '3 loaded, 6 to go', 2500, speak='Three loaded, six to go. The list follows the trip to the track and back home.')
    say(page, '', 300)


@video
def training_sponsor(page):
    say(page, 'Partnerships: tonight’s guest arrives', speak='In Partnerships, tonight’s hospitality guest has arrived. Open Hospitality and check them in.')
    click(page, '.sidebar .nav-link:has-text("Partnerships")', 1200)
    click(page, 'main button:has-text("Hospitality")', 1200)
    sel = page.locator('main select[aria-label="Event"]')
    if sel.count():
        opt = sel.locator('option', has_text='Club night').first.get_attribute('value')
        sel.select_option(opt); page.wait_for_timeout(800)
    click(page, page.get_by_role('button', name='Check in').first, 1500)
    say(page, 'What we promised Valley Tyres', speak='Now open the sponsor, Valley Tyres.')
    click(page, 'main button:has-text("Sponsors")', 1000)
    click(page, page.locator('main .list-row:has-text("Valley Tyres"), main a:has-text("Valley Tyres")'), 1800)
    page.locator('text=WHAT WE PROMISED').first.scroll_into_view_if_needed(); page.wait_for_timeout(600)
    say(page, 'Each promise counts its own evidence', 3500,
        speak='What we promised counts its own evidence: the logo in a photo, a post for each event, and the hospitality passes tonight’s guest used.')
    page.locator('text=PAYMENTS & IN KIND').first.scroll_into_view_if_needed(); page.wait_for_timeout(600)
    say(page, 'Payments: the second invoice has been paid', speak='Under Payments and in kind, the second invoice has been paid. Press Mark received.')
    click(page, page.get_by_role('button', name='Mark received'), 1800)
    say(page, 'In kind: tyres instead of cash, recorded in Finance', speak='The tyres they give instead of cash go in Finance too: press Record in Finance.')
    click(page, page.get_by_role('button', name='Record in Finance'), 1800)
    say(page, 'Nothing outstanding', 2500, speak='Nothing outstanding, and the season’s budget shows what the tyres are really worth.')
    say(page, '', 300)


@video
def training_role(page):
    say(page, 'Team Management → Roles & permissions', speak='To decide who sees what, open Team Management, then Roles and permissions.')
    click(page, '.sidebar .nav-link:has-text("Roles & permissions")', 1500)
    say(page, 'Start with a standard role, or make your own', speak='Start with a standard role, or make your own. Press New role.')
    click(page, page.locator('main :text-is("New role")'), 1200)
    type_in(page, 'main .field:has(label:text-is("Role name")) input', 'Tyre person')
    type_in(page, 'main .field:has(label:text-is("Description")) input', 'Tyres, and reads the setup sheets')
    say(page, 'Tick an area first, then what’s in it', speak='Tick an area first, here At the Track, then choose what’s in it.')
    click(page, page.locator('main tr:has-text("At the Track") input[type=checkbox]').first, 900)
    say(page, 'View lets them see it. Edit lets them change it', speak='View lets them see a screen. Edit lets them change it. Tick only what they need.')
    for box in ('Setup sheets & advisor view', 'Gears & tires view', 'Gears & tires edit'):
        click(page, page.locator(f'main input[aria-label="{box}"]'), 500)
    say(page, 'Save role, then give it to people in Members & invites',
        speak='Save the role, then give it to people in Members and invites.')
    click(page, page.get_by_role('button', name='Save role'), 1800)
    say(page, '', 300)
    # roles aren't removed by a practice reset: take this one out again
    for r in call(f'/t/{TID}/roles', T)[1]:
        if r.get('name') == 'Tyre person':
            call(f'/t/{TID}/roles/{r["id"]}', T, 'DELETE')


@video
def training_backup(page):
    page.on('dialog', lambda d: d.accept())  # the delete confirmation
    say(page, 'Back up the team, and put it back', speak='Here’s how to back up the team, and put it back if something goes wrong.')
    click(page, '.sidebar .nav-link:has-text("Backups & export")', 1500)
    say(page, 'Back up now: everything in the team', speak='Press Back up now. It takes everything: records, setup sheets, parts, files, forms and roles.')
    click(page, page.get_by_role('button', name='Back up now'), 500)
    expect(page.locator('main')).to_contain_text('Backed up', timeout=60000); page.wait_for_timeout(1500)
    say(page, 'Now a mistake: Car 71 deleted', speak='Now a mistake. Someone deletes Car 71.')
    click(page, '.sidebar .nav-link:has-text("Cars")', 1000)
    click(page, page.locator('main a:has-text("Car 71")'), 1200)
    click(page, page.get_by_role('button', name='Delete', exact=True), 1500)
    say(page, 'Restore… on the backup', speak='Back on Backups, press Restore on the backup you made.')
    click(page, '.sidebar .nav-link:has-text("Backups & export")', 1500)
    click(page, page.locator('main tr:has(button:has-text("Restore…"))').first.locator('button:has-text("Restore…")'), 1200)
    say(page, 'Tick that you understand, then Restore the team', speak='Read what it does, tick that you understand, then press Restore the team.')
    click(page, page.get_by_label('I understand the team’s data will be replaced'), 600)
    click(page, page.get_by_role('button', name='Restore the team'), 500)
    expect(page.locator('main')).to_contain_text('Restored', timeout=60000); page.wait_for_timeout(1200)
    say(page, 'Restored. A safety backup was taken first', speak='Restored. A safety backup of the team was taken first, in case you need to undo it.')
    click(page, '.sidebar .nav-link:has-text("Cars")', 500)
    page.reload(); synced(page)  # devices download the restored team on their next sync; this makes it now
    expect(page.locator('main')).to_contain_text('Car 71', timeout=60000); page.wait_for_timeout(600)
    say(page, 'Car 71 is back', 2500, speak='And Car 71 is back.')
    say(page, '', 300)


# ---------------------------------------------------------------- record
def encode(raw, name, timeline=None):
    out = os.path.join(VIDEO_DIR, f'{name}.webm')
    narration.encode(raw, out, timeline)  # with a voice-over: the audio track and <name>.vtt too
    poster = os.path.join(IMG_DIR, f'{name}.webp')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '4', '-i', out, '-frames:v', '1', '-vf', 'scale=960:-2', poster], check=True)
    return out


def restore_prefs():
    if OWN_PREFS:
        call('/me', T, 'PATCH', {'prefs': OWN_PREFS})


try:
    if NARRATOR:
        prepare_voice()
    with sync_playwright() as pw:
        br = pw.chromium.launch(slow_mo=60)
        tmp = tempfile.mkdtemp()
        made, failed = [], []
        FAIL_DIR = os.path.normpath(os.path.join(ROOT, 'tools', '.video-failures'))  # ignored by Git
        for fn in VIDEOS:
            name = fn.__name__.replace('_', '-')
            if ONLY and name not in ONLY:
                continue
            ctx = br.new_context(viewport={'width': 1280, 'height': 720}, record_video_dir=tmp, record_video_size={'width': 1280, 'height': 720})
            ctx.add_init_script(INIT)
            page = ctx.new_page()
            TIMELINE = narration.Timeline() if NARRATOR else None  # recording starts with the page
            s = {'token': login['token'], 'user': login['user'], 'memberships': login['memberships'], 'platform': login.get('platform'), 'tenantId': TID}
            page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
            page.goto(B); synced(page); page.wait_for_timeout(800)
            ok = False
            try:
                fn(page)
                ok = True
            except Exception as e:  # keep the others going; leave a picture of the screen it stopped on
                os.makedirs(FAIL_DIR, exist_ok=True)
                shot = os.path.join(FAIL_DIR, f'{name}.png')
                try:
                    page.screenshot(path=shot, full_page=True)
                except Exception:
                    shot = None
                info = {'video': name, 'url': page.url, 'error': str(e).splitlines()[0][:400]}
                try:
                    info['page'] = page.evaluate("() => document.querySelector('main')?.innerText.slice(0, 2000) || document.body.innerText.slice(0, 2000)")
                except Exception:
                    pass
                with open(os.path.join(FAIL_DIR, f'{name}.json'), 'w', encoding='utf-8') as f:
                    json.dump(info, f, ensure_ascii=False, indent=1)
                failed.append(name)
                print(f'  {name}: FAILED — {info["error"]}\n    screen saved to {shot or os.path.join(FAIL_DIR, name + ".json")}; the video was not changed')
            finally:
                raw = page.video.path()
                if TIMELINE:
                    TIMELINE.stop()
                ctx.close()
            if not ok:
                call(f'/t/{TID}/practice/reset', T, 'POST', {})
                RECS[:] = call(f'/t/{TID}/sync?since=0', T)[1]['records']
                continue
            out = encode(raw, name, TIMELINE)
            made.append((name, os.path.getsize(out)))
            print(f'  {name}.webm  {os.path.getsize(out) // 1024} KB, {narration.duration(out):.0f} s' + (', with voice-over and captions' if TIMELINE else ''))
            # each video starts from the original demo data
            call(f'/t/{TID}/practice/reset', T, 'POST', {})
            RECS[:] = call(f'/t/{TID}/sync?since=0', T)[1]['records']
        shutil.rmtree(tmp, ignore_errors=True)
        br.close()
finally:
    restore_prefs()
print(f'Recorded {len(made)} videos into docs/guide/video. Remember to delete the "Practice — videos" team on that server.')
if failed:
    sys.exit(f'{len(failed)} failed: {", ".join(failed)}. See tools/.video-failures for what the screen showed.')
