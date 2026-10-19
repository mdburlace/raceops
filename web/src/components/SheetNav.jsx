// Setup sheet navigation and quick-edit tools:
//  - SheetNav: a row of section buttons that stays under the title; jumps to a section and shows
//    which one you're in, with a count of changes per section; "Arrange" opens the section order.
//  - SheetTools: copy from another session, "N changes from …", Before / After and Changes only.
//  - useSheetLayout: the person's own order, hidden and folded sections (saved in their preferences).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canHide, changeCounts, moveSection, orderSections } from '@shared/setupLayout.js';
import { useSession } from '../lib/session.jsx';

/** The person's layout for setup sheets, plus actions that save it to their preferences. */
export function useSheetLayout(form, { isNew, values }) {
  const { prefs, setPrefs } = useSession();
  const saved = prefs.setup_layout || {};
  const sections = form?.data?.sections || [];
  // Session folds by default on a saved sheet (the title already shows it); a new sheet starts open
  const baseCollapsed = saved.collapsed ?? ['session'];
  const sessionIncomplete = !values?.event || !values?.car || !values?.session;
  const collapsed = useMemo(() => new Set(baseCollapsed.filter((id) => !(id === 'session' && (isNew || sessionIncomplete)))),
    [baseCollapsed.join(','), isNew, sessionIncomplete]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useCallback((patch) => setPrefs({ setup_layout: { ...saved, ...patch } }), [setPrefs, saved]);
  return {
    order: saved.order || [],
    hidden: (saved.hidden || []).filter((id) => { const s = sections.find((x) => x.id === id); return s && canHide(s); }),
    collapsed,
    toggle: (id) => {
      const cur = new Set(baseCollapsed);
      if (collapsed.has(id)) cur.delete(id); else cur.add(id);
      save({ collapsed: [...cur] });
    },
    open: (id) => { if (collapsed.has(id)) save({ collapsed: baseCollapsed.filter((x) => x !== id) }); },
    move: (id, dir) => save({ order: moveSection(sections, saved, id, dir) }),
    setHidden: (id, hide) => save({ hidden: hide ? [...new Set([...(saved.hidden || []), id])] : (saved.hidden || []).filter((x) => x !== id) }),
    reset: () => setPrefs({ setup_layout: {} }),
  };
}

/** Sticky row of section buttons. `shown` = ids of sections on screen (some hide under Before / After). */
export function SheetNav({ form, layout, shown, changed, onArrange }) {
  const [active, setActive] = useState(null);
  const rowRef = useRef(null);
  const sections = orderSections(form.data.sections, layout).filter((s) => !layout.hidden.includes(s.id) && shown.includes(s.id));
  const counts = changeCounts(changed || {});
  const hiddenCount = layout.hidden.length;

  // which section is under the header
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const bottom = (document.querySelector('.page-head')?.getBoundingClientRect().bottom || rowRef.current?.getBoundingClientRect().bottom || 0) + 40;
        let cur = null;
        for (const el of document.querySelectorAll('.form-section[data-sec]')) {
          if (el.getBoundingClientRect().top <= bottom) cur = el.dataset.sec; else break;
        }
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          const all = document.querySelectorAll('.form-section[data-sec]');
          if (all.length) cur = all[all.length - 1].dataset.sec;
        }
        setActive(cur);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [sections.length]);

  // keep the active button in view in the row (phones scroll the row sideways)
  useEffect(() => {
    const row = rowRef.current; const b = row?.querySelector(`[data-jump="${active}"]`);
    if (!row || !b) return;
    if (b.offsetLeft < row.scrollLeft || b.offsetLeft + b.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: b.offsetLeft - 12, behavior: 'smooth' });
    }
  }, [active]);

  const jump = (id) => {
    layout.open(id);
    requestAnimationFrame(() => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    setActive(id);
  };

  return (
    <nav className="sheet-nav" aria-label="Sections">
      <div className="sn-row" ref={rowRef}>
        {sections.map((s) => (
          <button key={s.id} type="button" data-jump={s.id} className={`sn-chip${active === s.id ? ' on' : ''}`} aria-current={active === s.id ? 'true' : undefined} onClick={() => jump(s.id)}>
            {s.title}{counts[s.id] ? <b className="sn-count" aria-label={`${counts[s.id]} changed`}>{counts[s.id]}</b> : null}
          </button>
        ))}
        {hiddenCount > 0 && <button type="button" className="sn-chip ghost" onClick={onArrange}>+{hiddenCount} hidden</button>}
        <button type="button" className="sn-chip ghost sn-arrange" onClick={onArrange} aria-label="Arrange sections">⇅ Arrange</button>
      </div>
    </nav>
  );
}

/** Copy from, changes, Before / After and Changes only. `copy` is the copy-from select (from RecordEdit). */
export function SheetTools({ copy, started, base, baseLabel, changed, stage, setStage, changesOnly, setChangesOnly }) {
  const n = Object.keys(changed || {}).length;
  return (
    <div className="card carry-bar sheet-tools">
      <div className="st-copy">
        {started}
        {copy}
      </div>
      <div className="st-modes">
        {base && <span className={`st-changes${n ? ' has' : ''}`} data-testid="change-count">{n ? `${n} change${n === 1 ? '' : 's'}` : 'No changes'} from {baseLabel}</span>}
        <div className="seg" role="group" aria-label="Show fields for">
          {[['all', 'All'], ['before', 'Before'], ['after', 'After']].map(([k, label]) => (
            <button key={k} type="button" className={stage === k ? 'on' : ''} aria-pressed={stage === k} onClick={() => setStage(k)}
              title={k === 'before' ? 'Settings to set before the session' : k === 'after' ? 'Readings taken after the session' : 'Every field'}>{label}</button>
          ))}
        </div>
        {base && (
          <label className="toggle small"><input type="checkbox" checked={changesOnly} disabled={!n && !changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} />
            <span>Changes only</span></label>
        )}
      </div>
    </div>
  );
}

/** Reorder, show and hide sections — for this person only, on every setup sheet. */
export function ArrangeSections({ form, layout, onClose }) {
  const list = orderSections(form.data.sections, layout);
  return (
    <div className="calc-modal" role="dialog" aria-modal="true" aria-label="Arrange sections" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="calc-scrim" onClick={onClose} />
      <div className="calc-sheet card arrange">
        <div className="card-head"><h3>Arrange sections</h3><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button></div>
        <p className="muted small">Put the sections you use most at the top, and hide ones you don't use. This is just for you, on every setup sheet and device. Hidden sections keep their data.</p>
        <ol className="arrange-list">
          {list.map((s, i) => {
            const hidden = layout.hidden.includes(s.id);
            return (
              <li key={s.id} className={hidden ? 'is-hidden' : ''}>
                <span className="ar-title">{s.title}</span>
                <label className="toggle small" title={canHide(s) ? '' : 'Has required fields, so it always shows'}>
                  <input type="checkbox" aria-label={`Show ${s.title}`} checked={!hidden} disabled={!canHide(s)} onChange={(e) => layout.setHidden(s.id, !e.target.checked)} /><span>Show</span>
                </label>
                <button type="button" className="icon-btn" aria-label={`Move ${s.title} up`} disabled={i === 0} onClick={() => layout.move(s.id, -1)}>↑</button>
                <button type="button" className="icon-btn" aria-label={`Move ${s.title} down`} disabled={i === list.length - 1} onClick={() => layout.move(s.id, 1)}>↓</button>
              </li>
            );
          })}
        </ol>
        <div className="inline-row end">
          <button type="button" className="btn ghost" onClick={layout.reset}>Reset to the team’s order</button>
          <button type="button" className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
