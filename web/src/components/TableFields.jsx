import { defaultRowsFor, rowsAt, runSpeeds, speedKey, speedLabel } from '@shared/dyno.js';
import { useState } from 'react';
import { ADJUSTERS } from '@shared/baseForms2.js';
import { fillX, parseGearSets, parseSweep, parseTable } from '../lib/parse.js';
import { SHEET_ACCEPT, readSpreadsheet, sheetToText } from '../lib/sheets.js';
import { fmtDate, fmtDateTime, memberName, membersList } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

/**
 * One table cell. Columns are numbers by default; text: true, date: true, options: [...] (a pick-list),
 * member: true (a team member) or check: true (a tick box — stamp: true also records who ticked it and when,
 * in <key>_by and <key>_at).
 */
function Cell({ c, row, readOnly, label, set, setMany }) {
  const { user } = useSession() || {};
  const val = row[c.key];
  if (c.check) {
    const by = c.stamp && val ? [memberName(row[`${c.key}_by`]), row[`${c.key}_at`] && fmtDateTime(row[`${c.key}_at`])].filter(Boolean).join(' · ') : '';
    if (readOnly) return <span className="cell-check" title={by}>{val ? '✓' : ''}{by ? <small className="muted"> {by}</small> : null}</span>;
    return (
      <label className="cell-check" title={by}>
        <input type="checkbox" aria-label={label} checked={!!val} onChange={(e) => (c.stamp
          ? setMany({ [c.key]: e.target.checked, [`${c.key}_by`]: e.target.checked ? user?.id || '' : '', [`${c.key}_at`]: e.target.checked ? new Date().toISOString() : '' })
          : set(e.target.checked))} />
        {by ? <small className="muted">{by}</small> : null}
      </label>
    );
  }
  if (c.member) {
    if (readOnly) return memberName(val);
    return (
      <select aria-label={label} value={val ?? ''} onChange={(e) => set(e.target.value)}>
        <option value="">—</option>
        {membersList().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        {val && !membersList().some((m) => m.id === val) ? <option value={val}>{memberName(val)}</option> : null}
      </select>
    );
  }
  if (c.options) {
    if (readOnly) return val ?? '';
    return (
      <select aria-label={label} value={val ?? ''} onChange={(e) => set(e.target.value)}>
        <option value="">—</option>
        {[...new Set([...c.options, ...(val && !c.options.includes(val) ? [val] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (c.date) {
    if (readOnly) return fmtDate(val);
    return <input type="date" aria-label={label} value={val ?? ''} onChange={(e) => set(e.target.value)} />;
  }
  if (readOnly) return val ?? '';
  return <input inputMode={c.text ? 'text' : 'decimal'} className={c.text ? 'txt' : 'num'} aria-label={label} value={val ?? ''} onChange={(e) => set(e.target.value)} />;
}

function PastePanel({ onApply, onClose, hint, allowAppend = true }) {
  const [text, setText] = useState('');
  const [sheets, setSheets] = useState(null);
  const [err, setErr] = useState('');
  const load = async (file) => {
    setErr('');
    try {
      const s = await readSpreadsheet(file);
      if (!s.some((x) => x.rows.length)) throw new Error('That file has no rows.');
      setSheets(s.length > 1 ? s : null);
      setText(sheetToText(s.find((x) => x.rows.length)));
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="paste-panel">
      <div className="inline-row wrap paste-file">
        <label className="btn small ghost file-btn">Load Excel / CSV file
          <input type="file" accept={SHEET_ACCEPT} aria-label="Spreadsheet to import" onChange={(e) => { if (e.target.files[0]) load(e.target.files[0]); e.target.value = ''; }} /></label>
        {sheets && <select aria-label="Sheet" onChange={(e) => setText(sheetToText(sheets[Number(e.target.value)]))}>{sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select>}
        <span className="muted small">or paste below — check the columns, then Replace or Add.</span>
      </div>
      {err && <div className="notice error small">{err}</div>}
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={hint} aria-label="Paste data" autoFocus />
      <div className="inline-row end">
        <button type="button" className="btn small ghost" onClick={onClose}>Cancel</button>
        {allowAppend && <button type="button" className="btn small" disabled={!text.trim()} onClick={() => onApply(text, 'append')}>Add to existing</button>}
        <button type="button" className="btn small primary" disabled={!text.trim()} onClick={() => onApply(text, 'replace')}>Replace</button>
      </div>
    </div>
  );
}

export function TableField({ field, value, onChange, readOnly, compactHelp, labelPrefix = '' }) {
  const cols = field.columns || [];
  const rows = Array.isArray(value) && (value.length || field.defaultRows?.length === 0) ? value : (field.defaultRows?.length === 0 ? [] : field.defaultRows || [{}]);
  const [panel, setPanel] = useState(null);
  const [fill, setFill] = useState({ start: '0', end: '10', step: '0.25' });
  const [msg, setMsg] = useState('');
  const set = (i, k, x) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: x } : r)));
  const nonEmpty = (rs) => rs.filter((r) => Object.values(r).some((x) => x !== '' && x !== undefined));

  const applyPaste = (text, mode) => {
    const parsed = field.parse === 'gearsets' ? parseGearSets(text) : parseTable(text, cols, field.xKey);
    if (!parsed.length) { setMsg('Nothing recognised — check the format.'); return; }
    onChange(mode === 'append' ? [...nonEmpty(rows), ...parsed] : parsed);
    setMsg(`${parsed.length} row${parsed.length === 1 ? '' : 's'} imported.`);
    setPanel(null);
  };
  const applyFill = () => {
    const xs = fillX(fill.start, fill.end, fill.step);
    if (!xs.length) return;
    const byX = Object.fromEntries(nonEmpty(rows).map((r) => [String(Number(r[field.xKey])), r]));
    onChange(xs.map((x) => ({ ...(byX[String(Number(x))] || {}), [field.xKey]: x })));
    setPanel(null);
  };

  return (
    <div className="data-table-wrap">
      {!readOnly && (
        <div className="table-tools">
          <button type="button" className="btn small ghost" onClick={() => setPanel(panel === 'paste' ? null : 'paste')}>Paste / import</button>
          {field.xKey && <button type="button" className="btn small ghost" onClick={() => setPanel(panel === 'fill' ? null : 'fill')}>Fill {cols.find((c) => c.key === field.xKey)?.label.toLowerCase()}</button>}
          <span className="muted small">{msg || `${nonEmpty(rows).length} rows`}</span>
        </div>
      )}
      {panel === 'paste' && (
        <PastePanel onClose={() => setPanel(null)} onApply={applyPaste}
          hint={field.parse === 'gearsets'
            ? 'Paste the gear chart, one set per line, e.g.\n15A 0.955 1.048 21/22 3.93 4.32\n7A (7K) 21/24'
            : `Paste from a dyno printout or spreadsheet. A header row (e.g. "Speed CC RO RC CO") maps the columns; otherwise columns are in this order: ${cols.map((c) => c.label).join(', ')}.`} />
      )}
      {panel === 'fill' && (
        <div className="paste-panel inline-row wrap">
          <label className="inline-field">From <input inputMode="decimal" value={fill.start} onChange={(e) => setFill({ ...fill, start: e.target.value })} /></label>
          <label className="inline-field">to <input inputMode="decimal" value={fill.end} onChange={(e) => setFill({ ...fill, end: e.target.value })} /></label>
          <label className="inline-field">step <input inputMode="decimal" value={fill.step} onChange={(e) => setFill({ ...fill, step: e.target.value })} /></label>
          <button type="button" className="btn small primary" onClick={applyFill}>Set rows</button>
        </div>
      )}
      <div className="table-scroll-x">
        <table className="data-table">
          <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}{c.unit ? <small> {c.unit}</small> : null}</th>)}{!readOnly && <th />}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className={c.check ? 'td-check' : ''}>
                    <Cell c={c} row={r} readOnly={readOnly} label={`${labelPrefix}${c.label} row ${i + 1}`}
                      set={(x) => set(i, c.key, x)} setMany={(patch) => onChange(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)))} />
                  </td>
                ))}
                {!readOnly && <td><button type="button" className="icon-btn" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && <button type="button" className="btn small ghost" onClick={() => onChange([...rows, {}])}>+ Row</button>}
      {compactHelp}
    </div>
  );
}

/**
 * Shock dyno readings at each of the run's test speeds: one table per speed. Rows are stored in a
 * single list, each tagged with its speed (s). Readings without a speed (older runs, or imported
 * when the run had several speeds) are listed separately and can be assigned to a speed.
 */
export function SpeedTables({ field, value, onChange, readOnly, values }) {
  const rows = Array.isArray(value) ? value : [];
  const speeds = runSpeeds(values);
  const present = [...new Set(rows.filter((r) => r.s).map((r) => speedKey(r.s)))].filter((k) => !speeds.includes(k));
  const all = [...speeds, ...present].sort((a, b) => Number(a) - Number(b));
  const loose = speeds.length === 1 ? [] : rows.filter((r) => !r.s);
  const [assign, setAssign] = useState(speeds[0] || '');
  const setGroup = (sp, list) => {
    const others = rows.filter((r) => (r.s ? speedKey(r.s) !== sp : !(speeds.length === 1 && speeds[0] === sp)));
    onChange([...others, ...list.map((r) => ({ ...r, s: sp }))]);
  };
  if (!all.length && !loose.length) return <p className="muted small">Pick at least one test speed above to enter readings.</p>;
  return (
    <div className="speed-tables">
      {all.map((sp) => (
        <div key={sp} className="speed-table" data-speed={sp}>
          <h4 className="subhead">{speedLabel(sp)} test{!speeds.includes(sp) && <span className="muted small"> — not in this run’s test speeds (add it back above, or clear these readings)</span>}</h4>
          <TableField field={{ ...field, defaultRows: defaultRowsFor(sp) }} value={rowsAt(rows, sp, speeds)} readOnly={readOnly}
            labelPrefix={all.length > 1 ? `${speedLabel(sp)} ` : ''} onChange={(list) => setGroup(sp, list)} />
        </div>
      ))}
      {loose.length > 0 && (
        <div className="speed-table loose">
          <h4 className="subhead">Readings without a test speed</h4>
          {!readOnly && speeds.length > 0 && (
            <div className="inline-row wrap">
              <span className="muted small">These were saved before test speeds, or imported. Move them to:</span>
              <select aria-label="Move readings to speed" value={assign} onChange={(e) => setAssign(e.target.value)}>{speeds.map((sp) => <option key={sp} value={sp}>{speedLabel(sp)}</option>)}</select>
              <button type="button" className="btn small" onClick={() => onChange(rows.map((r) => (r.s ? r : { ...r, s: assign })))}>Move</button>
            </div>
          )}
          <TableField field={field} value={loose} readOnly={readOnly} labelPrefix="Unassigned " onChange={(list) => onChange([...rows.filter((r) => r.s), ...list])} />
        </div>
      )}
    </div>
  );
}

/** Adjustable shock: one block per adjuster setting with positions, a note and readings. */
export function SweepField({ field, value, onChange, readOnly, values }) {
  const list = Array.isArray(value) ? value : [];
  const adjusters = ADJUSTERS[values?.adjust_type] || ['Adjuster'];
  const unit = values?.adjust_unit || '';
  const [open, setOpen] = useState(list.length ? 0 : null);
  const [paste, setPaste] = useState(false);
  const [msg, setMsg] = useState('');
  const upd = (i, patch) => onChange(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const speeds = field.bySpeed ? runSpeeds(values) : [];
  const add = (from) => {
    if (from) { onChange([...list, { ...structuredClone(from), label: `${from.label} (copy)` }]); setOpen(list.length); return; }
    const label = `Setting ${new Set(list.map((x) => x.label)).size + 1}`;
    // a new setting gets a block at each of the run's test speeds
    const blocks = speeds.length
      ? speeds.map((sp) => ({ label, adj: {}, note: '', speed: sp, data: defaultRowsFor(sp) }))
      : [{ label, adj: {}, note: '', data: field.defaultRows || [] }];
    onChange([...list, ...blocks]);
    setOpen(list.length);
  };
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = list.slice(); [n[i], n[j]] = [n[j], n[i]]; onChange(n); setOpen(j); };
  const applyPaste = (text, mode) => {
    const parsed = parseSweep(text, field.columns, field.xKey).map((b) => (speeds.length === 1 && !b.speed ? { ...b, speed: speeds[0] } : b));
    if (!parsed.length) { setMsg('Nothing recognised — check the format.'); return; }
    onChange(mode === 'append' ? [...list, ...parsed] : parsed);
    setMsg(`${parsed.length} setting${parsed.length === 1 ? '' : 's'} imported.`);
    setPaste(false); setOpen(null);
  };

  return (
    <div className="sweep">
      {!readOnly && (
        <div className="table-tools">
          <button type="button" className="btn small" onClick={() => add(null)}>+ Setting</button>
          <button type="button" className="btn small ghost" onClick={() => setPaste(!paste)}>Paste whole printout</button>
          <span className="muted small">{msg || `${list.length} setting${list.length === 1 ? '' : 's'} · ${adjusters.join(' / ')}`}</span>
        </div>
      )}
      {paste && (
        <PastePanel onClose={() => setPaste(false)} onApply={applyPaste}
          hint={'Paste the printout text. Each title line (e.g. "KSS 1400 LR adj reb avg set 10" or "ADJ NO 1 FULLY CLOSED") starts a new setting; header rows like "Speed CC RO RC CO" map the columns.'} />
      )}
      {list.length === 0 && <p className="muted small">No settings yet. Add one per adjuster position you tested, or paste the full printout.</p>}
      {list.map((s, i) => {
        const filled = (s.data || []).filter((r) => Object.keys(r).length > 1).length;
        const isOpen = open === i;
        return (
          <div key={i} className={`sweep-item${isOpen ? ' open' : ''}`}>
            <div className="sweep-head">
              <span className="sweep-no">{i + 1}</span>
              {readOnly ? <b className="grow">{s.label}</b>
                : <input className="sweep-label" aria-label={`Setting ${i + 1} label`} value={s.label || ''} onChange={(e) => upd(i, { label: e.target.value })} />}
              {field.bySpeed && (readOnly ? (s.speed ? <span className="chip static">{speedLabel(s.speed)}</span> : null) : (
                <select className="sweep-speed" aria-label={`Setting ${i + 1} test speed`} value={s.speed ? speedKey(s.speed) : ''} onChange={(e) => upd(i, { speed: e.target.value })}>
                  <option value="">Speed…</option>
                  {[...new Set([...speeds, ...(s.speed ? [speedKey(s.speed)] : [])])].map((sp) => <option key={sp} value={sp}>{speedLabel(sp)}</option>)}
                </select>
              ))}
              <span className="sweep-adj">
                {adjusters.map((a) => (
                  <label key={a} className="adj">
                    <small>{a}</small>
                    {readOnly ? <b>{s.adj?.[a] ?? '—'}</b>
                      : <input inputMode="decimal" aria-label={`Setting ${i + 1} ${a}`} value={s.adj?.[a] ?? ''} placeholder={unit ? unit.split(' ')[0] : ''}
                        onChange={(e) => upd(i, { adj: { ...(s.adj || {}), [a]: e.target.value } })} />}
                  </label>
                ))}
              </span>
              <button type="button" className="btn small ghost" onClick={() => setOpen(isOpen ? null : i)}>{isOpen ? 'Hide' : `Readings (${filled})`}</button>
              {!readOnly && (
                <span className="row-actions">
                  <button type="button" className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="icon-btn" aria-label="Duplicate" title="Duplicate" onClick={() => add(s)}>⧉</button>
                  <button type="button" className="icon-btn danger" aria-label="Remove setting" onClick={() => window.confirm(`Remove “${s.label}”?`) && onChange(list.filter((_, j) => j !== i))}>✕</button>
                </span>
              )}
            </div>
            {readOnly ? (s.note ? <p className="sweep-note">{s.note}</p> : null)
              : <input className="sweep-note-input" aria-label={`Setting ${i + 1} note`} value={s.note || ''} placeholder="Note — e.g. good if rough/heavy, start point, slick track…" onChange={(e) => upd(i, { note: e.target.value })} />}
            {isOpen && <TableField field={field} value={s.data} readOnly={readOnly} onChange={(d) => upd(i, { data: d })} />}
          </div>
        );
      })}
    </div>
  );
}
