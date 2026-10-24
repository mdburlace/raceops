---
id: offline-sync
title: Sign in, install, and work offline
section: tools
order: 10
summary: Install RaceOps on your phone, keep working with no signal, what the sync badge means, and how to repair a device that won't sync.
for: everyone
pages: /login, /profile
covers: setting:password
related: appearance
---
## Sign in and install

Sign in with your email and password. Then install the app so it opens full screen and works offline. **Profile & device → Install on this device** explains how:

- **iPhone / iPad (Safari):** Share → Add to Home Screen.
- **Android (Chrome):** ⋮ menu → Install app.
- **Computer (Chrome / Edge):** the install icon in the address bar.

You stay signed in for 60 days, so a long weekend without signal won't sign you out.

## Working offline

Everything you can see is stored on the device, and every save goes to the device first. The badge at the top shows:

- **Synced:** all up to date.
- **n to sync:** saved here, waiting to send.
- **Offline · n queued:** no connection; your changes are safe and will send later.
- **Syncing…:** sending now.
- **Can’t sync:** the server is answering, but this device still can't sync. Tap the badge to go to **Profile & device**, then use **Repair this device** (below).

Tap the badge to sync straight away. Sync also runs when the connection comes back, every 30 seconds, and when the app opens.

These need a connection: AI, track weather, photos and files, sharing, and team administration.

## Two people edited the same sheet?

The last save wins, by when each person pressed **Save**. The other version stays in **Change history**, marked *overwritten by a newer save*, so nothing is lost. Every record keeps its history: who changed what, and when.

## Profile & device

- **Your photo**: add or change the photo your teammates see. See [Team and member photos](/help/team-photos).
- **Your details** and **Change password**.
- **Sync now.**
- **Re-download all data** if this device seems out of step.
- **Repair this device** if the badge says **Offline** or **Can’t sync** on this device while the app works on others (see below).
- **Sign out of this device.**
- Choose your look; see [Themes and sidebar](/help/appearance).

## Repair this device

Sometimes one browser keeps something stale for RaceOps, such as an old redirect, and the app stays **Offline** on that device even though the connection is fine. Other devices, or a different browser on the same computer, work normally.

1. Open **Profile & device**. If the app has noticed the problem, the **Sync** section says so and the badge reads **Can’t sync**.
2. Tap **Repair this device**, then **OK**.
3. The app clears its stored files and cached data on this device, reloads, and downloads your team's data again. This can take a minute on a slow connection.

You stay signed in, and any changes still waiting to sync are kept and sent after the repair. It needs a connection: if the server can't be reached, nothing is changed and you can keep working offline.

Still stuck after a repair? In Chrome or Edge, press **F12**, open **Application → Storage**, and choose **Clear site data**. This also removes changes that haven't synced yet, so sync them from another browser first if you can.

Forgotten your password? Ask your platform admin for a reset.
