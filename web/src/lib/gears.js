import { num, v } from './data.js';

/** Ring & pinion ratio from a list row { label, pinion, ring } (falls back to the label). */
export const rpRatio = (rp) => {
  const p = num(rp?.pinion); const r = num(rp?.ring);
  return p && r ? r / p : num(rp?.label);
};
export const rpName = (rp) => {
  const x = rpRatio(rp);
  return `${x ? x.toFixed(2) : rp?.label || '?'}${rp?.pinion && rp?.ring ? ` (${rp.pinion}-${rp.ring})` : ''}`;
};

/** Spur ratios for a set: low = small ÷ large, high = large ÷ small. */
export function spur(set) {
  const a = num(set?.small); const b = num(set?.large);
  if (!a || !b) return null;
  return { low: a / b, high: b / a };
}

/** Teeth for an owned gear record (Phase 2 records used upper/lower). */
export function gearTeeth(g) {
  const s = num(v(g, 'small')) ?? Math.min(num(v(g, 'upper')) || Infinity, num(v(g, 'lower')) || Infinity);
  const l = num(v(g, 'large')) ?? Math.max(num(v(g, 'upper')) || 0, num(v(g, 'lower')) || 0);
  return Number.isFinite(s) && l ? { small: s, large: l } : null;
}

const key = (a, b) => `${Math.min(a, b)}/${Math.max(a, b)}`;

/**
 * Every (set × position × R&P) option for a gear list.
 * owned: Map teethKey -> [gear records]; car: restrict to sets available for that car.
 */
export function gearOptions(list, { rps, owned, car, onlyOwned, includeLowHp = true }) {
  const sets = (v(list, 'sets') || []).filter((s) => spur(s) && (includeLowHp || !/low/i.test(s.note || '')));
  const out = [];
  for (const s of sets) {
    const sp = spur(s);
    const mine = owned?.get(key(num(s.small), num(s.large))) || [];
    const avail = mine.filter((g) => v(g, 'status') !== 'Retired' && v(g, 'status') !== 'Damaged'
      && (!car || !(v(g, 'available_for') || []).length || v(g, 'available_for').includes(car)));
    if (onlyOwned && !avail.length) continue;
    for (const rp of rps) {
      const r = rpRatio(rp);
      if (!r) continue;
      for (const pos of ['Low', 'High']) {
        if (pos === 'High' && s.small === s.large) continue;
        out.push({ set: s, pos, rp, rpRatio: r, ratio: r * (pos === 'Low' ? sp.low : sp.high), owned: mine.length > 0, available: avail.length > 0, gears: mine });
      }
    }
  }
  return out;
}

export function ownedByTeeth(gears) {
  const m = new Map();
  for (const g of gears) {
    const t = gearTeeth(g);
    if (!t) continue;
    const k = key(t.small, t.large);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(g);
  }
  return m;
}
export const teethKey = key;

/** Engine rpm change at the same road speed when going from ratio a to ratio b. */
export const rpmFor = (rpm, fromRatio, toRatio) => rpm * (toRatio / fromRatio);
/** mph at rpm for a tire circumference in inches. */
export const mphAt = (rpm, ratio, circIn) => (rpm * circIn) / (ratio * 1056);
