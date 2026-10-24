// Printable engine teardown & pre-check: a filled-in sheet with its findings, or a blank one for the bench
// (/print/teardown/blank?engine=…). Laid out from the team's teardown form, so added fields print too.
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { teardownFindings, ticked } from '@shared/engineTeardown.js';
import { fmtDate, formFor, memberName, titleOf, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

const dash = (x) => (x === undefined || x === null || x === '' ? '' : String(x));
const box = (on) => (on ? '☑' : '☐');

function runsOf(fields) {
  const out = [];
  for (const f of fields) {
    const last = out[out.length - 1];
    if (f.type === 'corners' && last?.grid && String(last.fields[0].corners) === String(f.corners)) last.fields.push(f);
    else if (f.type === 'corners') out.push({ grid: true, fields: [f] });
    else out.push({ field: f });
  }
  return out;
}

function Value({ f, cv, data, blank }) {
  const x = cv[f.key];
  if (f.type === 'member') return <b>{x ? memberName(x) : '______________'}</b>;
  if (f.type === 'ref') return <b>{x && data.byId[x] ? titleOf(data.byId[x], data) : '______________'}</b>;
  if (f.type === 'date') return <b>{x ? fmtDate(x) : '____________'}</b>;
  if (blank || dash(x) === '') return <b>{f.options ? f.options.map((o) => `☐ ${o}`).join('  ') : '______________'}</b>;
  return <b>{dash(x)}{f.unit ? ` ${f.unit}` : ''}</b>;
}

export default function TeardownPrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const data = useTeamData();
  const { membership } = useSession();
  if (!data) return <p className="pad muted">Loading…</p>;
  const blank = id === 'blank';
  const rec = blank ? null : data.byId[id];
  if (!blank && (!rec || rec.type !== 'engine_teardown')) return <p className="pad">Teardown not found.</p>;
  const cv = blank ? { engine: params.get('engine') } : rec.data.values || {};
  const form = formFor(data, 'engine_teardown', rec?.data.form_id);
  const engine = data.byId[cv.engine];
  const build = data.byId[cv.build];
  const found = blank ? null : teardownFindings(cv, build);
  return (
    <div className="print-page">
      <div className="print-tools no-print">
        <button type="button" className="btn ghost" onClick={() => nav(-1)}>‹ Back</button>
        <button type="button" className="btn primary" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <article className="print-sheet teardown-print" data-testid="teardown-print">
        <header className="ps-head">
          <div><h1>{membership?.tenant_name}</h1><p className="muted">Engine teardown &amp; pre-check</p></div>
          <div className="ps-meta"><b>{engine ? titleOf(engine) : 'Engine'}</b><span>{blank || !cv.date ? 'Date: ____________' : fmtDate(cv.date)}</span>
            <span>Build: {build ? `${v(build, 'build_type') || 'Build'} · ${fmtDate(v(build, 'date'))}` : '—'}</span></div>
        </header>
        {(form?.data?.sections || []).map((sec) => (
          <section key={sec.id}><h3>{sec.title}</h3>
            {runsOf(sec.fields.filter((f) => f.type !== 'calc')).map((r, i) => {
              if (r.grid) {
                const cols = r.fields[0].corners || [];
                return (
                  <div key={i} className="table-scroll">
                    <table className="ps-table cyl-table">
                      <thead><tr><th />{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                      <tbody>{r.fields.map((f) => <tr key={f.key}><th>{f.label}{f.unit ? <small> {f.unit}</small> : null}</th>{cols.map((c) => <td key={c}>{blank ? '' : dash(cv[f.key]?.[c])}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                );
              }
              const f = r.field;
              if (f.type === 'table') {
                const rows = !blank && Array.isArray(cv[f.key]) && cv[f.key].length ? cv[f.key] : f.defaultRows || [{}, {}, {}];
                return (
                  <div key={f.key} className="table-scroll">
                    <p className="small"><b>{f.label}</b></p>
                    <table className="ps-table">
                      <thead><tr>{f.columns.map((c) => <th key={c.key}>{c.label}{c.unit ? <small> {c.unit}</small> : null}</th>)}</tr></thead>
                      <tbody>{rows.map((row, j) => <tr key={j}>{f.columns.map((c) => <td key={c.key}>{blank && !f.defaultRows?.[j]?.[c.key] ? '' : dash(row[c.key])}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                );
              }
              if (f.type === 'check' || f.type === 'checkbox') return <p key={f.key}>{box(!blank && ticked(cv[f.key]))} {f.label}</p>;
              if (f.type === 'textarea') return <div key={f.key}><p className="small"><b>{f.label}</b></p><p className="pre">{(!blank && cv[f.key]) || '\n\n'}</p></div>;
              return <p key={f.key}>{f.label}: <Value f={f} cv={cv} data={data} blank={blank && !['engine'].includes(f.key)} /></p>;
            })}
          </section>
        ))}
        {found && found.items.length > 0 && (
          <section data-testid="teardown-print-findings"><h3>Findings</h3>
            <ul>{found.items.map((x, i) => <li key={i}>{x.level === 'bad' ? '✖' : '⚠'} {x.text}</li>)}</ul>
            {found.causes.length > 0 && <p><b>What the evidence points to:</b> {found.causes.map((c) => c.cause).join(', ')}</p>}
          </section>
        )}
      </article>
    </div>
  );
}
