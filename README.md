# RaceOps — Race Team Manager

A self-hosted, multi-team app for race setups, maintenance and assets. You use it in any browser, or install it on iPhone, iPad, Android and desktop. It keeps working with no signal at the track and syncs when you're back online.

The app is organised into four **areas**, each with its own access control and licensing:

| Area | What's in it |
|---|---|
| **At the Track** | Events, setup sheets per session (with Crew Chief), between-round checks, quick-change gear chart, tire inventory and stagger combinations |
| **In the Workshop** | Car maintenance checklists and service schedules, asset lifecycle and measurements, shock dyno runs and torsion-bar rate tests with overlay graphs |
| **Engine Builds** | Full build sheet per engine (from *Engine_Buildsheet_v5*): block, bores, crank, cam timing, pistons and rings, heads, valvetrain, fastener torque, with CID, compression ratio and cam calculations |
| **Team Management** | Cars, members and invites, roles and permissions, forms, season reports (CSV), Crew Chief stats and performance reviews |

The landing page shows the four areas with live status and each area's "Coming next" roadmap. Areas you can't use are shown locked, with the reason: *No access* (your role) or *Not in plan* (your licence).

---

## 1. Deploy with Portainer

1. Copy this folder to the Docker host, or push it to a Git repo that Portainer can reach.
2. In Portainer, go to **Stacks → Add stack**.
   - **Repository:** point it at the repo; the compose path is `docker-compose.yml`.
   - **Upload:** upload `docker-compose.yml`. Portainer needs the build context, so for upload use the "Web editor" plus a pre-built image (see *Pre-building the image* below).
3. Add the stack's **environment variables**:
   | Variable | Value |
   |---|---|
   | `POSTGRES_PASSWORD` | a strong password |
   | `JWT_SECRET` | a random string of 32+ characters (e.g. `openssl rand -hex 32`) |
   | `APP_PORT` | host port, default `8080` |
4. Deploy. Open `http://<host>:8080` and the first-run screen will ask you to create the administrator and your first team.

The data lives in two named volumes: `raceops_db` (Postgres) and `raceops_uploads` (photos and files). Back up both.

### HTTPS is required for phones

Browsers only allow the offline app (service worker) and "Add to Home Screen" over **HTTPS**; `localhost` is the only exception. Put RaceOps behind whatever you already use, for example:
- **Nginx Proxy Manager** or **Traefik**, with a Let's Encrypt certificate, proxying to `app:8080`
- **Cloudflare Tunnel** or **Tailscale Serve**, if you don't want to open ports

Allow uploads up to `MAX_UPLOAD_MB` in your proxy. In Nginx Proxy Manager, add `client_max_body_size 25m;` under Advanced.

### Pre-building the image (optional)

```bash
docker build -t raceops:latest .
```
Then deploy the stack with the `build:` line removed, so it uses `image: raceops:latest`.

### Updating

Pull or replace the files and **re-deploy** the stack with "re-pull / rebuild" ticked. Database migrations run automatically on start. Installed apps pick up the new version the next time they open.

---

## 2. Using it

| Area | What it does |
|---|---|
| **Events** | Race meetings. Each event shows a grid of *car × session* (Hot Laps, Qualifying, Heat 1/2, Dash, B-Main, Feature, Practice). Tap a cell to fill that session's setup sheet. |
| **Setup sheet** | Built from your *Sprint Set Up Sheet Collection*: weather, engine (motor, headers, pump, nozzles, gear, main/LS/HS), bars, blocked, ride height, wing, shocks and travel, tire pressures cold/hot, spec/size, stagger, wheels, race result, fuel (fuel used is calculated) and tach. A new sheet **carries forward** the car's previous session. Weather, race and notes start blank. |
| **Compare** | Put 2–4 sheets side by side with differences highlighted ("Only differences" toggle). Available from an event (*Compare sessions*) or the Setups list. |
| **Asset links** | The Bars, Shocks, Motor and Gear fields pick from your asset list (or you can type free text). That links the shock or bar to the setup and the event it ran in, and it counts **laps and race meetings** toward the asset's life. |
| **Maintenance → Checklists** | Your *Race Car Maintenance Check List*: Weekly, Every 2nd race, Monthly / 4th race. Longer intervals include the shorter ones. Items can record a measurement (e.g. toe-out, pad thickness) and a note. |
| **Maintenance → Schedules** | "Rebuild LF shock every 8 races", "Freshen engine every 600 laps", "Bleed brakes every 30 days". Races and laps are counted automatically from setup sheets. *Done today* resets the counter. Due and overdue items show on Home. |
| **Assets** | Shocks, bars, engines, gears, rear ends, wings, safety gear and more. Each has a status (In Service / Spare / Out for Service / On Order / Retired), assigned car and position, a parent asset (e.g. gear installed in rear end), purchase details, a life limit in laps/races/hours, an expiry date (e.g. SFI belts) and **measurements over time**, charted against a spec band. |
| **Photos & files** | On any saved record (wear photos, receipts, dyno printouts). Needs a connection. |
| **Change history** | Every save is kept with who made it and what changed, including offline edits that were overwritten. |

### Offline and sync

- Everything you can see is stored on the device, and edits save locally first. The badge at the top shows **Synced**, **n to sync**, **Offline · n queued** or **Syncing…**. Tap it to sync now.
- Sync runs on reconnect, every 30 seconds, and when the app is reopened.
- **Conflicts:** last save wins, based on when each person pressed Save. The losing version stays in *Change history*, marked "overwritten by a newer save".
- Sessions last 60 days (`JWT_TTL`), so a long offline weekend won't sign anyone out.

### Areas, access and licensing

Access to anything is checked in three layers, on the server (sync, history and attachments) and in the app:

1. **Licence:** is the team licensed for this area or feature? Platform admins set this under **All teams & licences** by choosing a plan (Pro, Trackside or Engine shop) and ticking or unticking individual areas and features per team. Owners are bound by the licence too.
2. **Area access:** does the role include *Enter "At the Track"* (and so on)?
3. **Module action:** View / Edit / Delete for each module inside the area.

Changing a role or licence takes effect on each device at its next sync. Data the person can no longer see is removed from their device.

### Teams, roles and permissions

- **Multi-team:** one person can belong to several teams and switch between them in the sidebar. As platform admin, the first user can create more teams under **All teams**.
- **Invites:** go to **Team → Invite someone** and pick a role. You get a link to send by text or email; it's valid for 14 days. Existing users who open it add the team to their account.
- **Roles:** Owner, Crew Chief, Mechanic and Driver/Viewer come built in. Under **Roles & permissions** you can create your own and set View / Edit / Delete per area (Cars, Events, Setups, Maintenance, Assets, plus the Phase 2 areas), along with the admin rights: edit forms, manage members, manage roles, and team settings.

### Editing forms

**Forms** lets anyone with "Edit forms & fields" do the following:
- Rename, add, remove and reorder fields and sections.
- Field types: text, number, dropdown, date, yes/no, corners (LF/RF/LR/RR, or rears only), asset picker filtered by category, link to car/event/asset, calculated (e.g. `fuel_start - fuel_finish` or `(ride_height.LF + ride_height.RF) / 2`), and checklist items with a frequency and optional measurement.
- Edit the session list that appears on events.
- Choose which setup sections carry forward.
- Duplicate a form to make a variant (e.g. a wingless sheet) and choose the default.

Core fields that drive app logic can be renamed but not deleted.

---

## 3. Development

```bash
# Postgres running locally with db/user raceops
cd server && npm install && DATABASE_URL=postgres://raceops:raceops@localhost:5432/raceops npm start   # :8080
cd web && npm install && npm run dev                                                                    # :5173, proxies /api
```

### Layout

```
shared/       catalog.js (modules, permissions, default roles) · baseForms.js (seed forms from your sheets)
server/       Express API · migrations/*.sql (auto-applied) · src/index.js (auth, teams, roles, invites, sync, attachments)
web/          React PWA · lib/store.js (IndexedDB) · lib/sync.js (push/pull) · components/FormRenderer.jsx · pages/*
```

### Data model and sync

- `records(id, tenant_id, type, data jsonb, deleted, client_updated_at, seq)` holds every business object: car, event, setup, maintenance, schedule, asset, measurement and form. Phase 2 types (`dyno_run`, `gear`, `tire`, `engine_build`) are already reserved in `shared/catalog.js`, so adding them needs no schema change.
- **Pull:** `GET /api/t/:team/sync?since=<seq>` returns only the types the user's role can view.
- **Push:** `POST /api/t/:team/sync` checks edit or delete permission for each change, applies last-write-wins on `client_updated_at`, and writes every attempt to `record_history`.
- Each team is isolated by `tenant_id` on every query, and membership plus role is checked on every request.

### Path to native store apps

The installable web app already covers offline use on iOS and Android. For App Store or Play Store listings, the plan is to wrap this same web build with Capacitor, which adds native camera and file access and push notifications without a second codebase.
