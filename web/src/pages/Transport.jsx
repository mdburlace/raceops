// Transport: trip plans, load lists (built from the event, ticked off with no signal), pre-trip
// checks, driver licences (classes from the team's region) and the team's vehicles (assets with
// category Vehicle, using the usual service schedules and lifecycle).
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, Pill } from '../components/ui.jsx';
import { fmtDate, memberName, titleOf, today, useTeamData, v } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

const TABS = [['trips', 'Trips'], ['load', 'Load lists'], ['checks', 'Pre-trip checks'], ['licences', 'Licences'], ['vehicles', 'Vehicles']];
const assetId = (x) => (x && typeof x === 'object' ? x.asset : null);
const vehicleName = (data, x) => (assetId(x) ? titleOf(data.byId[assetId(x)], data) : x || '');

export function Transport() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'trips';
  const data = useTeamData();
  const { canType, region } = useSession();
  if (!data) return null;
  const add = { trips: ['trip', 'New trip'], load: ['load_list', 'New load list'], checks: ['pre_trip', 'New pre-trip check'], licences: ['licence', 'Add a licence'], vehicles: ['asset', 'Add a vehicle'] }[tab];
  return (
    <div>
      <PageHeader title="Transport" sub="Getting the cars, engines and crew to the track and home again">
        {add && canType(add[0], 'edit') && <Link className="btn primary" to={add[0] === 'asset' ? '/r/asset/new?category=Vehicle' : `/r/${add[0]}/new`}>{add[1]}</Link>}
      </PageHeader>
      <div className="tabs scroll">
        {TABS.map(([k, label]) => <button type="button" key={k} className={tab === k ? 'active' : ''} onClick={() => setParams(k === 'trips' ? {} : { tab: k })}>{label}</button>)}
      </div>
      {tab === 'trips' && <Trips data={data} />}
      {tab === 'load' && <LoadLists data={data} />}
      {tab === 'checks' && <Checks data={data} />}
      {tab === 'licences' && <Licences data={data} />}
      {tab === 'vehicles' && <Vehicles data={data} />}
      {(tab === 'trips' || tab === 'licences') && (
        <p className="muted small">Work and rest times on a trip are a planning aid. Where {region.hours.name} need an official record ({region.hours.record}), use {region.hours.provider}. <a href={region.hours.link} target="_blank" rel="noreferrer">About the rules</a></p>
      )}
    </div>
  );
}

function Trips({ data }) {
  const list = data.list('trip').slice().sort((a, b) => String(v(b, 'depart_date')).localeCompare(String(v(a, 'depart_date'))));
  if (!list.length) return <Empty>No trips yet. Plan one for each event: when you leave, the route, fuel stops and who’s driving.</Empty>;
  return (
    <div className="card list">{list.map((t) => (
      <Link key={t.id} to={`/r/trip/${t.id}`} className="list-row">
        <span className="grow"><span className="row-title">{titleOf(data.byId[v(t, 'event')]) || 'Trip'}</span>
          <span className="row-sub">{[fmtDate(v(t, 'depart_date')), v(t, 'depart_time'), vehicleName(data, v(t, 'vehicle')), (v(t, 'drivers') || []).map((d) => memberName(d.member)).filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span></span>
        {(v(t, 'depart_date') || '') >= today() ? <Pill level="info">coming up</Pill> : null}
      </Link>
    ))}</div>
  );
}

function LoadLists({ data }) {
  const list = data.list('load_list').slice().sort((a, b) => Number(!!v(a, 'is_template')) - Number(!!v(b, 'is_template')) || b.created_at.localeCompare(a.created_at));
  if (!list.length) return <Empty>No load lists yet. Make a template of your standard kit (e.g. “Sprint car race weekend”), then a load list for each event.</Empty>;
  return (
    <div className="card list">{list.map((l) => {
      const items = (v(l, 'items') || []).filter((r) => r.item);
      const loaded = items.filter((r) => r.loaded).length; const there = items.filter((r) => r.at_track).length;
      return (
        <Link key={l.id} to={`/r/load_list/${l.id}`} className="list-row" data-testid="load-row">
          <span className="grow"><span className="row-title">{titleOf(l, data)}</span><span className="row-sub">{items.length} items{v(l, 'is_template') ? '' : ` · ${loaded} loaded · ${there} at the track`}</span></span>
          {!v(l, 'is_template') && items.length > 0 && <Pill level={there === items.length ? 'ok' : loaded === items.length ? 'info' : 'warn'}>{there === items.length ? 'all at track' : loaded === items.length ? 'all loaded' : `${items.length - loaded} to load`}</Pill>}
        </Link>
      );
    })}</div>
  );
}

function Checks({ data }) {
  const list = data.list('pre_trip').slice().sort((a, b) => String(v(b, 'date')).localeCompare(String(v(a, 'date'))));
  if (!list.length) return <Empty>No pre-trip checks yet. Do the walk-around before every trip: tyres, lights, brakes, coupling and tie-downs.</Empty>;
  return (
    <div className="card list">{list.map((c) => (
      <Link key={c.id} to={`/r/pre_trip/${c.id}`} className="list-row">
        <span className="grow"><span className="row-title">{titleOf(c, data)}</span><span className="row-sub">{memberName(v(c, 'done_by'))}</span></span>
        <Pill level={v(c, 'ok_to_go') ? 'ok' : 'warn'}>{v(c, 'ok_to_go') ? 'OK to travel' : v(c, 'issues') ? 'issues' : 'not signed off'}</Pill>
      </Link>
    ))}</div>
  );
}

function Licences({ data }) {
  const t = today();
  const list = data.list('licence').slice().sort((a, b) => String(v(a, 'expiry')).localeCompare(String(v(b, 'expiry'))));
  if (!list.length) return <Empty>No licences recorded. Add each driver’s licence class and expiry — Reminders tells you 60 days before one runs out.</Empty>;
  return (
    <div className="card list">{list.map((l) => {
      const exp = v(l, 'expiry') || '';
      const soon = exp && exp <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
      return (
        <Link key={l.id} to={`/r/licence/${l.id}`} className="list-row">
          <span className="grow"><span className="row-title">{titleOf(l, data)}</span><span className="row-sub">expires {fmtDate(exp)}{v(l, 'medical_expiry') ? ` · medical ${fmtDate(v(l, 'medical_expiry'))}` : ''}</span></span>
          <Pill level={exp < t ? 'over' : soon ? 'warn' : 'ok'}>{exp < t ? 'expired' : soon ? 'renew soon' : 'current'}</Pill>
        </Link>
      );
    })}</div>
  );
}

function Vehicles({ data }) {
  const { canModule } = useSession();
  const list = data.list('asset').filter((a) => v(a, 'category') === 'Vehicle');
  if (!canModule('assets')) return <Empty>Vehicles are assets — your role needs Assets → view to see them.</Empty>;
  if (!list.length) return <Empty>No vehicles yet. Add the hauler, toterhome and trailer as assets with the category Vehicle — they get service schedules, registration and inspection reminders.</Empty>;
  return (
    <div className="card list">{list.map((a) => (
      <Link key={a.id} to={`/assets/${a.id}`} className="list-row">
        <span className="grow"><span className="row-title">{v(a, 'name')}</span><span className="row-sub">{[v(a, 'vehicle_type'), v(a, 'rego_due') && `registration ${fmtDate(v(a, 'rego_due'))}`, v(a, 'inspection_due') && `inspection ${fmtDate(v(a, 'inspection_due'))}`].filter(Boolean).join(' · ')}</span></span>
        <span className="row-meta">{v(a, 'status')}</span>
      </Link>
    ))}</div>
  );
}
