// One reminders engine for every module: anything with a date, an owner and a lead time. Worked out
// on the device from the team's records, so it works offline and needs no table of its own:
// licence and medical expiry, vehicle registration and inspections, unpaid bills, contract and sponsor
// renewals, sponsor deliverables with a due date (until deployed), sponsor follow-ups, low merchandise and decal stock, budget categories
// near their limit (and the contingency reserve) and parts orders waiting for approval.
//
// computeReminders(data, { today, canType, can, settings }) → [{ key, kind, title, sub, due, days, level, link, owner }]
// level: 'over' (past due), 'soon' (inside the lead time) or 'info'. Only types the person can view are used.
import { budgetAlerts } from './finance.js';
import { openFollowUp } from './budgetSponsors.js';

export const LEAD_DAYS = { licence: 60, medical: 60, rego: 30, inspection: 30, bill: 7, contract: 60, sponsor: 60, deliverable: 14, followup: 3 };
export const REMINDER_KINDS = {
  licence: 'Licences', vehicle: 'Vehicles', bill: 'Bills to pay', contract: 'Contracts', sponsor: 'Sponsors',
  stock: 'Stock to reorder', budget: 'Budget', approval: 'Parts orders to approve',
};

const vals = (r) => r?.data?.values || {};
const num = (x) => { const v = Number(String(x ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
const dayMs = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);

export function computeReminders(data, { today, canType = () => true, can = () => true, settings = {}, memberName = () => '' } = {}) {
  const out = [];
  const dated = (key, kind, title, sub, due, lead, link, owner = '') => {
    if (!due) return;
    const days = daysBetween(today, due);
    if (days > lead) return;
    out.push({ key, kind, title, sub, due, days, level: days < 0 ? 'over' : 'soon', link, owner });
  };
  if (canType('licence', 'view')) {
    for (const l of data.list('licence')) {
      const v = vals(l); const who = v.member ? memberName(v.member) : v.holder || 'Driver';
      dated(`lic:${l.id}`, 'licence', `${who}: ${v.class || 'licence'} licence`, 'expires', v.expiry, LEAD_DAYS.licence, `/r/licence/${l.id}`, v.member);
      dated(`med:${l.id}`, 'licence', `${who}: medical certificate`, 'expires', v.medical_expiry, LEAD_DAYS.medical, `/r/licence/${l.id}`, v.member);
    }
  }
  if (canType('asset', 'view')) {
    for (const a of data.list('asset').filter((x) => vals(x).category === 'Vehicle' && vals(x).status !== 'Retired')) {
      const v = vals(a);
      dated(`rego:${a.id}`, 'vehicle', `${v.name || 'Vehicle'}: registration`, 'due', v.rego_due, LEAD_DAYS.rego, `/assets/${a.id}`);
      dated(`insp:${a.id}`, 'vehicle', `${v.name || 'Vehicle'}: inspection`, 'due', v.inspection_due, LEAD_DAYS.inspection, `/assets/${a.id}`);
    }
  }
  if (canType('expense', 'view')) {
    for (const e of data.list('expense').filter((x) => vals(x).paid === false || vals(x).paid === 'false')) {
      const v = vals(e);
      dated(`bill:${e.id}`, 'bill', `${v.supplier_name || v.description || v.category || 'Bill'}`, 'due', v.due_date || today, LEAD_DAYS.bill, `/r/expense/${e.id}`);
    }
  }
  if (canType('contract', 'view')) {
    for (const c of data.list('contract')) {
      const v = vals(c);
      if (v.end && v.end < today && !v.renewal_date) continue;
      dated(`con:${c.id}`, 'contract', `${v.name || 'Contract'}${v.party ? ` — ${v.party}` : ''}`, 'renewal / notice', v.renewal_date || v.end, LEAD_DAYS.contract, `/r/contract/${c.id}`);
    }
  }
  if (canType('sponsor', 'view')) {
    for (const s of data.list('sponsor').filter((x) => ['Signed', 'Renewal due'].includes(vals(x).stage))) {
      const v = vals(s);
      dated(`sp:${s.id}`, 'sponsor', `${v.name || 'Sponsor'}: deal renewal`, 'ends', v.end, LEAD_DAYS.sponsor, `/partners/sponsors/${s.id}`);
      (Array.isArray(v.deliverables) ? v.deliverables : []).forEach((d, i) => {
        if (d.due && d.status !== 'Deployed') dated(`spd:${s.id}:${i}`, 'sponsor', `${v.name || 'Sponsor'}: ${d.kind || 'deliverable'}${d.detail ? ` (${d.detail})` : ''}`, 'due', d.due, LEAD_DAYS.deliverable, `/partners/sponsors/${s.id}`);
      });
    }
    // follow-ups from the interaction log, for every sponsor still in play (prospects too)
    for (const s of data.list('sponsor').filter((x) => vals(x).stage !== 'Ended')) {
      const f = openFollowUp(s);
      if (f) dated(`spf:${s.id}`, 'sponsor', `${vals(s).name || 'Sponsor'}: follow up${f.note ? ` (${String(f.note).slice(0, 60)})` : ''}`, 'follow up by', f.date, LEAD_DAYS.followup, `/partners/sponsors/${s.id}`);
    }
  }
  const low = (key, title, stock, reorder, link) => {
    const st = num(stock); const ro = num(reorder);
    if (st === null || ro === null || st > ro) return;
    out.push({ key, kind: 'stock', title, sub: `${st} left (reorder at ${ro})`, due: today, days: 0, level: st <= 0 ? 'over' : 'soon', link });
  };
  if (canType('merch', 'view')) for (const m of data.list('merch')) low(`merch:${m.id}`, `${vals(m).name || 'Merchandise'}${vals(m).variant ? ` ${vals(m).variant}` : ''}`, vals(m).stock, vals(m).reorder_at, `/r/merch/${m.id}`);
  if (canType('livery', 'view')) {
    for (const l of data.list('livery')) (Array.isArray(vals(l).decals) ? vals(l).decals : []).forEach((d, i) => {
      if (d.decal) low(`decal:${l.id}:${i}`, `Decal: ${d.decal} (${vals(l).name || 'paint scheme'})`, d.stock, d.reorder, `/r/livery/${l.id}`);
    });
  }
  if (canType('budget', 'view') && can('money.view')) {
    for (const b of budgetAlerts(data, { today, settings })) {
      out.push({ key: `bud:${b.category}`, kind: 'budget', title: b.reserve ? `Contingency reserve: ${b.pct}% used` : `${b.category}: ${b.pct}% of budget spent`, sub: `${b.season} budget (warns at ${b.threshold}%)`,
        due: today, days: 0, level: b.pct >= 100 ? 'over' : 'soon', link: '/finance?tab=budget' });
    }
  }
  if (canType('purchase', 'view') && can('purchases.approve')) {
    for (const p of data.list('purchase').filter((x) => (vals(x).status || 'Requested') === 'Requested')) {
      const v = vals(p);
      out.push({ key: `po:${p.id}`, kind: 'approval', title: `${v.item || 'Parts order'}${v.qty && v.qty !== '1' ? ` × ${v.qty}` : ''}`, sub: `requested by ${memberName(v.requested_by) || 'someone'}`,
        due: v.needed_by || today, days: v.needed_by ? daysBetween(today, v.needed_by) : 0, level: 'info', link: '/purchases' });
    }
  }
  const rank = { over: 0, soon: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.days - b.days || a.title.localeCompare(b.title));
}

/** "Overdue by 3 days", "Due today", "In 12 days". */
export function dueText(r) {
  if (r.kind === 'stock' || r.kind === 'budget') return r.sub;
  if (r.days < 0) return `${r.sub} — ${-r.days} day${r.days === -1 ? '' : 's'} ago`;
  if (r.days === 0) return `${r.sub} today`;
  return `${r.sub} in ${r.days} day${r.days === 1 ? '' : 's'}`;
}
