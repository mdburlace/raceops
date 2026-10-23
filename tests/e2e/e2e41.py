# Release notes: every release in docs/releases shown in Help & guide → Release notes (newest in full, earlier
# ones listed and opened), the version in the sidebar and on Help, the one-off "updated" note on Home, the
# platform admin's Code repository setting and the GitHub links it adds, and the page on a phone.
import json, os, re, sys, urllib.request, urllib.error
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/')
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
errors = []

def call(path, token=None, method='GET', body=None):
    req = urllib.request.Request(B + '/api' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'content-type': 'application/json', **({'authorization': f'Bearer {token}'} if token else {})})
    try:
        r = urllib.request.urlopen(req); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')
login = lambda e='owner@test.com', p='password1': call('/auth/login', method='POST', body={'email': e, 'password': p})[1]

# the releases as the repo has them: newest first by version
def meta(f):
    head = open(os.path.join(ROOT, 'docs', 'releases', f)).read().split('---')[1]
    return dict(l.split(':', 1) for l in head.strip().splitlines() if ':' in l)
REL = [{k.strip(): v.strip() for k, v in meta(f).items()} for f in os.listdir(os.path.join(ROOT, 'docs', 'releases')) if f.endswith('.md')]
key = lambda r: [int(x) for x in r['version'].split('.')] + ([1] if r['version'].count('.') == 2 else [])
REL.sort(key=key, reverse=True)
LATEST = REL[0]
assert len(REL) >= 8 and any(r['version'] == '2026.10.18' for r in REL), 'past releases are there'

o = login(); OT = o['token']
# the code repository: only a GitHub address; tidied when saved
st, r = call('/admin/settings/general', OT, 'PUT', {'release_repo_url': 'https://gitlab.com/someone/raceops'}); assert st == 400, r
st, r = call('/admin/settings/general', OT, 'PUT', {'release_repo_url': 'https://github.com/mdburlace/raceops.git/'}); assert st == 200, r
assert r['release_repo_url'] == 'https://github.com/mdburlace/raceops', r
o = login(); assert o['platform']['release_repo_url'] == 'https://github.com/mdburlace/raceops'
TID = o['memberships'][0]['tenant_id']

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    s = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o.get('platform'), 'tenantId': TID}
    page.goto(B); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    shot = lambda n: page.screenshot(path=f'{OUT}/{n}.png', full_page=True)

    # ---- a device that has never seen a release starts up to date: no "updated" note
    expect(page.locator('h1')).to_contain_text("G'day")
    expect(page.locator('[data-testid="release-notice"]')).to_have_count(0)
    # ---- after an update: the note shows once, and × hides it for good
    page.evaluate("localStorage.setItem('raceops.release.seen', '2026.10.18')"); page.reload()
    note = page.locator('[data-testid="release-notice"]')
    expect(note).to_contain_text(f"version {LATEST['version']}"); expect(note).to_contain_text(LATEST['title'])
    shot('41-01-updated-note')
    note.get_by_role('button', name='Dismiss').click()
    expect(note).to_have_count(0)
    page.reload(); expect(page.locator('h1')).to_contain_text("G'day")
    expect(page.locator('[data-testid="release-notice"]')).to_have_count(0)

    # ---- the version in the sidebar opens the release notes
    v = page.locator('.sidebar-foot .app-version')
    expect(v).to_have_text(f"Version {LATEST['version']}")
    v.click()
    expect(page).to_have_url(f'{B}/help/releases')
    expect(page.locator('h1')).to_have_text('Release notes')
    latest = page.locator('.release-card.latest')
    expect(latest).to_have_attribute('data-release', LATEST['version'])
    expect(latest).to_contain_text('This version'); expect(latest).to_contain_text(LATEST['summary'])
    # its sections, in the standard order (any with nothing in them left out)
    heads = latest.locator('.release-sec h3').all_text_contents()
    order = ['New features', 'Improvements', 'Bug fixes', 'Notes']
    assert heads and all(h in order for h in heads) and heads == sorted(heads, key=order.index), heads
    expect(page.locator('.release-row')).to_have_count(len(REL) - 1)
    # the newest release has no commit range yet: its link lists that day's commits
    code = latest.locator('a:has-text("Code changes on GitHub")')
    expect(code).to_have_attribute('href', f"https://github.com/mdburlace/raceops/commits?since={LATEST['date']}&until={LATEST['date']}")
    shot('41-02-release-notes')

    # ---- an earlier release: its sections, its pull request and commit range, stepping between releases
    page.click('.release-row[data-release="2026.10.24"]')
    expect(page).to_have_url(f'{B}/help/releases/2026.10.24')
    expect(page.locator('h1')).to_have_text('Multi-day events')
    card = page.locator('.release-card')
    for h in ('New features', 'Improvements', 'Notes'):
        expect(card.locator(f'.release-sec h3:text-is("{h}")')).to_have_count(1)
    expect(card.locator('.release-sec h3:text-is("Bug fixes")')).to_have_count(0)       # left out: nothing in it
    expect(card.locator('a:has-text("Pull request #2")')).to_have_attribute('href', 'https://github.com/mdburlace/raceops/pull/2')
    expect(card.locator('a:has-text("Code changes on GitHub")')).to_have_attribute('href', 'https://github.com/mdburlace/raceops/compare/86bb53c...56770e0')
    page.click('.release-nav a:has-text("Backups, training")')
    expect(page).to_have_url(f'{B}/help/releases/2026.10.23')
    expect(page.locator('.release-sec[data-section="fixes"] li')).to_have_count(3)
    page.goto(B + '/help/releases/2026.10.18')
    expect(page.locator('h1')).to_have_text('First release')
    expect(page.locator('.release-nav a')).to_have_count(1)                                 # nothing older
    page.goto(B + '/help/releases/1999.01.01')
    expect(page.locator('h1')).to_have_text('Release not found')

    # ---- Help & guide: the release notes card and the article
    page.goto(B + '/help')
    card = page.locator('[data-testid="help-releases"]')
    expect(card).to_contain_text(f"Version {LATEST['version']}")
    card.click(); expect(page).to_have_url(f'{B}/help/releases')
    page.goto(B + '/help/release-notes')
    expect(page.locator('h1')).to_have_text('Release notes')
    expect(page.locator('.help-article')).to_contain_text('Code repository')

    # ---- no code repository: no links
    page.goto(B + '/admin/settings')
    expect(page.locator('#s-repo')).to_have_value('https://github.com/mdburlace/raceops')
    page.fill('#s-repo', '')
    page.get_by_role('button', name='Save settings').click()
    expect(page.locator('text=Settings saved.')).to_be_visible()
    assert call('/admin/settings', OT)[1]['general']['release_repo_url'] == ''
    page.goto(B + '/help/releases')
    expect(page.locator('.release-card.latest')).to_be_visible()
    expect(page.locator('[data-testid="release-links"]')).to_have_count(0)

    # ---- phone
    m = br.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    m.on('pageerror', lambda e: errors.append(str(e)))
    m.goto(B); m.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
    m.goto(B + '/help/releases')
    expect(m.locator('.release-card.latest')).to_be_visible()
    assert m.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'no sideways scrolling'
    m.screenshot(path=f'{OUT}/41-03-mobile.png')
    br.close()

assert not errors, errors
print('E2E41 OK')
