import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { startSyncLoop } from './lib/sync.js';
import { applyCachedTheme } from './lib/theme.js';
import './styles.css';

applyCachedTheme();

// Offline app shell. New versions activate on next launch.
registerSW({ immediate: true });

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__raceopsInstall = e;
  window.dispatchEvent(new Event('raceops:installable'));
});

// Ask the browser not to evict offline data under storage pressure.
navigator.storage?.persist?.().catch(() => {});

startSyncLoop();

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
