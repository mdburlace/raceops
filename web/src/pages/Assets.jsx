import { Fragment, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Attachments, Empty, History, LifeBar, LineChart, PageHeader, Pill, Section } from '../components/ui.jsx';
import { assetLife, scheduleStatus, setupsByAsset } from '../lib/compute.js';
import { allFields, display, fmtDate, formFor, num, optionsOf, titleOf, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';
import { scheduleText } from './Maintenance.jsx';

const STATUS_LEVEL = { 'In Service': 'ok', Spare: 'info', 'Out for Service': 'warn', 'On Order': 'info', Retired: 'muted' };

function lifeText(l) {
  const parts = [];
  if (l.limit) parts.push(`${l.used} / ${l.limit} ${l.unit.toLowerCase()}`);
  else if (l.unit !== 'None') parts.push(`${l.used} ${l.unit.toLowerCase()}`);
  if (l.daysToExpiry !== null) parts.push(l.daysToExpiry < 0 ? `expired ${-l.daysToExpiry}d ago` : `expires in ${l.daysToExpiry}d`);
  return parts.join(' · ');
}

export function AssetList() {
  const data = useTeamData();
  const { canType } = useSession();
  const [params, setParams] = useSearchParams();
  const cat = params.get('category') || '';
  const status = params.get('status') ?? 'active';
  const car = params.get('car') || '';
  const [q, setQ] = useState('');
  const set = (k, val) => { const p = new URLSearchParams(params); if (val) p.set(k, val); else p.delete(k); setParams(p, { replace: true }); };

  const rows = useMemo(() => {
    if (!data) return [];
    const byAsset = setupsByAsset(data);
    return data.list('asset')
      .filter((a) => !cat || v(a, 'category') === cat)
      .filter((a) => (status === 'active' ? v(a, 'status') !== 'Retired' : status === 'all' || v(a, 'status') === status))
      .filter((a) => !car || v(a, 'car') === car)
      .filter((a) => !q || ['name', 'serial_number', 'part_number', 'manufacturer', 'spec'].some((k) => String(v(a, k) || '').toLowerCase().includes(q.toLowerCase())))
      .map((a) => ({ a, life: assetLife(a, data, byAsset) }))
      .sort((x, y) => String(v(x.a, 'category')).localeCompare(String(v(y.a, 'category'))) || titleOf(x.a).localeCompare(titleOf(y.a), undefined, { numeric: true }));
  }, [data, cat, status, car, q]);
  if (!data) return null;
  const form = formFor(data, 'asset');
  const cats = optionsOf(allFields(form).find((f) => f.key === 'category') || {}, form, data);
  const statuses = optionsOf(allFields(form).find((f) => f.key === 'status') || {}, form, data);

  const groups = rows.reduce((acc, r) => { (acc[v(r.a, 'category') || 'Other'] ||= []).push(r); return acc; }, {});

  return (
    <div>
      <PageHeader title="Assets" sub="Parts and equipment with lifecycle tracking">
        {canType('asset', 'edit') && <Link className="btn primary" to={`/r/asset/new${cat ? `?category=${encodeURIComponent(cat)}` : ''}`}>New asset</Link>}
      </PageHeader>
      <div className="toolbar">
        <input type="search" placeholder="Search name, serial, part #" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => set('category', e.target.value)}>
          <option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => set('status', e.target.value === 'active' ? '' : e.target.value || 'all')}>
          <option value="active">Not retired</option><option value="all">Any status</option>
          {statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={car} onChange={(e) => set('car', e.target.value)}>
          <option value="">Any car</option>{data.list('car').map((c) => <option key={c.id} value={c.id}>{titleOf(c)}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <Empty>No assets match. Add shocks, torsion bars, engines, gears and other parts to track their life and measurements.</Empty>
        : Object.entries(groups).map(([g, list]) => (
          <Section key={g} title={`${g} (${list.length})`}>
            <div className="list">
              {list.map(({ a, life }) => (
                <Link key={a.id} to={`/assets/${a.id}`} className="list-row">
                  <span className="grow">
                    <span className="row-title">{v(a, 'name')}{v(a, 'spec') ? <span className="muted"> · {v(a, 'spec')}</span> : null}</span>
                    <span className="row-sub">
                      {[v(a, 'car') && titleOf(data.byId[v(a, 'car')]), v(a, 'position'), v(a, 'serial_number') && `S/N ${v(a, 'serial_number')}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="life-cell">
                    <LifeBar pct={life.pct} level={life.level} />
                    <small>{lifeText(life)}</small>
                  </span>
                  <Pill level={STATUS_LEVEL[v(a, 'status')] || 'info'}>{v(a, 'status') || '—'}</Pill>
                </Link>
              ))}
            </div>
          </Section>
        ))}
    </div>
  );
}

export function AssetDetail() {
  const { id } = useParams();
  const data = useTeamData();
  const { canType, canModule } = useSession();
  const [kind, setKind] = useState('');
  if (!data) return null;
  const a = data.byId[id];
  if (!a) return <PageHeader title="Asset not found" back="/assets" />;
  const byAsset = setupsByAsset(data);
  const life = assetLife(a, data, byAsset);
  const form = formFor(data, 'asset', a.data.form_id);
  const back = encodeURIComponent(`/assets/${id}`);

  const measurements = data.list('measurement').filter((m) => v(m, 'asset') === id)
    .sort((x, y) => (v(y, 'date') || '').localeCompare(v(x, 'date') || ''));
  const kinds = [...new Set(measurements.map((m) => v(m, 'kind')))];
  const activeKind = kind || kinds[0] || '';
  const ofKind = measurements.filter((m) => v(m, 'kind') === activeKind);
  const latest = ofKind[0];
  const schedules = data.list('schedule').filter((s) => v(s, 'applies_to') !== 'Car' && v(s, 'asset') === id);
  const children = data.list('asset').filter((c) => v(c, 'parent') === id);
  const details = allFields(form).filter((f) => !['name', 'category', 'status', 'notes'].includes(f.key) && f.type !== 'heading')
    .map((f) => ({ f, val: display(f, a.data.values?.[f.key], data) })).filter((x) => x.val);

  return (
    <div>
      <PageHeader title={v(a, 'name')} sub={[v(a, 'category'), v(a, 'spec')].filter(Boolean).join(' · ')} back="/assets">
        <Pill level={STATUS_LEVEL[v(a, 'status')] || 'info'}>{v(a, 'status')}</Pill>
        {canType('asset', 'edit') && <Link className="btn" to={`/r/asset/${id}`}>Edit</Link>}
      </PageHeader>

      <div className="grid-2">
        <Section title="Lifecycle">
          {life.limit ? (
            <div className="life-big">
              <LifeBar pct={life.pct} level={life.level} />
              <span className={`big-num lvl-${life.level}`}>{Math.round(life.pct * 100)}%</span>
            </div>
          ) : null}
          <dl className="kv">
            <dt>Usage</dt><dd>{lifeText(life) || '—'}</dd>
            <dt>From setups</dt><dd>{life.laps} laps · {life.races} race meeting{life.races === 1 ? '' : 's'}</dd>
            {num(v(a, 'usage_offset')) ? <><dt>Manual adj.</dt><dd>{v(a, 'usage_offset')}</dd></> : null}
            {v(a, 'expiry_date') && <><dt>Expiry</dt><dd>{fmtDate(v(a, 'expiry_date'))}</dd></>}
          </dl>
        </Section>
        <Section title="Details">
          {details.length ? (
            <dl className="kv">{details.map(({ f, val }) => <Fragment key={f.key}><dt>{f.label}</dt><dd>{val}{f.unit && f.type === 'number' ? ` ${f.unit}` : ''}</dd></Fragment>)}</dl>
          ) : <p className="muted">No details recorded.</p>}
          {v(a, 'notes') && <p className="pre">{v(a, 'notes')}</p>}
        </Section>
      </div>

      <Section title="Measurements" actions={canType('measurement', 'edit') && (
        <Link className="btn small" to={`/r/measurement/new?asset=${id}${activeKind ? `&kind=${encodeURIComponent(activeKind)}` : ''}${latest ? `&unit=${encodeURIComponent(v(latest, 'unit') || '')}&spec_min=${v(latest, 'spec_min') ?? ''}&spec_max=${v(latest, 'spec_max') ?? ''}` : ''}&back=${back}`}>+ Measurement</Link>
      )}>
        {kinds.length === 0 ? <p className="muted">No measurements yet — e.g. bar rate, gas pressure, rotor thickness.</p> : (
          <>
            {kinds.length > 1 && (
              <div className="chips">{kinds.map((k) => <button type="button" key={k} className={`chip${k === activeKind ? ' active' : ''}`} onClick={() => setKind(k)}>{k}</button>)}</div>
            )}
            <LineChart unit={v(latest, 'unit')} specMin={num(v(latest, 'spec_min'))} specMax={num(v(latest, 'spec_max'))}
              series={[{ name: activeKind, points: ofKind.map((m) => ({ x: new Date(`${v(m, 'date')}T00:00:00`), y: num(v(m, 'value')) })).filter((p) => p.y !== null && !isNaN(p.x)) }]} />
            <table className="table">
              <thead><tr><th>Date</th><th>Value</th><th>Spec</th><th>By</th><th>Notes</th></tr></thead>
              <tbody>
                {ofKind.map((m) => {
                  const val = num(v(m, 'value')); const lo = num(v(m, 'spec_min')); const hi = num(v(m, 'spec_max'));
                  const out = val !== null && ((lo !== null && val < lo) || (hi !== null && val > hi));
                  return (
                    <tr key={m.id}>
                      <td><Link to={`/r/measurement/${m.id}?back=${back}`}>{fmtDate(v(m, 'date'))}</Link></td>
                      <td className={out ? 'lvl-over' : ''}><b>{v(m, 'value')}</b> {v(m, 'unit')}</td>
                      <td className="muted">{lo ?? ''}{lo !== null || hi !== null ? '–' : ''}{hi ?? ''}</td>
                      <td>{v(m, 'measured_by')}</td>
                      <td className="muted">{v(m, 'notes')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {canModule('dyno') && ['Shock', 'Torsion Bar'].includes(v(a, 'category')) && (() => {
        const runs = data.list('dyno_run').filter((r) => v(r, 'asset') === id).sort((x, y) => (v(y, 'date') || '').localeCompare(v(x, 'date') || ''));
        const kind = v(a, 'category') === 'Shock' ? 'shock' : 'bar';
        return (
          <Section title={`Dyno history (${runs.length})`} actions={<Link className="btn small" to={`/workshop/dyno?kind=${kind}&asset=${id}`}>{runs.length ? 'Overlay runs' : 'Open dyno'}</Link>}>
            {runs.length === 0 ? <p className="muted">No dyno runs for this {kind === 'shock' ? 'shock' : 'bar'} yet.</p> : (
              <div className="list">{runs.slice(0, 6).map((r) => (
                <Link key={r.id} to={`/r/dyno_run/${r.id}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(r, 'label') || 'Run'}</span><span className="row-sub">{v(r, 'purpose') || ''}</span></span>
                  <span className="row-meta">{fmtDate(v(r, 'date'))}</span>
                </Link>
              ))}</div>
            )}
          </Section>
        );
      })()}

      <Section title="Maintenance schedules" actions={canType('schedule', 'edit') && (
        <Link className="btn small" to={`/r/schedule/new?applies_to=Asset&asset=${id}&back=${back}`}>+ Schedule</Link>
      )}>
        {schedules.length === 0 ? <p className="muted">No schedules for this asset.</p> : (
          <div className="list">
            {schedules.map((s) => {
              const st = scheduleStatus(s, data, byAsset);
              return (
                <Link key={s.id} to={`/r/schedule/${s.id}?back=${back}`} className="list-row">
                  <span className="grow"><span className="row-title">{v(s, 'name')}</span>
                    <span className="row-sub">every {v(s, 'interval')} {String(v(s, 'interval_unit')).toLowerCase()} · last {v(s, 'last_done') ? fmtDate(v(s, 'last_done')) : 'never'}</span></span>
                  <Pill level={st.level}>{scheduleText(st)}</Pill>
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      {children.length > 0 && (
        <Section title="Installed components">
          <div className="list">{children.map((c) => <Link key={c.id} to={`/assets/${c.id}`} className="list-row"><span className="grow">{v(c, 'name')}</span><span className="muted">{v(c, 'category')}</span></Link>)}</div>
        </Section>
      )}

      <Section title={`Run in setups (${life.setups.length})`}>
        {life.setups.length === 0 ? <p className="muted">Select this asset on a setup sheet (e.g. Shocks, Bars, Motor, Gear) to link it.</p> : (
          <div className="list">
            {life.setups.slice().sort((x, y) => (v(data.byId[v(y, 'event')], 'date') || '').localeCompare(v(data.byId[v(x, 'event')], 'date') || '')).slice(0, 30).map((s) => (
              <Link key={s.id} to={`/r/setup/${s.id}`} className="list-row">
                <span className="grow"><span className="row-title">{titleOf(s, data)}</span>
                  <span className="row-sub">{titleOf(data.byId[v(s, 'car')])} · {fmtDate(v(data.byId[v(s, 'event')], 'date'))}</span></span>
                <span className="row-meta">{v(s, 'laps') ? `${v(s, 'laps')} laps` : ''}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Attachments record={a} canEdit={canType('asset', 'edit')} />
      <History recordId={a.id} />
    </div>
  );
}

export function CarList() {
  const data = useTeamData();
  const { canType } = useSession();
  if (!data) return null;
  const cars = data.list('car').sort((a, b) => String(v(a, 'number')).localeCompare(String(v(b, 'number')), undefined, { numeric: true }));
  return (
    <div>
      <PageHeader title="Cars" sub="Each car keeps its own setups, maintenance and assigned assets">
        {canType('car', 'edit') && <Link className="btn primary" to="/r/car/new">New car</Link>}
      </PageHeader>
      {cars.length === 0 ? <Empty>No cars yet.</Empty> : (
        <div className="card list">
          {cars.map((c) => {
            const assets = data.list('asset').filter((a) => v(a, 'car') === c.id && v(a, 'status') !== 'Retired').length;
            return (
              <div key={c.id} className="list-row">
                <span className="car-num">{v(c, 'number')}</span>
                <Link to={`/r/car/${c.id}`} className="grow">
                  <span className="row-title">{v(c, 'name') || `Car #${v(c, 'number')}`}{v(c, 'active') === false ? <span className="muted"> · inactive</span> : null}</span>
                  <span className="row-sub">{[v(c, 'class'), v(c, 'driver'), v(c, 'chassis_make')].filter(Boolean).join(' · ')}</span>
                </Link>
                <Link className="btn small ghost" to={`/assets?car=${c.id}`}>{assets} assets</Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
