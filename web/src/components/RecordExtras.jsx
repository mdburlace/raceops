// Tools shown on a record's page for the phase 5 types: approving parts orders, the setup sheet's
// change list and tyre targets, results posts (draft, approve, share), load lists built from the
// event, trip costs to an expense, and the tax in an expense.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { allFields, fmtDate, memberName, num, titleOf, today, v } from '../lib/data.js';
import { saveRecord } from '../lib/store.js';
import { useSession } from '../lib/session.jsx';
import { draftPost } from '@shared/partners.js';
import { loadItemsFor } from '@shared/raceNight.js';
import { fmtMoney } from '@shared/regions.js';
import { purchaseTotal } from '@shared/finance.js';

const show = (x, data) => {
  if (x === undefined || x === null || x === '') return '';
  if (typeof x === 'object' && x.asset) return titleOf(data.byId[x.asset], data);
  if (typeof x === 'object') return JSON.stringify(x);
  return String(x);
};

/** Setup sheet → Change list: fill it from what changed on this sheet against the copied session. */
export function ChangeListTools({ form, values, changed, data, readOnly, setValues }) {
  if (readOnly) return null;
  const list = Array.isArray(values.change_list) ? values.change_list : [];
  const label = (k) => allFields(form).find((f) => f.key === k)?.label || k;
  const rows = [];
  for (const [k, c] of Object.entries(changed || {})) {
    if (k === 'change_list') continue;
    if (c.corners) for (const corner of Object.keys(c.corners)) rows.push({ change: `${corner} ${label(k)}`, was: show(c.prev?.[corner], data), now: show(values[k]?.[corner], data) });
    else rows.push({ change: label(k), was: show(c.prev, data), now: show(values[k], data) });
  }
  const fresh = rows.filter((r) => !list.some((x) => x.change === r.change && x.now === r.now));
  return (
    <div className="inline-row wrap change-tools">
      <button type="button" className="btn small" disabled={!fresh.length} data-testid="add-changes"
        onClick={() => setValues((x) => ({ ...x, change_list: [...(Array.isArray(x.change_list) ? x.change_list : []), ...fresh] }))}>
        Add changes from this sheet{fresh.length ? ` (${fresh.length})` : ''}</button>
      <span className="muted small">{list.length ? `${list.filter((r) => r.done).length} of ${list.length} done` : 'Changes you make on this sheet, against the session it was copied from, can be added as jobs for the car chief.'}</span>
    </div>
  );
}

/** Setup sheet → Tyre targets: how the tyres were set against the crew chief's targets. */
export function TyreTargets({ values }) {
  const rows = [];
  const tp = values.target_pressure || {}; const pc = values.pressure_cold || {};
  for (const c of ['LF', 'RF', 'LR', 'RR']) {
    if (num(tp[c]) === null) continue;
    const diff = num(pc[c]) === null ? null : num(pc[c]) - num(tp[c]);
    rows.push({ k: `${c} pressure`, want: tp[c], set: pc[c] ?? '', diff });
  }
  if (num(values.target_stagger) !== null) {
    const diff = num(values.stagger_cold) === null ? null : num(values.stagger_cold) - num(values.target_stagger);
    rows.push({ k: 'Stagger', want: values.target_stagger, set: values.stagger_cold ?? '', diff });
  }
  const ts = values.target_spacing || {}; const ws = values.wheel_spacing || {};
  for (const c of ['LR', 'RR']) {
    if (num(ts[c]) === null) continue;
    const diff = num(ws[c]) === null ? null : num(ws[c]) - num(ts[c]);
    rows.push({ k: `${c} spacing`, want: ts[c], set: ws[c] ?? '', diff });
  }
  if (!rows.length) return null;
  return (
    <table className="table compact tyre-targets" data-testid="tyre-targets">
      <thead><tr><th>Tyre sheet</th><th>Target</th><th>Set</th><th /></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.k}><td>{r.k}</td><td>{r.want}</td><td>{r.set || '—'}</td>
          <td>{r.diff === null ? <span className="muted small">not set</span> : Math.abs(r.diff) < 0.001 ? <span className="pill pill-ok">on target</span> : <span className="pill pill-warn">{r.diff > 0 ? '+' : ''}{Math.round(r.diff * 100) / 100}</span>}</td></tr>
      ))}</tbody>
    </table>
  );
}

/** Parts order: Approve / Decline for those who can, and turning a received order into an expense. */
export function PurchaseTools({ rec, values }) {
  const { tid, user, can, canType, canMoney } = useSession();
  const nav = useNavigate();
  if (!rec) return null;
  const status = values.status || 'Requested';
  const decide = async (st) => {
    await saveRecord(tid, 'purchase', rec.id, { ...rec.data, values: { ...rec.data.values, status: st, approved_by: user.id, approved_on: today() } }, user.id);
    nav('/purchases', { replace: true }); // this page's form still holds the old status
  };
  const toExpense = () => {
    const q = new URLSearchParams({ category: 'Parts', description: values.item || '', reference: values.order_ref || '', purchase: rec.id });
    if (values.event) q.set('event', values.event);
    if (values.car) q.set('car', values.car);
    if (values.supplier) q.set('supplier', values.supplier);
    const total = purchaseTotal(rec);
    if (canMoney && total) q.set('amount', String(total));
    nav(`/r/expense/new?${q}`);
  };
  return (
    <div className="card inline-row wrap" data-testid="purchase-tools">
      <span className="grow">Status: <b>{status}</b>{values.approved_by ? ` · ${status === 'Declined' ? 'declined' : 'approved'} by ${memberName(values.approved_by)}${values.approved_on ? ` on ${fmtDate(values.approved_on)}` : ''}` : ''}</span>
      {can('purchases.approve') && status === 'Requested' && (
        <>
          <button type="button" className="btn small primary" onClick={() => decide('Approved')}>Approve</button>
          <button type="button" className="btn small ghost danger" onClick={() => decide('Declined')}>Decline</button>
        </>
      )}
      {canType('expense', 'edit') && ['Approved', 'Ordered', 'Received'].includes(status) && !values.expense && (
        <button type="button" className="btn small" onClick={toExpense}>Record as an expense</button>
      )}
      {values.expense && <Link className="btn small ghost" to={`/r/expense/${values.expense}`}>Open the expense</Link>}
    </div>
  );
}

/** Expense / income: the tax in the amount when it isn't entered. */
export function TaxHint({ values }) {
  const { region, canMoney } = useSession();
  if (!canMoney || values.tax_amount || !num(values.amount) || !region.tax.rate) return null;
  const tax = (num(values.amount) * region.tax.rate) / (100 + region.tax.rate);
  return <p className="muted small" data-testid="tax-hint">Includes about {fmtMoney(tax, values.currency || region.currency)} {region.tax.name} at {region.tax.rate}% (the export uses this unless you enter the tax from the receipt).</p>;
}

/** Results post: draft from the result (or with AI), approve, then share. */
export function PostTools({ rec, values, setValues, readOnly, data }) {
  const { tid, user, canModule, membership } = useSession();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const event = data.byId[values.event];
  const sponsors = (values.sponsors || []).map((id) => data.byId[id]).filter(Boolean);
  const local = () => setValues((x) => ({ ...x, text: draftPost(data.list, data.byId, event, { team: membership?.tenant_name, sponsors }) }));
  const ai = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api(`/t/${tid}/ai/post`, { method: 'POST', body: { event: values.event, sponsors: values.sponsors || [] } });
      setValues((x) => ({ ...x, text: r.text, hashtags: x.hashtags || r.hashtags }));
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const fullText = [values.text, values.hashtags].filter(Boolean).join('\n\n');
  const share = async () => {
    setMsg('');
    try {
      if (navigator.share) await navigator.share({ text: fullText });
      else { await navigator.clipboard.writeText(fullText); setMsg('Copied — paste it into the app you post with.'); }
    } catch { /* closed the share sheet */ }
  };
  const approve = () => setValues((x) => ({ ...x, status: 'Approved', approved_by: user.id }));
  const posted = async () => {
    if (!rec) return;
    await saveRecord(tid, 'social_post', rec.id, { ...rec.data, values: { ...rec.data.values, ...values, status: 'Posted', posted_on: values.posted_on || today() } }, user.id);
    nav('/marketing', { replace: true });
  };
  return (
    <div className="card inline-row wrap" data-testid="post-tools">
      {!readOnly && event && <button type="button" className="btn small" onClick={local}>Draft from result</button>}
      {!readOnly && event && canModule('ai') && <button type="button" className="btn small" disabled={busy} onClick={ai}>{busy ? 'Drafting…' : 'Draft with AI'}</button>}
      {!readOnly && values.status === 'Draft' && values.text && <button type="button" className="btn small primary" onClick={approve}>Approve</button>}
      {values.status !== 'Draft' && values.text && <button type="button" className="btn small" onClick={share}>Share…</button>}
      {!readOnly && rec && values.status === 'Approved' && <button type="button" className="btn small ghost" onClick={posted}>Mark as posted</button>}
      <span className="muted small grow">{values.status === 'Draft' ? 'Drafts need approving before they’re shared.' : values.status === 'Approved' ? 'Approved — share it from your phone, then mark it posted.' : `Posted${values.posted_on ? ` on ${fmtDate(values.posted_on)}` : ''}.`}</span>
      {msg && <span className="small error-text">{msg}</span>}
    </div>
  );
}

/** Load list: start from the event (car and engines) and a template. */
export function LoadListTools({ values, setValues, readOnly, data, id }) {
  const [tpl, setTpl] = useState('');
  if (readOnly || values.is_template) return null;
  const event = data.byId[values.event];
  const templates = data.list('load_list').filter((l) => v(l, 'is_template') && l.id !== id);
  const items = Array.isArray(values.items) ? values.items.filter((r) => r.item) : [];
  const fill = () => {
    const add = loadItemsFor(data, event || { data: { values: {} } }, data.byId[tpl] || null).filter((x) => !items.some((y) => y.item === x.item));
    setValues((x) => ({ ...x, items: [...items, ...add] }));
  };
  const counts = ['loaded', 'at_track', 'home'].map((k) => items.filter((r) => r[k]).length);
  return (
    <div className="card inline-row wrap" data-testid="load-tools">
      {templates.length > 0 && (
        <select aria-label="Template" value={tpl} onChange={(e) => setTpl(e.target.value)}>
          <option value="">No template</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{v(t, 'name') || 'Template'}</option>)}
        </select>
      )}
      <button type="button" className="btn small" disabled={!event && !tpl} onClick={fill}>{event ? 'Add the event’s car, engines' : 'Add'}{tpl ? ' and the template' : ''}</button>
      <span className="muted small grow">{items.length ? `${items.length} items · ${counts[0]} loaded · ${counts[1]} at the track · ${counts[2]} back home` : 'Pick the event, then add its car and engines, and a template’s standard items.'}</span>
    </div>
  );
}

/** Trip: fuel and tolls become a travel expense for the event. */
export function TripTools({ values, data }) {
  const { canType } = useSession();
  const nav = useNavigate();
  const fuel = (Array.isArray(values.fuel_stops) ? values.fuel_stops : []).reduce((a, r) => a + (num(r.cost) || 0), 0);
  const total = fuel + (num(values.tolls) || 0);
  if (!canType('expense', 'edit') || !total) return null;
  const go = () => {
    const q = new URLSearchParams({ category: 'Travel', description: `Fuel and tolls${data.byId[values.event] ? ` — ${titleOf(data.byId[values.event])}` : ''}`, amount: String(Math.round(total * 100) / 100) });
    if (values.event) q.set('event', values.event);
    nav(`/r/expense/new?${q}`);
  };
  return (
    <div className="card inline-row wrap">
      <span className="grow">Fuel and tolls on this trip: <b>{Math.round(total * 100) / 100}</b></span>
      <button type="button" className="btn small" onClick={go}>Record as a travel expense</button>
    </div>
  );
}
