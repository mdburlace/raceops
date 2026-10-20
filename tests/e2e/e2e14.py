import os
import json, sys, urllib.request
from playwright.sync_api import sync_playwright, expect
B = os.environ.get('RACEOPS_URL', 'http://localhost:8080').rstrip('/'); OUT = sys.argv[1]; errors = []
o = json.loads(urllib.request.urlopen(urllib.request.Request(B + '/api/auth/login', data=json.dumps({'email': 'owner@test.com', 'password': 'password1'}).encode(), headers={'content-type': 'application/json'})).read())
TID = o['memberships'][0]['tenant_id']
sess = {'token': o['token'], 'user': o['user'], 'memberships': o['memberships'], 'platform': o['platform'], 'tenantId': TID}
recs = json.loads(urllib.request.urlopen(urllib.request.Request(B + f'/api/t/{TID}/sync?since=0', headers={'authorization': 'Bearer ' + o['token']})).read())['records']
sid = [r for r in recs if r['type'] == 'setup'][0]['id']
box = lambda p, sel: p.locator(sel).first.bounding_box()
with sync_playwright() as pw:
    br = pw.chromium.launch()
    for name, vp, mob in [('desk', {'width': 1366, 'height': 800}, False), ('mob', {'width': 390, 'height': 844}, True)]:
        p = br.new_context(viewport=vp, is_mobile=mob, has_touch=mob).new_page()
        p.on('pageerror', lambda e: errors.append(str(e)))
        p.goto(B); p.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(sess))})")
        p.goto(B); expect(p.locator('text=Synced')).to_be_visible(timeout=30000)
        # setup sheet: title + AI bar stay under the top bar
        p.goto(B + f'/r/setup/{sid}'); expect(p.locator('.page-head h1')).to_be_visible()
        p.evaluate('window.scrollTo(0, 1500)'); p.wait_for_timeout(400)
        assert p.evaluate("document.documentElement.classList.contains('scrolled')")
        top = box(p, '.topbar'); head = box(p, '.page-head')
        assert abs(head['y'] - (top['y'] + top['height'])) <= 2, (name, top, head)
        assert box(p, '.page-head h1')['y'] >= 0 and p.locator('.page-head .ai-bar').is_visible(), name
        expect(p.locator('.page-head button:has-text("Voice debrief")')).to_be_in_viewport()
        # fields scrolled into view aren't hidden behind the header (scroll-padding)
        p.locator('#f-notes').scroll_into_view_if_needed(); p.locator('#f-notes').focus()
        assert box(p, '#f-notes')['y'] >= head['y'] + head['height'] - 2, (name, box(p, '#f-notes'), head)
        p.screenshot(path=f'{OUT}/p14-{name}-setup.png')
        # back at the top the full header returns
        p.evaluate('window.scrollTo(0, 0)'); p.wait_for_timeout(300)
        assert not p.evaluate("document.documentElement.classList.contains('scrolled')")
        if not mob:
            # calculators: the right column stays below the title row while the list scrolls
            p.goto(B + '/calculators?c=air'); expect(p.locator('.calc-detail h2')).to_have_text('Air correction')
            p.mouse.move(400, 500); p.mouse.wheel(0, 2500); p.wait_for_timeout(500)
            d = box(p, '.calc-detail'); hh = box(p, '.page-head')
            assert p.evaluate('window.scrollY') > 500
            assert d['y'] >= hh['y'] + hh['height'] - 1 and d['y'] < 200, (d, hh)
            assert d['y'] + d['height'] <= vp['height'] + 1, d
            p.screenshot(path=f'{OUT}/p14-desk-calc.png')
        # calculators list: area buttons + search stay pinned under the title
        p.goto(B + '/calculators'); expect(p.locator('.calc-item').first).to_be_visible()
        p.evaluate('window.scrollTo(0, 2000)'); p.wait_for_timeout(500)
        assert p.evaluate('window.scrollY') > 500
        f = box(p, '.calc-filters'); hh = box(p, '.page-head')
        assert abs(f['y'] - (hh['y'] + hh['height'])) <= 2, (name, f, hh)
        expect(p.locator('input[aria-label="Search calculators"]')).to_be_in_viewport()
        expect(p.locator('.calc-areas button:has-text("Engines")')).to_be_in_viewport()
        p.fill('input[aria-label="Search calculators"]', 'bobweight')
        expect(p.locator('.calc-item')).to_have_count(1)
        p.screenshot(path=f'{OUT}/p14-{name}-calc-filters.png')
        w = p.evaluate('document.documentElement.scrollWidth'); assert w <= vp['width'] + 1, w
    br.close()
print('errors:', errors); assert not errors
print('E2E14 OK')
