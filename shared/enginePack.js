// What an engine's owner sees: build history, specs, clearances, engine tunes, jobs and next service.
// Built on the server from the shop's records for the no-login link, for a linked team, and
// for the frozen copy a team keeps when a link ends. Never includes internal notes, parts
// cost or margin; prices only for jobs the shop marked "Show prices to the customer".
import { engineChecks } from './engineChecks.js';
import { jobTotals } from './shop.js';
import { tuneForPack } from './engineTune.js';

export const SPEC_KEYS = [['bore', 'Bore (avg max)', 'in'], ['stroke', 'Stroke', 'in'], ['cid', 'Displacement', 'ci'], ['cr', 'Compression ratio', ':1'], ['rod_length', 'Rod length', 'in'],
  ['deck_height', 'Deck height', 'in'], ['cam_mfr', 'Cam'], ['grind_no', 'Grind #'], ['cam_installed_cl', 'Installed centreline', '°'], ['lsa', 'Lobe separation', '°'],
  ['int_duration', 'Intake duration', '°'], ['exh_duration', 'Exhaust duration', '°'], ['valve_lift_int', 'Valve lift (int)', 'in'], ['valve_lift_exh', 'Valve lift (exh)', 'in'],
  ['main_tq_inner', 'Mains torque (inner)', 'ft-lb'], ['main_tq_outer', 'Mains torque (outer)', 'ft-lb'], ['head_tq', 'Head torque', 'ft-lb'], ['rod_tq', 'Rod torque', 'ft-lb'],
  ['hp', 'Dyno HP'], ['torque', 'Dyno torque', 'lb-ft'], ['peak_rpm', 'Peak HP rpm']];

const vals = (r) => r?.data?.values || {};
const shown = (x) => x !== undefined && x !== null && x !== '' && typeof x !== 'object';

/** Last date the engine came out of the shop after work (start of the current service interval). */
export function lastServiceDate(jobs) {
  const done = jobs.filter((j) => vals(j).status === 'Collected' && vals(j).date_out).map((j) => vals(j).date_out).sort();
  return done.length ? done[done.length - 1] : null;
}

/**
 * shop: { name, settings }, engine & customer: records, builds & jobs: the engine's records,
 * usage: { laps, sessions, last, since, team } from a linked team (optional).
 */
export function enginePack({ shop, engine, customer, builds = [], jobs = [], tunes = [], usage = null }) {
  const ev = vals(engine);
  const settings = shop.settings || {};
  const outJobs = jobs.filter((j) => vals(j).status !== 'Cancelled')
    .sort((a, b) => String(vals(b).date_in || '').localeCompare(String(vals(a).date_in || '')))
    .map((j) => {
      const jv = vals(j);
      const prices = !!jv.share_prices;
      const t = jobTotals(jv, settings);
      return {
        job_no: jv.job_no, job_type: jv.job_type, status: jv.status, date_in: jv.date_in, date_out: jv.date_out,
        request: jv.request, findings: jv.findings, work_done: jv.work_done, recommendations: jv.recommendations,
        parts: (jv.parts || []).filter((p) => p.description || p.part_no).map((p, i) => ({ part_no: p.part_no, description: p.description, qty: p.qty || '1', ...(prices ? { amount: t.parts[(jv.parts || []).indexOf(p)]?.sell ?? null } : {}) })),
        labour: (jv.labour || []).filter((l) => l.description || l.hours).map((l) => ({ date: l.date, description: l.description, hours: l.hours, ...(prices ? { amount: t.labour[(jv.labour || []).indexOf(l)]?.amount ?? null } : {}) })),
        ...(prices ? { totals: { parts: t.partsSell, labour: t.labourTotal, discount: t.discount, tax: t.tax, tax_label: settings.tax_label || 'GST', tax_rate: t.taxRate, total: t.total, includes_tax: !!settings.prices_include_tax }, invoice_ref: jv.invoice_ref || '', paid: !!jv.paid } : {}),
      };
    });
  const outBuilds = builds.slice().sort((a, b) => String(vals(b).date || '').localeCompare(String(vals(a).date || ''))).map((b) => {
    const bv = vals(b);
    return { date: bv.date, build_type: bv.build_type, job_no: jobs.find((j) => j.id === bv.job) ? vals(jobs.find((j) => j.id === bv.job)).job_no : undefined,
      specs: SPEC_KEYS.filter(([k]) => shown(bv[k])).map(([k, l, u]) => ({ label: l, value: String(bv[k]), unit: u || '' })), checks: engineChecks(bv) };
  });
  const limit = Number(ev.life_limit) || null;
  const unit = ev.life_unit || 'Laps';
  const since = lastServiceDate(jobs);
  return {
    shop: shop.name, generated_at: new Date().toISOString(),
    engine: { name: ev.name, model: ev.model || '', serial: ev.serial_number || '', manufacturer: ev.manufacturer || '' },
    owner: customer ? vals(customer).name : '',
    service: { limit, unit, last_service: since, used: usage && unit === 'Laps' ? usage.laps : null, sessions: usage ? usage.sessions : null, last_session: usage?.last || null, team: usage?.team || null },
    builds: outBuilds, jobs: outJobs, terms: settings.terms || '',
    // engine tunes the shop shares with the owner, newest first (the active one is marked)
    tunes: tunes.filter((r) => vals(r).shared !== false).map(tuneForPack).sort((a, b) => String(b.date).localeCompare(String(a.date))),
  };
}
