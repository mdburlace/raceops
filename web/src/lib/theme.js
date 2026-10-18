// Applies the user's theme by setting the colour tokens on <html>. "Match this device" clears
// them so the stylesheet's light/dark media query decides. The last theme is cached so the
// next launch paints in the right colours before the session loads (and when offline).
import { deriveTokens, resolveTheme } from '@shared/themes.js';

const CACHE = 'raceops.theme';
let applied = [];

export function applyTheme(theme) {
  const root = document.documentElement;
  for (const k of applied) root.style.removeProperty(`--${k}`);
  applied = [];
  root.style.removeProperty('color-scheme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    delete root.dataset.theme;
    meta?.setAttribute('content', window.matchMedia?.('(prefers-color-scheme: dark)').matches ? '#0b0c0f' : '#16181d');
    return;
  }
  const { tokens, scheme } = deriveTokens(theme);
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--${k}`, v);
  applied = Object.keys(tokens);
  root.style.setProperty('color-scheme', scheme);
  root.dataset.theme = theme.id || 'preview';
  meta?.setAttribute('content', tokens.side);
}

export function applyPrefsTheme(prefs) {
  const theme = resolveTheme(prefs);
  applyTheme(theme);
  try { localStorage.setItem(CACHE, JSON.stringify(theme)); } catch { /* private mode */ }
}

export function applyCachedTheme() {
  try { applyTheme(JSON.parse(localStorage.getItem(CACHE) || 'null')); } catch { /* ignore a bad cache */ }
}
