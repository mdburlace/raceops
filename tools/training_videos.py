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
    AWS_PROFILE=raceops-voice python3 tools/training_videos.py --tts polly …      # Amazon Polly, Olivia (needs boto3)
    python3 tools/training_videos.py --tts piper --voice ~/voices/en_GB-alba-medium.onnx …
    python3 tools/training_videos.py --tts none …     # silent, with just the caption bar

The default, auto, uses Azure when AZURE_SPEECH_KEY is set, Amazon Polly when AWS credentials or AWS_PROFILE are
set, Piper when PIPER_VOICE is set, and otherwise none.
Every line is turned into speech before recording starts, so the video doesn't pause while a voice is made.
"""
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
ap.add_argument('--voice', help='voice name (Azure, default en-AU-NatashaNeural; Polly, default Olivia) or model file (Piper)')
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
    page.locator('.list-row:has-text("Rd 9")').first.scroll_into_view_if_needed(); page.wait_for_timeout(800)
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
        made = []
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
            try:
                fn(page)
            finally:
                raw = page.video.path()
                if TIMELINE:
                    TIMELINE.stop()
                ctx.close()
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
