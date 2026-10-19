import { cleanLayout } from './setupLayout.js';
// Per-user colour themes. A theme is five key colours plus a light/dark base; every other
// colour token the app uses is derived from those, so custom themes stay consistent.
// Shared by the server (validating saved preferences) and the web app (applying them).

const HEX = /^#[0-9a-f]{6}$/i;
export const KEY_COLOURS = [
  { key: 'bg', label: 'Page background' },
  { key: 'surface', label: 'Cards & panels' },
  { key: 'ink', label: 'Text' },
  { key: 'accent', label: 'Accent (buttons, highlights)' },
  { key: 'side', label: 'Sidebar' },
];

// ---------------------------------------------------------------- colour maths
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
/** a → b by t (0 = a, 1 = b) */
export const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG contrast ratio, 1–21 */
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---------------------------------------------------------------- base palettes
// Status, area and AI colours are tuned per base so they read well on light or dark surfaces.
const BASE = {
  light: {
    ok: '#1f8a4c', warn: '#b26b00', over: '#c62828', info: '#2f5fb3',
    'a-track': '#e2561a', 'a-workshop': '#2f6fd6', 'a-engines': '#b8322a', 'a-team': '#6b4fc7', 'a-admin': '#0e7c72', ai: '#7a3fd1',
    shadow: '0 1px 2px rgba(20, 20, 20, .05), 0 1px 0 rgba(20, 20, 20, .03)',
  },
  dark: {
    ok: '#4cc27f', warn: '#f0ae3c', over: '#ff6b6b', info: '#7aa7ff',
    'a-track': '#ff7a3d', 'a-workshop': '#6aa0ff', 'a-engines': '#ff6b5e', 'a-team': '#a48bff', 'a-admin': '#3cc5b6', ai: '#b38cff',
    shadow: 'none',
  },
};

/** Every CSS custom property for a theme. */
export function deriveTokens(theme) {
  const base = theme.base === 'dark' ? 'dark' : 'light';
  const dark = base === 'dark';
  const c = theme.colors;
  const b = BASE[base];
  const soft = (col) => mix(c.surface, col, dark ? 0.2 : 0.13);
  const sideDark = luminance(c.side) < 0.25;
  const sideInk = sideDark ? mix('#ffffff', c.side, 0.14) : mix('#000000', c.side, 0.18);
  const accentInk = contrast(c.accent, '#ffffff') >= contrast(c.accent, '#15110e') ? '#ffffff' : '#15110e';
  const t = {
    bg: c.bg, surface: c.surface, ink: c.ink, accent: c.accent, side: c.side,
    'surface-2': dark ? mix(c.surface, c.ink, 0.05) : mix(c.surface, c.bg, 0.55),
    'ink-2': mix(c.ink, c.surface, 0.3),
    muted: mix(c.ink, c.surface, 0.47),
    line: mix(c.surface, c.ink, dark ? 0.1 : 0.11),
    'line-2': mix(c.surface, c.ink, dark ? 0.16 : 0.18),
    'accent-ink': accentInk,
    'accent-soft': soft(c.accent),
    'side-ink': sideInk,
    'side-muted': mix(sideInk, c.side, 0.38),
    'side-2': mix(c.side, sideInk, 0.08),
    'side-3': mix(c.side, sideInk, 0.13),
    'side-line': mix(c.side, sideInk, 0.14),
    'side-strong': sideDark ? '#ffffff' : '#000000',
    ...Object.fromEntries(['ok', 'warn', 'over', 'info'].flatMap((k) => [[k, b[k]], [`${k}-soft`, soft(b[k])]])),
    'a-track': b['a-track'], 'a-workshop': b['a-workshop'], 'a-engines': b['a-engines'], 'a-team': b['a-team'], 'a-admin': b['a-admin'],
    ai: b.ai, 'ai-soft': soft(b.ai), shadow: b.shadow,
    ...(theme.exact || {}),
  };
  return { tokens: t, scheme: base };
}

// ---------------------------------------------------------------- standard themes
export const SYSTEM_THEME = 'system';
export const STANDARD_THEMES = [
  {
    id: 'light', name: 'Paddock', note: 'The standard light theme', base: 'light',
    colors: { bg: '#f3f2ef', surface: '#ffffff', ink: '#16181d', accent: '#e2561a', side: '#16181d' },
    exact: { 'surface-2': '#f7f6f3', 'ink-2': '#4a4f59', muted: '#7a808c', line: '#e2e0da', 'line-2': '#d2cfc7', 'accent-soft': '#fde9df',
      'ok-soft': '#e1f3e8', 'warn-soft': '#fff1d6', 'over-soft': '#fde4e4', 'info-soft': '#e5edfb', 'ai-soft': '#f1e9fd',
      'side-ink': '#d9dbe0', 'side-muted': '#8a909c', 'side-2': '#22252c', 'side-3': '#2a2d35', 'side-line': '#30343c' },
  },
  {
    id: 'dark', name: 'Night race', note: 'The standard dark theme', base: 'dark',
    colors: { bg: '#101216', surface: '#191c22', ink: '#eceef2', accent: '#ff7a3d', side: '#0b0c0f' },
    exact: { 'surface-2': '#20242b', 'ink-2': '#b9bec8', muted: '#868d99', line: '#2a2f37', 'line-2': '#363c46', 'accent-ink': '#15110e', 'accent-soft': '#3a2216',
      'ok-soft': '#173123', 'warn-soft': '#382a10', 'over-soft': '#3d1c1c', 'info-soft': '#1b2741', 'ai-soft': '#2a1d40',
      'side-ink': '#d9dbe0', 'side-muted': '#8a909c', 'side-2': '#1a1c21', 'side-3': '#22252c', 'side-line': '#2a2d35' },
  },
  {
    id: 'sunlight', name: 'Sunlight', note: 'High contrast for bright sun in the pits', base: 'light',
    colors: { bg: '#ffffff', surface: '#ffffff', ink: '#000000', accent: '#b83a0b', side: '#000000' },
    exact: { 'surface-2': '#f1f1f1', 'ink-2': '#1c1c1c', muted: '#3d3d3d', line: '#8f8f8f', 'line-2': '#5c5c5c', 'side-ink': '#ffffff', 'side-muted': '#c9c9c9' },
  },
  { id: 'racing-green', name: 'Racing green', note: 'Light, with a deep green sidebar', base: 'light',
    colors: { bg: '#eef1ec', surface: '#ffffff', ink: '#13201a', accent: '#1e6b45', side: '#0f2a1d' } },
  { id: 'pit-wall', name: 'Pit wall blue', note: 'Light, with navy and blue', base: 'light',
    colors: { bg: '#eef2f7', surface: '#ffffff', ink: '#111827', accent: '#1d5fd1', side: '#0f1b33' } },
  { id: 'chequered', name: 'Chequered flag', note: 'Black and white with a red accent', base: 'light',
    colors: { bg: '#f1f1f1', surface: '#ffffff', ink: '#111111', accent: '#c81e1e', side: '#111111' } },
  { id: 'midnight', name: 'Midnight', note: 'Dark navy with cyan', base: 'dark',
    colors: { bg: '#0b1220', surface: '#121a2b', ink: '#e6edf7', accent: '#22c3d6', side: '#070c16' } },
  { id: 'carbon', name: 'Carbon & amber', note: 'Near-black with amber, easy on the eyes at night', base: 'dark',
    colors: { bg: '#121212', surface: '#1b1b1b', ink: '#ececec', accent: '#f5b301', side: '#0a0a0a' } },
];
export const STANDARD = Object.fromEntries(STANDARD_THEMES.map((t) => [t.id, t]));

/** The theme object for a user's preferences; null means "match this device" (light/dark from the OS). */
export function resolveTheme(prefs) {
  const id = prefs?.theme || SYSTEM_THEME;
  if (id === SYSTEM_THEME) return null;
  return STANDARD[id] || (prefs.custom_themes || []).find((t) => t.id === id) || null;
}

/** Readability checks for a theme: [{ label, ratio, min }] that fall short. */
export function contrastIssues(theme) {
  const { tokens: t } = deriveTokens(theme);
  const checks = [
    ['Text on the page background', t.ink, t.bg, 4.5],
    ['Text on cards', t.ink, t.surface, 4.5],
    ['Faint text on cards', t.muted, t.surface, 3],
    ['Button text on the accent', t['accent-ink'], t.accent, 4.5],
    ['Accent on cards', t.accent, t.surface, 3],
    ['Sidebar text', t['side-ink'], t.side, 4.5],
  ];
  return checks.map(([label, a, b, min]) => ({ label, ratio: contrast(a, b), min })).filter((x) => x.ratio < x.min);
}

// ---------------------------------------------------------------- saved preferences
export const MAX_CUSTOM_THEMES = 12;
const str = (x, n) => (typeof x === 'string' ? x.trim().slice(0, n) : '');

/** Clean a preferences patch from a client; unknown keys are dropped. */
export function cleanPrefs(p = {}) {
  const out = {};
  if ('theme' in p) out.theme = /^[a-z0-9-]{1,40}$/.test(p.theme || '') ? p.theme : SYSTEM_THEME;
  if ('custom_themes' in p) {
    out.custom_themes = (Array.isArray(p.custom_themes) ? p.custom_themes : []).slice(0, MAX_CUSTOM_THEMES).flatMap((t) => {
      if (!t || !/^c-[a-z0-9]{4,24}$/.test(t.id || '')) return [];
      const colors = {};
      for (const { key } of KEY_COLOURS) { if (!HEX.test(t.colors?.[key] || '')) return []; colors[key] = t.colors[key].toLowerCase(); }
      return [{ id: t.id, name: str(t.name, 40) || 'My theme', base: t.base === 'dark' ? 'dark' : 'light', colors }];
    });
  }
  if ('nav_collapsed' in p) {
    out.nav_collapsed = [...new Set((Array.isArray(p.nav_collapsed) ? p.nav_collapsed : []).filter((k) => /^[a-z0-9_-]{1,20}$/.test(k)))].slice(0, 20);
  }
  if ('setup_layout' in p) out.setup_layout = cleanLayout(p.setup_layout); // section order, hidden and folded sections on setup sheets
  if ('calendar_view' in p) out.calendar_view = p.calendar_view === 'month' ? 'month' : 'agenda'; // Calendar: list or month view
  if ('hidden_checklists' in p) { // teams whose setup checklist this person has hidden
    out.hidden_checklists = [...new Set((Array.isArray(p.hidden_checklists) ? p.hidden_checklists : []).filter((k) => /^[0-9a-f-]{36}$/.test(k)))].slice(0, 50);
  }
  return out;
}
