// Maps a track from the directory JSON files (or RaceOps' own seed/export layout) to the
// Track form's values. Used for the first-start seed and the admin "Import tracks" tool.

const s = (x) => (x === null || x === undefined ? '' : String(x).trim());

export function mapImportedTrack(t) {
  if (!t || typeof t !== 'object' || !s(t.name)) return null;
  if ('ext_id' in t) return { ...t, classes: Array.isArray(t.classes) ? t.classes : [] }; // already in RaceOps layout
  const gps = t.gps || {};
  const length = s(t.length).toLowerCase() === 'inactive' ? '' : s(t.length);
  const status = /inactive/i.test(s(t.status)) || s(t.length).toLowerCase() === 'inactive' ? 'Inactive'
    : /closed/i.test(s(t.status)) ? 'Closed' : 'Active';
  return {
    name: s(t.name),
    address: s(t.address),
    city: s(t.city),
    region: s(t.state) || s(t.province) || s(t.region),
    country: s(t.country),
    length,
    surface: s(t.surface),
    radius: s(t.radius),
    banking: s(t.bank || t.banking),
    cushion: s(t.cushion),
    dirt_type: s(t.dirtType || t.dirt_type),
    typical: s(t.typical),
    lat: gps.lat === null || gps.lat === undefined ? s(t.lat) : String(gps.lat),
    lon: gps.lon === null || gps.lon === undefined ? s(t.lon) : String(gps.lon),
    website: s(t.website),
    phone: s(t.phone || t.contactNumber),
    status,
    notes: s(t.notes),
    classes: Array.isArray(t.classes) ? t.classes.map(s).filter(Boolean) : ['Sprintcars'],
    ext_id: s(t.id),
  };
}

/** Loose class match: "410 Sprintcars" matches "Sprintcars", "410 and 360 Sprintcars", etc. */
const norm = (c) => s(c).toLowerCase().replace(/sprint\s*cars?/g, 'sprintcar').replace(/[^a-z0-9]/g, '');
export function classMatches(teamClasses, trackClasses) {
  const tc = (teamClasses || []).map(norm).filter(Boolean);
  const out = [];
  for (const c of trackClasses || []) {
    const n = norm(c);
    if (n && tc.some((x) => x === n || x.includes(n) || n.includes(x))) out.push(c);
  }
  return out;
}
