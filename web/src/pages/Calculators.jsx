// Calculators page: every calculator grouped by category, searchable, works offline.
// ?cat=<category> narrows the list (each sidebar section links to its own); ?c=<id> opens one.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CALC, CALCS, CATEGORIES } from '@shared/calcs.js';
import { CalcPanel, calcContext } from '../components/Calculator.jsx';
import { PageHeader } from '../components/ui.jsx';
import { I, Icon } from '../components/Layout.jsx';
import { useTeamData } from '../lib/data.js';

const AREA_CATS = { track: ['air', 'fuel', 'chassis', 'gearing'], workshop: ['workshop', 'chassis'], engines: ['engine', 'fuel', 'air'] };

export function Calculators() {
  const [params, setParams] = useSearchParams();
  const data = useTeamData();
  const area = params.get('area') || '';
  const id = params.get('c');
  const [q, setQ] = useState('');
  const cats = AREA_CATS[area] ? CATEGORIES.filter((c) => AREA_CATS[area].includes(c.key)).sort((a, b) => AREA_CATS[area].indexOf(a.key) - AREA_CATS[area].indexOf(b.key)) : CATEGORIES;
  const match = (c) => !q.trim() || `${c.title} ${c.blurb}`.toLowerCase().includes(q.trim().toLowerCase());
  const def = id && CALC[id];
  // the most recent car's gear list, so “closest gear” works from this page too
  const ctx = useMemo(() => {
    const car = data?.list('car').find((c) => c.data?.values?.active !== false);
    return calcContext(data, car ? { car: car.id } : {});
  }, [data]);
  const open = (cid) => { const p = new URLSearchParams(params); p.set('c', cid); setParams(p); };
  const back = () => { const p = new URLSearchParams(params); p.delete('c'); setParams(p); };

  return (
    <div className={`calc-page${def ? ' has-open' : ''}`}>
      <PageHeader title="Calculators" sub="Tuning, chassis, gearing, engine and workshop maths — works offline. Calculators are also beside the fields they fill on your sheets." />
      <div className="calc-layout">
        <nav className="calc-list" aria-label="Calculators">
          <div className="calc-filters">
          <div className="seg calc-areas" role="group" aria-label="Show calculators for">
            {[['', 'All'], ['track', 'At the track'], ['engines', 'Engines'], ['workshop', 'Workshop']].map(([k, l]) => (
              <button key={k} type="button" className={area === k ? 'active' : ''} aria-pressed={area === k} onClick={() => { const p = new URLSearchParams(params); if (k) p.set('area', k); else p.delete('area'); setParams(p); }}>{l}</button>
            ))}
          </div>
          <input type="search" placeholder="Search calculators" aria-label="Search calculators" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {cats.map((c) => {
            const list = CALCS.filter((x) => x.cat === c.key && match(x));
            if (!list.length) return null;
            return (
              <div key={c.key} className="calc-cat">
                <h3>{c.label}</h3>
                {list.map((x) => (
                  <button key={x.id} type="button" className={`calc-item${x.id === id ? ' active' : ''}`} aria-current={x.id === id ? 'true' : undefined} onClick={() => open(x.id)}>
                    <b>{x.title}</b><span>{x.blurb}</span>
                  </button>
                ))}
              </div>
            );
          })}
          {!cats.some((c) => CALCS.some((x) => x.cat === c.key && match(x))) && <p className="muted">No calculators match “{q}”.</p>}
        </nav>
        <section className="calc-detail card" aria-live="polite">
          {def ? (
            <>
              <div className="card-head">
                <button type="button" className="icon-btn calc-back" aria-label="Back to the list" onClick={back}>‹</button>
                <h2>{def.title}</h2>
              </div>
              <CalcPanel key={def.id} id={def.id} ctx={ctx} />
            </>
          ) : (
            <div className="calc-empty"><Icon d={I.calc} size={32} /><p className="muted">Pick a calculator. Your last inputs are remembered on this device.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
