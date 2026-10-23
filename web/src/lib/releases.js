// Release notes in the app: one file per release from docs/releases, bundled so they work offline.
// The newest release's version is the app's version.
import { loadReleases } from '@shared/releases.js';

const raw = import.meta.glob('@docs/releases/*.md', { query: '?raw', import: 'default', eager: true });

export const RELEASES = loadReleases(Object.fromEntries(Object.entries(raw).map(([p, s]) => [p.split('/').pop(), s])));
export const CURRENT = RELEASES[0] || null;
export const APP_VERSION = CURRENT?.version || 'dev';
export const RELEASE = Object.fromEntries(RELEASES.map((r) => [r.version, r]));

/** "24 Oct 2026" */
export const releaseDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// "Updated" notice on Home: shown once on a device after it updates to a new release.
const SEEN_KEY = 'raceops.release.seen';
export function unseenRelease() {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (!seen) { localStorage.setItem(SEEN_KEY, APP_VERSION); return null; } // a new device starts up to date
    return seen !== APP_VERSION ? CURRENT : null;
  } catch { return null; }
}
export function markReleaseSeen() {
  try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* private mode */ }
}
