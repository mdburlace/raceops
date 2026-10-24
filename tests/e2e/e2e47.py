# Full team budget and a fuller sponsor record: new expense categories and income kinds on every team's
# forms, the budget in groups, the contingency reserve (drawn down by Crash & failure repairs and by ticked
# expenses, in Reminders when low), the income budget against what's received; the sponsor's billing
# contact, links, industry, renewal outlook, activation and exclusivity, the interaction log (added from the
# sponsor page, follow-up in the pipeline and Reminders), the exclusivity clash, promise status (Deployed =
# done, proof photo, off Reminders) on the page, the season report and the sponsor's own page; a phone.
import json, os, re, sys, time, uuid, urllib.request, urllib.error
from datetime import date, datetime, timedelta, timezone
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
login = lambda e='owner@test.com', p='password1': call('/auth/login', method='POST', body={'email': e, 'password': p})[1]
now = lambda: datetime.now(timezone.utc).isoformat()
day = lambda n: (date.today() + timedelta(days=n)).isoformat()

o = login(); OT = o['token']
st, t = call('/admin/tenants', OT, 'POST', {'name': 'Budget Racing', 'plan': 'pro', 'practice': True}); assert st == 200, t; TID = t['id']
o = login(); OT = o['token']
recs = lambda: [r for r in call(f'/t/{TID}/sync?since=0', OT)[1]['records'] if not r['global'] and not r['deleted']]
rec = lambda id: next(r for r in recs() if r['id'] == id)
def push(r, vals, **kw):
    res = call(f'/t/{TID}/sync', OT, 'POST', {'changes': [{'id': r['id'] if r else str(uuid.uuid4()), 'type': kw.get('type') or r['type'],
        'data': {**(r['data'] if r else {}), 'values': vals}, 'client_updated_at': now()}]})[1]['results'][0]
    assert res['status'] == 'applied', res
    return res['record']
def until(fn, secs=15):
    end = time.time() + secs
    while True:
        try:
            if fn(): return
        except (KeyError, TypeError, StopIteration): pass
        if time.time() > end: raise AssertionError('timed out waiting')
        time.sleep(0.5)
R = recs()
form = lambda target: next(r for r in R if r['type'] == 'form' and r['data'].get('target') == target)
fields = lambda target: {f['key']: f for s in form(target)['data']['sections'] for f in s['fields']}
valley = next(r for r in R if r['type'] == 'sponsor' and r['data']['values']['name'] == 'Valley Tyres')
lakeside = next(r for r in R if r['type'] == 'sponsor' and r['data']['values']['name'] == 'Lakeside Motors')
budget = next(r for r in R if r['type'] == 'budget')
media = next(r for r in R if r['type'] == 'media')

# ---- the forms: new categories, kinds, fields and columns
ef, inf, bf, sf = fields('expense'), fields('income'), fields('budget'), fields('sponsor')
for c in ('Car purchase & lease', 'Per diems & catering', 'Track hire & testing', 'Crash & failure repairs'):
    assert c in ef['category']['options'], c
assert ef['category']['options'][-1] == 'Other' and 'from_contingency' in ef
for k in ('Seat fee / driver contribution', 'Series stipend / subsidy', 'In-kind sponsorship'): assert k in inf['kind']['options'], k
assert 'contingency_pct' in bf and [c['key'] for c in bf['income_lines']['columns']] == ['kind', 'amount', 'note']
assert 'Crash & failure repairs' in next(c for c in bf['lines']['columns'] if c['key'] == 'category')['options']
for k in ('billing_contact', 'links', 'industry', 'renewal_likelihood', 'renewal_discussed', 'exclusive', 'exclusivity', 'activation', 'interactions'): assert k in sf, k
cols = {c['key']: c for c in sf['deliverables']['columns']}
assert list(cols)[-3:] == ['status', 'status_date', 'proof'] and cols['proof']['ref'] == 'media' and 'PA announcement' in cols['kind']['options']

with sync_playwright() as pw:
    br = pw.chromium.launch()
    page = br.new_page(viewport={'width': 1366, 'height': 900})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(m.text))
    def session(lg):
        s = {'token': lg['token'], 'user': lg['user'], 'memberships': lg['memberships'], 'platform': lg.get('platform'), 'tenantId': TID}
        page.goto(B); page.wait_for_load_state('networkidle'); page.evaluate(f"localStorage.setItem('raceops.session', {json.dumps(json.dumps(s))})")
        page.goto(B); expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    shot = lambda n, full=True: page.screenshot(path=f'{OUT}/{n}.png', full_page=full)
    synced = lambda: expect(page.locator('text=Synced')).to_be_visible(timeout=30000)
    session(o)

    # ---- the budget in groups, the reserve and the income budget
    page.goto(B + '/finance?tab=budget')
    groups = page.locator('[data-testid="budget-group"]')
    expect(groups.filter(has_text='Parts, maintenance & consumables')).to_be_visible()
    expect(groups.filter(has_text='Vehicle & hardware')).to_be_visible()
    expect(groups.filter(has_text='Contingency')).to_be_visible()      # the crash repair, unbudgeted
    reserve = page.locator('[data-testid="reserve"]')
    expect(reserve).to_contain_text('5,625')          # 15% of the 37,500 of other lines
    expect(reserve).to_contain_text('1,350')          # the crash repair
    expect(reserve).to_contain_text('4,275')
    inc = page.locator('[data-testid="income-budget"]')
    expect(inc.locator('tr', has_text='Sponsorship')).to_contain_text('12,000')
    expect(inc.locator('tr', has_text='Sponsorship')).to_contain_text('50%')
    expect(inc.locator('tr', has_text='Seat fee / driver contribution')).to_contain_text('0%')
    shot('47-01-budget')
    # a seat fee comes in; a ticked expense in another category and a big crash draw the reserve down
    push(None, {'date': day(-1), 'kind': 'Seat fee / driver contribution', 'description': 'Second driver, round 9', 'amount': '3000', 'paid': True}, type='income')
    push(None, {'date': day(-2), 'category': 'Parts', 'description': 'Bent wing post after contact', 'amount': '500', 'from_contingency': True, 'paid': True}, type='expense')
    push(None, {'date': day(-1), 'category': 'Crash & failure repairs', 'description': 'Frame straightening', 'amount': '3000', 'paid': True}, type='expense')
    page.goto(B + '/'); synced()
    page.goto(B + '/finance?tab=budget')
    expect(reserve).to_contain_text('4,850')           # 1,350 + 500 + 3,000
    expect(reserve).to_contain_text('3 expenses')
    expect(inc.locator('tr', has_text='Seat fee / driver contribution')).to_contain_text('100%')
    page.goto(B + '/reminders')
    expect(page.locator('main')).to_contain_text(re.compile(r'Contingency reserve: 86% used'))

    # ---- the sponsor page: contacts and links, industry, renewal, relationship
    contact = push(None, {'first_name': 'Robin', 'last_name': 'Accounts', 'organisation': 'Valley Tyres', 'email': 'ap@valleytyres.example', 'tags': ['Sponsor']}, type='contact')
    v = rec(valley['id'])['data']['values']
    push(rec(valley['id']), {**v, 'billing_contact': contact['id']})
    page.goto(B + '/'); synced()
    page.goto(B + f'/partners/sponsors/{valley["id"]}')
    expect(page.locator('[data-testid="sponsor-industry"]')).to_have_text('Tyres · exclusive')
    expect(page.locator('[data-testid="sponsor-renewal"]')).to_contain_text('Open to renewing: Maybe')
    ct = page.locator('[data-testid="sponsor-contacts"]')
    expect(ct).to_contain_text('Billing'); expect(ct).to_contain_text('Robin Accounts')
    expect(ct.locator('a[href="https://valleytyres.example"]')).to_have_text('valleytyres.example')
    rel = page.locator('[data-testid="relationship"]')
    expect(rel).to_contain_text('Wants a 10% discount code')
    expect(rel).to_contain_text('The only tyre brand on the car and the trailer.')
    expect(page.locator('[data-testid="follow-up"]')).to_contain_text('Talked renewal')
    expect(page.locator('[data-testid="interactions"] .list-row')).to_have_count(2)
    expect(page.locator('[data-testid="interactions"] .list-row').first).to_contain_text('Call')
    # log a call with a follow-up
    add = page.locator('[data-testid="add-interaction"]')
    add.get_by_label('How').select_option('Email')
    add.get_by_label('What happened').fill('Sent the mid-season report')
    add.get_by_label('Follow up by').fill(day(2))
    add.get_by_role('button', name='Add to history').click()
    expect(page.locator('[data-testid="interactions"] .list-row')).to_have_count(3)
    expect(page.locator('[data-testid="interactions"] .list-row').first).to_contain_text('Sent the mid-season report')
    expect(page.locator('[data-testid="follow-up"]')).to_contain_text('Sent the mid-season report')
    until(lambda: len(rec(valley['id'])['data']['values']['interactions']) == 3)
    last = rec(valley['id'])['data']['values']['interactions'][-1]
    assert last['kind'] == 'Email' and last['who'] == o['user']['id'] and last['follow_up'] == day(2) and last['date'] == day(0), last
    page.goto(B + '/reminders')
    expect(page.locator('main')).to_contain_text('Valley Tyres: follow up (Sent the mid-season report)')
    page.goto(B + '/partners')
    vrow = page.locator('[data-testid="pipeline"] .list-row', has_text='Valley Tyres')
    expect(vrow).to_contain_text('renewing: Maybe'); expect(vrow).to_contain_text('Follow up')

    # ---- promise status: approved → deployed, with a proof photo
    page.goto(B + f'/partners/sponsors/{valley["id"]}')
    suit = page.locator('[data-testid="deliverables"] tr', has_text='Suit / helmet')
    expect(suit).to_contain_text('Approved by sponsor'); expect(suit).to_contain_text('Not yet')
    v = rec(valley['id'])['data']['values']
    dl = [dict(d, status='Deployed', status_date=day(0), proof=media['id'], due=day(3)) if d.get('kind') == 'Suit / helmet' else d for d in v['deliverables']]
    dl.append({'kind': 'PA announcement', 'detail': 'Before each feature', 'qty': '1', 'per': 'Event', 'due': day(4), 'status': 'Planned'})
    push(rec(valley['id']), {**v, 'deliverables': dl})
    page.goto(B + '/'); synced()
    page.goto(B + f'/partners/sponsors/{valley["id"]}')
    expect(suit).to_contain_text('Deployed'); expect(suit).to_contain_text('Done')
    expect(suit.locator('a', has_text='Proof')).to_have_attribute('href', f'/r/media/{media["id"]}')
    expect(page.locator('[data-testid="deliverables"] tr', has_text='PA announcement')).to_contain_text('Planned')
    shot('47-02-sponsor')
    page.goto(B + '/reminders')
    expect(page.locator('main')).to_contain_text('Valley Tyres: PA announcement')
    expect(page.locator('main')).not_to_contain_text('Valley Tyres: Suit / helmet')     # deployed: off Reminders
    page.goto(B + f'/print/sponsor/{valley["id"]}')
    expect(page.locator('[data-testid="sponsor-print"]')).to_contain_text(re.compile(r'Suit / helmet — Driver suit sleeve\s*Done'))
    # the sponsor's own page shows the status
    st, portal = call(f'/t/{TID}/sponsors/{valley["id"]}/portal', OT, 'POST'); assert st == 200, portal
    tok = portal.get('portal', portal).get('token')
    pub = call(f'/public/sponsor/{tok}')[1]
    suit_pub = next(d for d in pub['deliverables'] if d['kind'] == 'Suit / helmet')
    assert suit_pub['status'] == 'Deployed' and suit_pub['done'] == suit_pub['target'], suit_pub
    assert 'interactions' not in json.dumps(pub) and 'exclusivity' not in json.dumps(pub)

    # ---- exclusivity: another tyre company in play clashes, on both pages
    page.goto(B + f'/partners/sponsors/{lakeside["id"]}')
    expect(page.locator('[data-testid="exclusivity-clash"]')).to_have_count(0)
    push(rec(lakeside['id']), {**rec(lakeside['id'])['data']['values'], 'industry': 'tyres'})
    page.goto(B + '/'); synced()
    page.goto(B + f'/partners/sponsors/{lakeside["id"]}')
    expect(page.locator('[data-testid="exclusivity-clash"]')).to_contain_text('Valley Tyres')
    expect(page.locator('[data-testid="exclusivity-clash"]')).to_contain_text('Valley Tyres are exclusive in Tyres')
    page.goto(B + f'/partners/sponsors/{valley["id"]}')
    expect(page.locator('[data-testid="exclusivity-clash"]')).to_contain_text('Lakeside Motors')
    # an ended deal doesn't clash
    push(rec(lakeside['id']), {**rec(lakeside['id'])['data']['values'], 'stage': 'Ended'})
    page.goto(B + '/'); synced()
    page.goto(B + f'/partners/sponsors/{valley["id"]}')
    expect(page.locator('[data-testid="exclusivity-clash"]')).to_have_count(0)

    # ---- the forms show the new parts
    page.goto(B + f'/r/sponsor/{valley["id"]}')
    expect(page.locator('main')).to_contain_text('Billing contact')
    expect(page.locator('main')).to_contain_text('Open to renewing?')
    expect(page.locator('main')).to_contain_text('Interaction history')
    page.goto(B + f'/r/budget/{budget["id"]}')
    expect(page.locator('main')).to_contain_text('Income budget')
    expect(page.locator('#f-contingency_pct')).to_have_value('15')

    # ---- a phone
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(B + f'/partners/sponsors/{valley["id"]}'); page.wait_for_timeout(500)
    shot('47-03-sponsor-phone')
    sw = page.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, sw
    page.goto(B + '/finance?tab=budget'); page.wait_for_timeout(500)
    shot('47-04-budget-phone')
    br.close()

assert not errors, errors
print('E2E47 OK')
