import { api, token } from './api.js';

// Team and member photos: shrunk on the device before upload, shown from the server (photos.js), with `at`
// in the address so a new photo shows straight away and an unchanged one comes from the browser cache.

const q = (at) => `?token=${encodeURIComponent(token() || '')}&v=${encodeURIComponent(at || '')}`;
export const teamPhotoUrl = (tid, at) => (tid && at ? `/api/t/${tid}/photo${q(at)}` : null);
export const userPhotoUrl = (uid, at) => (uid && at ? `/api/users/${uid}/photo${q(at)}` : null);

/** A photo made smaller (at most `max` px on its longer side) and saved as JPEG, ready to upload. */
export async function shrinkPhoto(file, max = 800) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('Choose a photo (JPEG, PNG, HEIC or WebP).');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { bmp = null; }
  if (!bmp) {
    // older Safari: draw it through an <img>
    bmp = await new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That photo couldn’t be read. Try a JPEG or PNG.')); };
      img.src = url;
    });
  }
  const w = bmp.width; const h = bmp.height;
  const k = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k)); canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);   // transparent PNGs get a white background
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
  if (!blob) throw new Error('That photo couldn’t be read. Try a JPEG or PNG.');
  return blob;
}

/** Upload a photo to `path` (PUT, multipart) after shrinking it; returns { at }. */
export async function uploadPhoto(path, file) {
  const blob = await shrinkPhoto(file);
  const form = new FormData();
  form.append('file', blob, 'photo.jpg');
  return api(path, { method: 'PUT', form });
}
export const removePhoto = (path) => api(path, { method: 'DELETE' });
