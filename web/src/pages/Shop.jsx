// Engine shop: jobs (parts & labour), customers, the shop home panel, job extras on the job
// page, engine job history, shop settings and the printable job sheet / handover pack.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { JOB_STATUS, JOB_STATUSES, TEAM_TYPES, isOpen, jobTotals, money, shopSettings, teamType } from '@shared/shop.js';
import { Empty, PageHeader, Pill, Section } from '../components/ui.jsx';
import { engineChecks } from '../components/EngineChecks.jsx';
import { api } from '../lib/api.js';
import { assetLife } from '../lib/compute.js';
import { fmtDate, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

const statusPill = (s) => <Pill level={JOB_STATUS[s]?.level || 'muted'}>{s || 'No status'}</Pill>;
const overdue = (j) => isOpen(v(j, 'status')) && v(j, 'date_promised') && v(j, 'date_promised') < today() && v(j, 'status') !== 'Ready for pickup';
const jobSort = (a, b) => String(v(b, 'job_no')).localeCompare(String(v(a, 'job_no')), undefined, { numeric: true });

// ---------------------------------------------------------------- jobs
export function JobList() {
  const data = useTeamData();
  const { membership, canType } = useSession();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'open';
  const [q, setQ] = useState('');
  const shop = shopSettings(membership);
  const rows = useMemo(() => (data ? data.list('job')
    .filter((j) => (status === 'all' ? true : status === 'open' ? isOpen(v(j, 'status')) : v(j, 'status') === status))
    .filter((j) => {
      if (!q.trim()) return true;
      const hay = `${v(j, 'job_no')} ${titleOf(data.byId[v(j, 'customer')])} ${titleOf(data.byId[v(j, 'engine')])} ${v(j, 'job_type')} ${v(j, 'invoice_ref') || ''}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    })
    .sort(jobSort) : []), [data, status, q]);
  if (!data) return null;
  const count = (s) => data.list('job').filter((j) => (s === 'open' ? isOpen(v(j, 'status')) : v(j, 'status') === s)).length;
  const set = (s) => { const p = new URLSearchParams(params); if (s === 'open') p.delete('status'); else p.set('status', s); setParams(p, { replace: true }); };
  return (
    <div>
      <PageHeader title="Jobs" sub="Engines in the shop — work orders with parts and labour">
        {canType('job', 'edit') && <Link className="btn primary" to="/r/job/new">New job</Link>}
      </PageHeader>
      <div className="chips" role="group" aria-label="Job status">
        {[['open', `Open (${count('open')})`], ...JOB_STATUSES.map((s) => [s.key, `${s.key}${s.open ? ` (${count(s.key)})` : ''}`]), ['all', 'All']].map(([k, l]) => (
          <button key={k} type="button" className={`chip${status === k ? ' active' : ''}`} aria-pressed={status === k} onClick={() => set(k)}>{l}</button>
        ))}
      </div>
      <div className="toolbar"><input type="search" placeholder="Search job #, customer, engine, invoice" aria-label="Search jobs" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!rows.length ? <Empty>{data.list('job').length ? 'No jobs match.' : 'No jobs yet. Add a customer, then open a job for their engine.'}</Empty> : (
        <div className="card list">
          {rows.map((j) => {
            const t = jobTotals(j.data.values, shop);
            return (
              <Link key={j.id} to={`/r/job/${j.id}`} className="list-row job-row">
                <span className="grow">
                  <span className="row-title">{v(j, 'job_no')} · {titleOf(data.byId[v(j, 'customer')])}</span>
                  <span className="row-sub">{[titleOf(data.byId[v(j, 'engine')]) !== '—' && titleOf(data.byId[v(j, 'engine')]), v(j, 'job_type'),
                    v(j, 'date_promised') && `promised ${fmtDate(v(j, 'date_promised'))}`].filter(Boolean).join(' · ')}</span>
                </span>
                {overdue(j) && <Pill level="over">overdue</Pill>}
                {statusPill(v(j, 'status'))}
                <span className="row-meta num">{t.total ? money(t.total) : ''}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** On the job page: totals, build sheets for the job, and the printout. */
export function JobExtras({ id, values, isNew }) {
  const data = useTeamData();
  const { membership, canType } = useSession();
  if (!data) return null;
  const shop = shopSettings(membership);
  const t = jobTotals(values, shop);
  const builds = isNew ? [] : data.list('engine_build').filter((b) => v(b, 'job') === id).sort((a, b) => String(v(b, 'date')).localeCompare(String(v(a, 'date'))));
  const customer = data.byId[values.customer];
  const newBuild = `/r/engine_build/new?${new URLSearchParams({ job: id || '', ...(values.engine ? { engine: values.engine } : {}), customer: titleOf(customer) === '—' ? '' : titleOf(customer), work_order: values.job_no || '', back: `/r/job/${id}` })}`;
  return (
    <>
      <section className="card job-totals" aria-label="Job totals">
        <div className="card-head"><h3>Totals</h3><span className="muted small">{shop.prices_include_tax ? `Prices include ${shop.tax_label}` : `Prices ex ${shop.tax_label}`}</span></div>
        <dl className="totals">
          <div><dt>Parts</dt><dd>{money(t.partsSell)}</dd></div>
          <div><dt>Labour ({t.hours} h)</dt><dd>{money(t.labourTotal)}</dd></div>
          {t.discount ? <div><dt>Discount</dt><dd>−{money(t.discount)}</dd></div> : null}
          <div><dt>{shop.prices_include_tax ? `Includes ${shop.tax_label}` : `${shop.tax_label} ${t.taxRate}%`}</dt><dd>{money(t.tax)}</dd></div>
          <div className="grand"><dt>Total</dt><dd>{money(t.total)}</dd></div>
        </dl>
        <p className="muted small">Parts cost {money(t.partsCost)} · margin {money(t.partsMargin)}{t.labour.some((l) => l.defaultRate && l.hours) ? ` · labour at the shop rate of ${money(Number(shop.labour_rate))}/h where no rate is entered` : ''}.</p>
      </section>
      {!isNew && (
        <Section title="Build sheets for this job" actions={canType('engine_build', 'edit') ? <Link className="btn small" to={newBuild}>New build sheet</Link> : null}>
          {!builds.length ? <p className="muted small">No build sheets yet. Start one to record measurements, clearances, torque and dyno results — they go into the customer’s handover pack.</p> : (
            <div className="list">
              {builds.map((b) => (
                <Link key={b.id} to={`/r/engine_build/${b.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(b, 'build_type') || 'Build'} · {fmtDate(v(b, 'date'))}</span>
                    <span className="row-sub">{[v(b, 'hp') && `${v(b, 'hp')} hp`, v(b, 'torque') && `${v(b, 'torque')} lb-ft`].filter(Boolean).join(' · ')}</span></span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- customers
export function CustomerList() {
  const data = useTeamData();
  const { canType } = useSession();
  const [q, setQ] = useState('');
  if (!data) return null;
  const rows = data.list('customer').filter((c) => !q.trim() || `${v(c, 'name')} ${v(c, 'contact_name') || ''} ${v(c, 'phone') || ''} ${v(c, 'email') || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => String(v(a, 'name')).localeCompare(String(v(b, 'name'))));
  return (
    <div>
      <PageHeader title="Customers" sub="Who you build engines for — their engines and job history">
        {canType('customer', 'edit') && <Link className="btn primary" to="/r/customer/new">New customer</Link>}
      </PageHeader>
      <div className="toolbar"><input type="search" placeholder="Search customers" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!rows.length ? <Empty>{data.list('customer').length ? 'No customers match.' : 'No customers yet.'}</Empty> : (
        <div className="card list">
          {rows.map((c) => {
            const engines = data.list('asset').filter((a) => v(a, 'customer') === c.id).length;
            const open = data.list('job').filter((j) => v(j, 'customer') === c.id && isOpen(v(j, 'status'))).length;
            return (
              <Link key={c.id} to={`/customers/${c.id}`} className="list-row">
                <span className="grow"><span className="row-title">{v(c, 'name')}</span>
                  <span className="row-sub">{[v(c, 'contact_name'), v(c, 'phone'), v(c, 'races')].filter(Boolean).join(' · ')}</span></span>
                <span className="row-meta">{engines} engine{engines === 1 ? '' : 's'}{open ? ` · ${open} open job${open === 1 ? '' : 's'}` : ''}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const data = useTeamData();
  const { membership, canType } = useSession();
  if (!data) return null;
  const c = data.byId[id];
  if (!c) return <PageHeader title="Customer not found" back="/customers" />;
  const shop = shopSettings(membership);
  const engines = data.list('asset').filter((a) => v(a, 'customer') === id).sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const jobs = data.list('job').filter((j) => v(j, 'customer') === id).sort(jobSort);
  const spent = jobs.filter((j) => v(j, 'status') !== 'Cancelled').reduce((s, j) => s + jobTotals(j.data.values, shop).total, 0);
  return (
    <div>
      <PageHeader title={v(c, 'name')} sub={[v(c, 'contact_name'), v(c, 'races')].filter(Boolean).join(' · ')} back="/customers">
        {canType('customer', 'edit') && <Link className="btn ghost" to={`/r/customer/${id}`}>Edit</Link>}
        {canType('job', 'edit') && <Link className="btn primary" to={`/r/job/new?customer=${id}`}>New job</Link>}
      </PageHeader>
      <div className="grid-2">
        <Section title="Contact">
          <dl className="kv">
            {[['Phone', v(c, 'phone')], ['Email', v(c, 'email')], ['Address', [v(c, 'address1'), v(c, 'city'), v(c, 'state'), v(c, 'postcode')].filter(Boolean).join(', ')],
              ['Account #', v(c, 'account_ref')], ['ABN', v(c, 'business_no')]].filter(([, x]) => x).map(([k, x]) => [<dt key={`${k}t`}>{k}</dt>, <dd key={`${k}d`}>{x}</dd>])}
          </dl>
          {v(c, 'notes') && <p className="pre small">{v(c, 'notes')}</p>}
          <p className="muted small">{jobs.length} job{jobs.length === 1 ? '' : 's'} · {money(spent)} total</p>
        </Section>
        <Section title="Engines" actions={canType('asset', 'edit') ? <Link className="btn small" to={`/r/asset/new?category=Engine&customer=${id}`}>Add engine</Link> : null}>
          {!engines.length ? <p className="muted small">No engines yet.</p> : (
            <div className="list">
              {engines.map((a) => {
                const life = assetLife(a, data);
                const last = data.list('job').filter((j) => v(j, 'engine') === a.id).sort(jobSort)[0];
                return (
                  <Link key={a.id} to={`/assets/${a.id}`} className="list-row">
                    <span className="grow"><span className="row-title">{titleOf(a)}</span>
                      <span className="row-sub">{[v(a, 'model'), v(a, 'serial_number') && `S/N ${v(a, 'serial_number')}`, last && `last job ${v(last, 'job_no')}`].filter(Boolean).join(' · ')}</span></span>
                    {life.limit ? <Pill level={life.level}>{Math.round(life.used)} / {life.limit} {life.unit.toLowerCase()}</Pill> : null}
                  </Link>
                );
              })}
            </div>
          )}
        </Section>
      </div>
      <Section title="Jobs">
        {!jobs.length ? <p className="muted small">No jobs yet.</p> : (
          <div className="list">
            {jobs.map((j) => (
              <Link key={j.id} to={`/r/job/${j.id}`} className="list-row">
                <span className="grow"><span className="row-title">{v(j, 'job_no')} · {v(j, 'job_type') || 'Job'}</span>
                  <span className="row-sub">{[titleOf(data.byId[v(j, 'engine')]) !== '—' && titleOf(data.byId[v(j, 'engine')]), fmtDate(v(j, 'date_in'))].filter(Boolean).join(' · ')}</span></span>
                {statusPill(v(j, 'status'))}
                <span className="row-meta num">{money(jobTotals(j.data.values, shop).total)}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/** On an engine's asset page: its owner and job history. */
export function EngineJobs({ asset }) {
  const data = useTeamData();
  const { membership, canType } = useSession();
  if (!data || teamType(membership) === 'race' || v(asset, 'category') !== 'Engine') return null;
  const jobs = data.list('job').filter((j) => v(j, 'engine') === asset.id).sort(jobSort);
  const owner = data.byId[v(asset, 'customer')];
  return (
    <Section title="Shop jobs" actions={canType('job', 'edit') ? <Link className="btn small" to={`/r/job/new?engine=${asset.id}${owner ? `&customer=${owner.id}` : ''}`}>New job</Link> : null}>
      {owner && <p className="small">Owner: <Link to={`/customers/${owner.id}`}>{titleOf(owner)}</Link></p>}
      {!jobs.length ? <p className="muted small">No jobs for this engine yet.</p> : (
        <div className="list">
          {jobs.map((j) => (
            <Link key={j.id} to={`/r/job/${j.id}`} className="list-row">
              <span className="grow"><span className="row-title">{v(j, 'job_no')} · {v(j, 'job_type') || 'Job'}</span><span className="row-sub">{fmtDate(v(j, 'date_in'))}</span></span>
              {statusPill(v(j, 'status'))}
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Home screen panel for engine shops. */
export function ShopHome() {
  const data = useTeamData();
  const { canType } = useSession();
  if (!data) return null;
  const open = data.list('job').filter((j) => isOpen(v(j, 'status')));
  const soon = new Date(); soon.setDate(soon.getDate() + 7);
  const soonIso = soon.toISOString().slice(0, 10);
  const due = open.filter((j) => v(j, 'date_promised') && v(j, 'date_promised') <= soonIso && v(j, 'status') !== 'Ready for pickup')
    .sort((a, b) => String(v(a, 'date_promised')).localeCompare(String(v(b, 'date_promised'))));
  const ready = open.filter((j) => v(j, 'status') === 'Ready for pickup');
  return (
    <section className="card shop-home" aria-label="In the shop">
      <div className="card-head"><h3>In the shop</h3>
        <span className="inline-row">
          {canType('customer', 'edit') && <Link className="btn small ghost" to="/r/customer/new">New customer</Link>}
          {canType('job', 'edit') && <Link className="btn small primary" to="/r/job/new">New job</Link>}
        </span>
      </div>
      <div className="chips">
        {JOB_STATUSES.filter((s) => s.open).map((s) => {
          const n = open.filter((j) => v(j, 'status') === s.key).length;
          return <Link key={s.key} className="chip" to={`/jobs?status=${encodeURIComponent(s.key)}`}>{s.key} <b>{n}</b></Link>;
        })}
      </div>
      <div className="grid-2">
        <div>
          <h4 className="sub-h">Due in the next 7 days</h4>
          {!due.length ? <p className="muted small">Nothing due.</p> : due.slice(0, 8).map((j) => (
            <Link key={j.id} to={`/r/job/${j.id}`} className="list-row">
              <span className="grow"><span className="row-title">{v(j, 'job_no')} · {titleOf(data.byId[v(j, 'customer')])}</span><span className="row-sub">{v(j, 'job_type')} · {v(j, 'status')}</span></span>
              {overdue(j) ? <Pill level="over">overdue</Pill> : <span className="row-meta">{fmtDate(v(j, 'date_promised'))}</span>}
            </Link>
          ))}
        </div>
        <div>
          <h4 className="sub-h">Ready for pickup</h4>
          {!ready.length ? <p className="muted small">None waiting.</p> : ready.slice(0, 8).map((j) => (
            <Link key={j.id} to={`/r/job/${j.id}`} className="list-row">
              <span className="grow"><span className="row-title">{v(j, 'job_no')} · {titleOf(data.byId[v(j, 'customer')])}</span><span className="row-sub">{v(j, 'paid') ? 'Paid' : 'Not paid yet'}</span></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- settings
export function ShopSettings() {
  const { tid, membership, can, refresh } = useSession();
  const [type, setType] = useState(teamType(membership));
  const [s, setS] = useState(shopSettings(membership));
  const [msg, setMsg] = useState('');
  if (!can('team.manage')) return null;
  const save = async () => {
    setMsg('');
    try {
      await api(`/t/${tid}`, { method: 'PATCH', body: { settings: { ...(membership.settings || {}), team_type: type, shop: s } } });
      await refresh(); setMsg('Saved.');
    } catch (e) { setMsg(e.message); }
  };
  const f = (k, label, extra = {}) => (
    <div className="field"><label htmlFor={`shop-${k}`}>{label}</label>
      <input id={`shop-${k}`} value={s[k] ?? ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} {...extra} /></div>
  );
  return (
    <Section title="Team type & engine shop">
      <div className="field"><label htmlFor="team-type">This team is a…</label>
        <select id="team-type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(TEAM_TYPES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
        </select>
        <small className="help">{TEAM_TYPES[type].blurb}</small>
      </div>
      {type !== 'race' && (
        <div className="field-grid shop-settings">
          {f('labour_rate', 'Labour rate per hour ($)', { inputMode: 'decimal' })}
          {f('tax_rate', 'Tax rate (%)', { inputMode: 'decimal' })}
          {f('tax_label', 'Tax name')}
          {f('job_prefix', 'Job number prefix')}
          <label className="check-row span-all"><input type="checkbox" checked={!!s.prices_include_tax} onChange={(e) => setS({ ...s, prices_include_tax: e.target.checked })} /> Prices I enter include tax</label>
          <div className="field span-all"><label htmlFor="shop-terms">Terms / notes printed on job sheets</label>
            <textarea id="shop-terms" rows={3} value={s.terms || ''} onChange={(e) => setS({ ...s, terms: e.target.value })} placeholder="e.g. Payment due on collection. Warranty: 30 days on workmanship, excludes over-rev and lubrication failure." /></div>
        </div>
      )}
      <div className="inline-row"><button type="button" className="btn primary" onClick={save}>Save</button>{msg && <span className="muted small" role="status">{msg}</span>}</div>
    </Section>
  );
}

// ---------------------------------------------------------------- printout
const DETAIL_KEYS = [['bore', 'Bore (avg max)', 'in'], ['stroke', 'Stroke', 'in'], ['cid', 'Displacement', 'ci'], ['cr', 'Compression ratio', ':1'], ['rod_length', 'Rod length', 'in'],
  ['deck_height', 'Deck height', 'in'], ['cam_mfr', 'Cam'], ['grind_no', 'Grind #'], ['cam_installed_cl', 'Installed centreline', '°'], ['lsa', 'Lobe separation', '°'],
  ['int_duration', 'Intake duration', '°'], ['exh_duration', 'Exhaust duration', '°'], ['valve_lift_int', 'Valve lift (int)', 'in'], ['valve_lift_exh', 'Valve lift (exh)', 'in'],
  ['main_tq_inner', 'Mains torque (inner)', 'ft-lb'], ['main_tq_outer', 'Mains torque (outer)', 'ft-lb'], ['head_tq', 'Head torque', 'ft-lb'], ['rod_tq', 'Rod torque', 'ft-lb'],
  ['hp', 'Dyno HP'], ['torque', 'Dyno torque', 'lb-ft'], ['peak_rpm', 'Peak HP rpm']];

export function JobPrint() {
  const { id } = useParams();
  const nav = useNavigate();
  const data = useTeamData();
  const { membership } = useSession();
  const [prices, setPrices] = useState(true);
  const [specs, setSpecs] = useState(true);
  if (!data) return <p className="pad muted">Loading…</p>;
  const j = data.byId[id];
  if (!j) return <p className="pad">Job not found.</p>;
  const shop = shopSettings(membership);
  const jv = j.data.values;
  const t = jobTotals(jv, shop);
  const cust = data.byId[jv.customer];
  const engine = data.byId[jv.engine];
  const build = data.list('engine_build').filter((b) => v(b, 'job') === id).sort((a, b) => String(v(b, 'date')).localeCompare(String(v(a, 'date'))))[0];
  const bv = build?.data?.values || {};
  const checks = build ? engineChecks(bv) : null;
  const life = engine ? assetLife(engine, data) : null;
  const parts = (jv.parts || []).filter((p) => p.description || p.part_no);
  const labour = (jv.labour || []).filter((l) => l.description || l.hours);
  const specRows = DETAIL_KEYS.filter(([k]) => bv[k] !== undefined && bv[k] !== '' && bv[k] !== null);
  return (
    <div className="print-page">
      <div className="print-tools no-print">
        <button type="button" className="btn ghost" onClick={() => nav(-1)}>‹ Back</button>
        <label className="check-row"><input type="checkbox" checked={prices} onChange={(e) => setPrices(e.target.checked)} /> Show prices</label>
        <label className="check-row"><input type="checkbox" checked={specs} onChange={(e) => setSpecs(e.target.checked)} disabled={!build} /> Include build specs{!build ? ' (no build sheet)' : ''}</label>
        <button type="button" className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <article className="print-sheet">
        <header className="ps-head">
          <div><h1>{membership?.tenant_name}</h1><p className="muted">{specs && build ? 'Engine handover pack' : 'Job sheet'}</p></div>
          <div className="ps-meta"><b>{jv.job_no}</b><span>{jv.job_type}</span><span>{fmtDate(jv.date_in)}{jv.date_out ? ` – ${fmtDate(jv.date_out)}` : ''}</span></div>
        </header>
        <section className="ps-grid">
          <div><h3>Customer</h3><p><b>{titleOf(cust)}</b><br />{[v(cust, 'contact_name'), v(cust, 'phone'), v(cust, 'email')].filter(Boolean).join(' · ')}</p></div>
          <div><h3>Engine</h3><p><b>{engine ? titleOf(engine) : '—'}</b><br />{[v(engine, 'model'), v(engine, 'serial_number') && `S/N ${v(engine, 'serial_number')}`].filter(Boolean).join(' · ')}</p></div>
        </section>
        {[['What was asked for', jv.request], ['Findings', jv.findings], ['Work done', jv.work_done], ['Recommendations / next service', jv.recommendations]].filter(([, x]) => x).map(([h, x]) => (
          <section key={h}><h3>{h}</h3><p className="pre">{x}</p></section>
        ))}
        {parts.length > 0 && (
          <section><h3>Parts</h3>
            <table className="ps-table"><thead><tr><th>Part #</th><th>Description</th><th className="num">Qty</th>{prices && <><th className="num">Unit</th><th className="num">Amount</th></>}</tr></thead>
              <tbody>{parts.map((p, i) => <tr key={i}><td>{p.part_no}</td><td>{p.description}</td><td className="num">{p.qty || 1}</td>{prices && <><td className="num">{money(Number(p.unit_price || p.unit_cost || 0))}</td><td className="num">{money(t.parts[(jv.parts || []).indexOf(p)]?.sell || 0)}</td></>}</tr>)}</tbody>
            </table>
          </section>
        )}
        {labour.length > 0 && (
          <section><h3>Labour</h3>
            <table className="ps-table"><thead><tr><th>Date</th><th>Work</th><th className="num">Hours</th>{prices && <><th className="num">Rate</th><th className="num">Amount</th></>}</tr></thead>
              <tbody>{labour.map((l, i) => { const x = t.labour[(jv.labour || []).indexOf(l)]; return <tr key={i}><td>{l.date}</td><td>{l.description}</td><td className="num">{l.hours}</td>{prices && <><td className="num">{money(x?.rate || 0)}</td><td className="num">{money(x?.amount || 0)}</td></>}</tr>; })}</tbody>
            </table>
          </section>
        )}
        {prices && (
          <section className="ps-totals">
            <dl>
              <div><dt>Parts</dt><dd>{money(t.partsSell)}</dd></div>
              <div><dt>Labour</dt><dd>{money(t.labourTotal)}</dd></div>
              {t.discount ? <div><dt>Discount</dt><dd>−{money(t.discount)}</dd></div> : null}
              <div><dt>{shop.prices_include_tax ? `Includes ${shop.tax_label}` : `${shop.tax_label} (${t.taxRate}%)`}</dt><dd>{money(t.tax)}</dd></div>
              <div className="grand"><dt>Total</dt><dd>{money(t.total)}</dd></div>
            </dl>
            {jv.invoice_ref && <p className="small">Invoice {jv.invoice_ref}{jv.paid ? ' · Paid' : ''}</p>}
          </section>
        )}
        {specs && build && (
          <>
            <section><h3>Build specifications <span className="muted small">({v(build, 'build_type') || 'Build'}, {fmtDate(v(build, 'date'))})</span></h3>
              <dl className="ps-specs">{specRows.map(([k, l, u]) => <div key={k}><dt>{l}</dt><dd>{String(bv[k])}{u ? ` ${u}` : ''}</dd></div>)}</dl>
            </section>
            {checks && (checks.rows.length > 0 || checks.singles.length > 0) && (
              <section><h3>Clearances & checks</h3>
                <dl className="ps-specs">{checks.singles.map(([l, x, u]) => <div key={l}><dt>{l}</dt><dd>{x}{u ? ` ${u}` : ''}</dd></div>)}</dl>
                {checks.rows.map((r) => <p key={r.label} className="small"><b>{r.label}</b> ({r.unit}): {r.cells.map(([k, x]) => `${k} ${Number(x).toFixed(r.dp)}`).join(' · ')}</p>)}
              </section>
            )}
          </>
        )}
        {life?.limit ? <section><h3>Next service</h3><p>Due at {life.limit} {life.unit.toLowerCase()} — {Math.round(life.used)} used so far.</p></section> : null}
        {shop.terms && <footer className="ps-terms small pre">{shop.terms}</footer>}
      </article>
    </div>
  );
}
