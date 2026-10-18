// Sign-in protection: counts failed password attempts per account and per client address,
// and locks either one out for a while once it has too many failures. In memory, so it
// resets when the server restarts (a single RaceOps server process).

const int = (x, d) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.floor(Number(x)) : d);

export const LIMITS = {
  account: int(process.env.LOGIN_MAX_PER_ACCOUNT, 5), // failures per account within the window
  ip: int(process.env.LOGIN_MAX_PER_IP, 20), // failures per client address within the window
  windowMs: int(process.env.LOGIN_WINDOW_MINUTES, 15) * 60_000,
  lockMs: int(process.env.LOGIN_LOCK_MINUTES, 15) * 60_000,
};

const buckets = new Map(); // key -> { fails: [timestamps], until, locks }
const limitFor = (key) => (key.startsWith('ip:') ? LIMITS.ip : LIMITS.account);

/** Keys for a sign-in attempt: the account (email or user id) and the client address. */
export const keysFor = (req, account) => [`acct:${String(account || '').trim().toLowerCase()}`, `ip:${req.ip || 'unknown'}`];

/** If any key is locked, returns { key, retryAfter (seconds), until }. */
export function blocked(keys) {
  const now = Date.now();
  for (const key of keys) {
    const b = buckets.get(key);
    if (b?.until && b.until > now) return { key, retryAfter: Math.ceil((b.until - now) / 1000), until: new Date(b.until) };
  }
  return null;
}

/** Record a failed attempt; calls onLock(key, until) when a key becomes locked. */
export function fail(keys, onLock) {
  const now = Date.now();
  for (const key of keys) {
    const b = buckets.get(key) || { fails: [], until: 0, locks: 0 };
    b.fails = b.fails.filter((t) => now - t < LIMITS.windowMs);
    b.fails.push(now);
    if (b.fails.length >= limitFor(key)) {
      // repeat offenders wait longer: 1×, 2×, 4× the lock time, capped at 24 hours
      b.locks += 1;
      b.until = now + Math.min(LIMITS.lockMs * 2 ** (b.locks - 1), 24 * 3600_000);
      b.fails = [];
      onLock?.(key, new Date(b.until));
    }
    buckets.set(key, b);
  }
}

/** A correct password clears the account's count (the address keeps its history). */
export function succeed(keys) {
  for (const key of keys) if (!key.startsWith('ip:')) buckets.delete(key);
}

export function clear(key) { return buckets.delete(key); }

/** Active lockouts and accounts/addresses with recent failures, for the admin pages. */
export function list() {
  const now = Date.now();
  const out = [];
  for (const [key, b] of buckets) {
    const fails = b.fails.filter((t) => now - t < LIMITS.windowMs).length;
    const locked = b.until > now;
    if (!locked && !fails) { if (!b.locks || now - b.until > 24 * 3600_000) buckets.delete(key); continue; }
    out.push({ key, type: key.startsWith('ip:') ? 'address' : 'account', value: key.slice(key.indexOf(':') + 1), locked, until: locked ? new Date(b.until) : null, fails, limit: limitFor(key) });
  }
  return out.sort((a, b) => Number(b.locked) - Number(a.locked) || b.fails - a.fails);
}

// keep memory bounded
setInterval(() => list(), 10 * 60_000).unref();
