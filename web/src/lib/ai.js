import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useSession } from './session.jsx';
import { isSheet, readSpreadsheet, sheetToText } from './sheets.js';

/** Whether the AI assistant can be used right now (licence, role, team switch, allowance, online). */
export function useAiStatus() {
  const { tid, canModule } = useSession();
  const allowed = canModule('ai');
  const [st, setSt] = useState({ available: false, reason: '', loading: allowed });
  useEffect(() => {
    if (!allowed || !tid) { setSt({ available: false, reason: '', loading: false }); return undefined; }
    let live = true;
    const load = () => {
      if (!navigator.onLine) { setSt({ available: false, offline: true, reason: 'AI needs an internet connection.', loading: false }); return; }
      api(`/t/${tid}/ai/status`).then((s) => live && setSt({ ...s, loading: false })).catch((e) => live && setSt({ available: false, reason: e.message, loading: false }));
    };
    load();
    window.addEventListener('online', load); window.addEventListener('offline', load); window.addEventListener('raceops:ai-changed', load);
    return () => { live = false; window.removeEventListener('online', load); window.removeEventListener('offline', load); window.removeEventListener('raceops:ai-changed', load); };
  }, [tid, allowed]);
  return { ...st, allowed };
}

export const aiChanged = () => window.dispatchEvent(new Event('raceops:ai-changed'));

const readAsDataUrl = (blob) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(blob); });

/** Photos are shrunk on the phone (max 1600 px, JPEG) before upload; PDFs are sent as they are. */
export async function fileToPart(file) {
  if (isSheet(file)) {
    // spreadsheets go to the AI as text (one block per sheet), so any layout can be read
    const sheets = await readSpreadsheet(file);
    const text = sheets.map((s) => `Sheet "${s.name}":\n${sheetToText(s)}`).join('\n\n').slice(0, 150_000);
    if (!text.trim()) throw new Error(`${file.name} looks empty.`);
    return { media_type: 'text/plain', name: file.name, text };
  }
  if (file.type === 'application/pdf') {
    if (file.size > 6 * 1024 * 1024) throw new Error(`${file.name} is over 6 MB — use a photo or a smaller PDF.`);
    return { media_type: 'application/pdf', data: (await readAsDataUrl(file)).split(',')[1] };
  }
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't a photo, PDF or spreadsheet (Excel .xlsx or CSV).`);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error(`Couldn't open ${file.name}.`)); i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
  } finally { URL.revokeObjectURL(url); }
}

export const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
