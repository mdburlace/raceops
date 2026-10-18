// Profile → Appearance: pick a theme, build custom themes, and choose which sidebar sections start collapsed.
import { useEffect, useState } from 'react';
import { KEY_COLOURS, MAX_CUSTOM_THEMES, STANDARD, STANDARD_THEMES, SYSTEM_THEME, contrastIssues, deriveTokens, resolveTheme } from '@shared/themes.js';
import { applyPrefsTheme, applyTheme } from '../lib/theme.js';
import { useSession } from '../lib/session.jsx';
import { I, Icon, useNav } from './Layout.jsx';

const HEX = /^#[0-9a-f]{6}$/i;
const newId = () => `c-${Math.random().toString(36).slice(2, 10)}`;

/** A small picture of the app in a theme: sidebar, page, a card with text and an accent button. */
function Swatch({ theme }) {
  if (!theme) {
    return (
      <span className="sw sw-system" aria-hidden="true">
        <span className="sw-half sw-l"><Swatch theme={STANDARD.light} /></span>
        <span className="sw-half sw-d"><Swatch theme={STANDARD.dark} /></span>
      </span>
    );
  }
  const { tokens: t } = deriveTokens(theme);
  return (
    <span className="sw" aria-hidden="true" style={{ background: t.bg }}>
      <span className="sw-side" style={{ background: t.side }}>
        <i style={{ background: t['side-muted'] }} /><i style={{ background: t.accent }} /><i style={{ background: t['side-muted'] }} />
      </span>
      <span className="sw-card" style={{ background: t.surface, borderColor: t.line }}>
        <i style={{ background: t.ink }} /><i className="short" style={{ background: t.muted }} />
        <b style={{ background: t.accent }} />
      </span>
    </span>
  );
}

function ThemeCard({ theme, id, name, note, selected, onPick, children }) {
  return (
    <div className={`theme-card${selected ? ' selected' : ''}`}>
      <button type="button" className="theme-pick" aria-pressed={selected} onClick={() => onPick(id)}>
        <Swatch theme={theme} />
        <span className="theme-name">{name}{selected && <Icon d={I.check} size={16} />}</span>
        {note && <span className="theme-note">{note}</span>}
      </button>
      {children}
    </div>
  );
}

function ThemeEditor({ start, onSave, onCancel }) {
  const [t, setT] = useState(start);
  const [hex, setHex] = useState(start.colors);
  useEffect(() => { applyTheme(t); }, [t]); // live preview across the whole app
  const setColour = (k, v) => {
    setHex((h) => ({ ...h, [k]: v }));
    if (HEX.test(v)) setT((x) => ({ ...x, colors: { ...x.colors, [k]: v.toLowerCase() } }));
  };
  const issues = contrastIssues(t);
  return (
    <div className="theme-editor card" role="region" aria-label="Custom theme">
      <div className="card-head"><h3>{start.isNew ? 'New custom theme' : `Edit “${start.name}”`}</h3></div>
      <p className="muted small">The whole app previews your changes as you go. Other colours (borders, faint text, status colours) are worked out from these.</p>
      <div className="field-grid">
        <div className="field"><label htmlFor="th-name">Name</label>
          <input id="th-name" value={t.name} maxLength={40} onChange={(e) => setT({ ...t, name: e.target.value })} /></div>
        <div className="field"><label id="th-base-l">Base</label>
          <div className="seg" role="group" aria-labelledby="th-base-l">
            {['light', 'dark'].map((b) => <button key={b} type="button" className={t.base === b ? 'active' : ''} aria-pressed={t.base === b} onClick={() => setT({ ...t, base: b })}>{b === 'light' ? 'Light' : 'Dark'}</button>)}
          </div>
        </div>
      </div>
      <div className="colour-grid">
        {KEY_COLOURS.map(({ key, label }) => (
          <div key={key} className="colour-row">
            <input type="color" value={t.colors[key]} aria-label={`${label} colour`} onChange={(e) => setColour(key, e.target.value)} />
            <div className="field grow"><label htmlFor={`th-${key}`}>{label}</label>
              <input id={`th-${key}`} className="mono" value={hex[key]} spellCheck={false}
                aria-invalid={!HEX.test(hex[key])} onChange={(e) => setColour(key, e.target.value.trim())} /></div>
          </div>
        ))}
      </div>
      {issues.length > 0 ? (
        <div className="notice small" role="status">
          <b>Some text may be hard to read:</b>
          <ul>{issues.map((x) => <li key={x.label}>{x.label} — contrast {x.ratio.toFixed(1)}:1 (aim for {x.min}:1 or more)</li>)}</ul>
        </div>
      ) : <p className="ok-text small" role="status">Contrast looks good.</p>}
      <div className="inline-row end">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={!t.name.trim() || KEY_COLOURS.some(({ key }) => !HEX.test(hex[key]))}
          onClick={() => onSave({ id: t.id, name: t.name.trim(), base: t.base, colors: t.colors })}>Save theme</button>
      </div>
    </div>
  );
}

export function Appearance() {
  const { prefs, setPrefs } = useSession();
  const groups = useNav();
  const [editing, setEditing] = useState(null);
  const current = prefs.theme || SYSTEM_THEME;
  const custom = prefs.custom_themes || [];
  const collapsed = prefs.nav_collapsed || [];

  const pick = (id) => setPrefs({ theme: id });
  const startNew = () => {
    const from = resolveTheme(prefs) || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? STANDARD.dark : STANDARD.light);
    setEditing({ id: newId(), name: `My ${from.name.toLowerCase()}`, base: from.base, colors: { ...from.colors }, isNew: true });
  };
  const close = () => { setEditing(null); applyPrefsTheme(prefs); };
  const save = (t) => {
    const list = custom.some((x) => x.id === t.id) ? custom.map((x) => (x.id === t.id ? t : x)) : [...custom, t];
    setEditing(null);
    setPrefs({ custom_themes: list, theme: t.id });
  };
  const remove = (t) => {
    if (!window.confirm(`Delete the theme “${t.name}”?`)) return;
    setPrefs({ custom_themes: custom.filter((x) => x.id !== t.id), ...(current === t.id ? { theme: SYSTEM_THEME } : {}) });
  };

  return (
    <section className="card appearance">
      <div className="card-head"><h3>Appearance</h3></div>
      <p className="muted small">Your theme and sidebar layout follow you to every device you sign in on. Other team members keep their own.</p>

      <h4 className="sub-h">Theme</h4>
      <div className="theme-grid" role="group" aria-label="Theme">
        <ThemeCard id={SYSTEM_THEME} name="Match this device" note="Light or dark, following the device setting" selected={current === SYSTEM_THEME} onPick={pick} />
        {STANDARD_THEMES.map((t) => <ThemeCard key={t.id} theme={t} id={t.id} name={t.name} note={t.note} selected={current === t.id} onPick={pick} />)}
        {custom.map((t) => (
          <ThemeCard key={t.id} theme={t} id={t.id} name={t.name} note={`Custom · ${t.base}`} selected={current === t.id} onPick={pick}>
            <div className="theme-actions">
              <button type="button" className="btn ghost small" onClick={() => setEditing({ ...t })}>Edit</button>
              <button type="button" className="btn ghost small danger" onClick={() => remove(t)}>Delete</button>
            </div>
          </ThemeCard>
        ))}
      </div>
      {!editing && (
        <button type="button" className="btn" disabled={custom.length >= MAX_CUSTOM_THEMES} onClick={startNew}>
          <Icon d={I.palette} size={18} />Create a custom theme
        </button>
      )}
      {custom.length >= MAX_CUSTOM_THEMES && <p className="muted small">You have {MAX_CUSTOM_THEMES} custom themes — delete one to add another.</p>}
      {editing && <ThemeEditor key={editing.id} start={editing} onSave={save} onCancel={close} />}

      <h4 className="sub-h">Sidebar sections</h4>
      <p className="muted small">Collapsed sections show just their heading — use the arrow beside a heading in the sidebar to open or close it.</p>
      <div className="stack-tight">
        {groups.map((g) => (
          <label key={g.area} className="check-row">
            <input type="checkbox" checked={!collapsed.includes(g.area)}
              onChange={(e) => setPrefs({ nav_collapsed: e.target.checked ? collapsed.filter((k) => k !== g.area) : [...collapsed, g.area] })} />
            <span>Show <b>{g.label}</b> links</span>
          </label>
        ))}
      </div>
      <div className="inline-row">
        <button type="button" className="btn ghost small" onClick={() => setPrefs({ nav_collapsed: groups.map((g) => g.area) })}>Collapse all</button>
        <button type="button" className="btn ghost small" onClick={() => setPrefs({ nav_collapsed: [] })}>Expand all</button>
      </div>
    </section>
  );
}
