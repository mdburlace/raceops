import { useEffect, useRef, useState } from 'react';
import { removePhoto, uploadPhoto } from '../lib/photos.js';

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

/** A round photo, or the person's (or team's) initials when there isn't one. */
export function Avatar({ src, name, size = 36, square = false, className = '', testid }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) };
  return (
    <span className={`avatar${square ? ' square' : ''} ${className}`} style={style} data-testid={testid} aria-hidden={src && !broken ? undefined : 'true'}>
      {src && !broken ? <img src={src} alt={name ? `Photo of ${name}` : 'Photo'} onError={() => setBroken(true)} /> : <span>{initials(name)}</span>}
    </span>
  );
}

/**
 * Add, change or remove a photo: `path` is where it's uploaded (PUT) and removed (DELETE). Opens the camera
 * or the photo library on a phone. `onDone({ at })` after a change.
 */
export function PhotoButtons({ path, has, onDone, label = 'photo', small = false }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setErr('');
    try { onDone(await uploadPhoto(path, f)); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove this ${label}?`)) return;
    setBusy(true); setErr('');
    try { onDone(await removePhoto(path)); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const cls = `btn ${small ? 'small ' : ''}ghost`;
  return (
    <span className="photo-buttons">
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} aria-label={`Choose a ${label}`} />
      <button type="button" className={cls} disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Saving…' : has ? `Change ${label}` : `Add ${label}`}</button>
      {has && <button type="button" className={`${cls} danger`} disabled={busy} onClick={remove}>Remove</button>}
      {err && <span className="error-text small" role="alert">{err}</span>}
    </span>
  );
}
