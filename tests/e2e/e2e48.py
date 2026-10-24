# Training videos: the Training videos page lists every video, each with its poster, and a video with a voice-over
# has an audio track and captions of the words spoken (an English captions track, off until CC, that shows the words when on);
# the training start page and a role's exercises link to it, and a video without a .vtt gets no track.
import json, os, re, subprocess, sys, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
VIDEO_DIR = os.path.join(ROOT, 'docs', 'guide', 'video')
errors = []

def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

o = call('/auth/login', method='POST', body={'email': 'owner@test.com', 'password': 'password1'})[1]
videos = sorted(f[:-5] for f in os.listdir(VIDEO_DIR) if f.endswith('.webm'))
narrated = [v for v in videos if os.path.exists(os.path.join(VIDEO_DIR, f'{v}.vtt'))]
assert len(videos) >= 5, videos

# the files themselves: a narrated video has VP9 picture and Opus sound, and its captions file is WebVTT
for v in narrated:
    codecs = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', os.path.join(VIDEO_DIR, f'{v}.webm')],
                            capture_output=True, text=True, check=True).stdout.split()
    assert codecs == ['vp9', 'opus'], (v, codecs)
    vtt = open(os.path.join(VIDEO_DIR, f'{v}.vtt'), encoding='utf-8').read()
    assert vtt.startswith('WEBVTT') and re.search(r'\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}', vtt), v

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    s = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': o['memberships'][0]['tenant_id']}
    page.goto(B); page.wait_for_load_state('networkidle'); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)

    # the training start page links to the videos page
    page.goto(B + '/help/training')
    link = page.locator('a[href="/help/training-videos"]').first
    expect(link).to_be_visible(timeout=15000)
    link.click()
    expect(page.locator('h1:has-text("Training videos")')).to_be_visible(timeout=15000)
    page.screenshot(path=f'{OUT}/01-videos-page.png', full_page=True)

    # every video, with its poster; the narrated ones with an English captions track that's off to start with
    figs = page.locator('figure.guide-video')
    expect(figs).to_have_count(len(videos))
    info = page.evaluate("""() => [...document.querySelectorAll('figure.guide-video video')].map(v => ({
        src: v.getAttribute('src'), poster: v.getAttribute('poster'), preload: v.getAttribute('preload'),
        track: v.querySelector('track') && { kind: v.querySelector('track').kind, lang: v.querySelector('track').srclang,
                                              def: v.querySelector('track').default, src: v.querySelector('track').getAttribute('src') } }))""")
    for i in info:
        assert i['poster'] and i['preload'] == 'none', i
    with_track = [i for i in info if i['track']]
    assert len(with_track) == len(narrated), (len(with_track), narrated)
    for i in with_track:
        assert i['track']['kind'] == 'captions' and i['track']['lang'] == 'en' and not i['track']['def'], i
        # small captions files are inlined by the build (a data: link), bigger ones are served as files
        st = page.evaluate('src => fetch(src).then(r => r.text())', i['track']['src'])
        assert st.startswith('WEBVTT'), i

    # a narrated video plays with its captions showing the words being said
    if narrated:
        n = next(k for k, i in enumerate(info) if i['track'])
        vid = page.locator('figure.guide-video video').nth(n)
        vid.scroll_into_view_if_needed()
        assert vid.evaluate('v => v.textTracks[0].mode') != 'showing'  # off until the viewer turns on CC
        vid.evaluate("v => { v.textTracks[0].mode = 'showing'; v.muted = true; return v.play(); }")  # as pressing CC does
        page.wait_for_function("""(n) => { const v = document.querySelectorAll('figure.guide-video video')[n];
            const t = v.textTracks[0]; return t && t.mode === 'showing' && t.cues && t.cues.length > 0 && v.currentTime > 0.5; }""", arg=n, timeout=20000)
        vid.evaluate('v => { v.pause(); v.currentTime = v.textTracks[0].cues[0].startTime + 0.5; }')
        page.wait_for_function("""(n) => { const t = document.querySelectorAll('figure.guide-video video')[n].textTracks[0];
            return t.activeCues && t.activeCues.length > 0; }""", arg=n, timeout=10000)
        said = vid.evaluate('v => v.textTracks[0].activeCues[0].text')
        assert len(said) > 10, said
        audio = vid.evaluate('v => v.mozHasAudio ?? (v.webkitAudioDecodedByteCount > 0 || (v.audioTracks ? v.audioTracks.length > 0 : null))')
        assert audio is not False, 'no sound in a narrated video'
        page.screenshot(path=f'{OUT}/02-captions.png')

    # a role's exercises still have their video at the top
    page.goto(B + '/help/training-crew-chief')
    expect(page.locator('figure.guide-video video')).to_have_count(1, timeout=15000)
    page.screenshot(path=f'{OUT}/03-role-video.png')
    br.close()

assert not errors, errors
print(f'e2e48 OK: {len(videos)} training videos, {len(narrated)} with voice-over and captions')
