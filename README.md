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
| **Setup sheet** | Built from your *Sprint Set Up Sheet Collection*: weather, engine (motor, headers, pump, nozzles, gear, main/LS/HS), bars, blocked, ride height, wing, shocks and travel, tire pressures cold/hot, spec/size, stagger, wheels, race result, fuel (fuel used is calculated) and tach. **Final drive is calculated** from the gear set, gear position (low/high) and the car's ring & pinion. |
| **Starting a new sheet** | A new sheet asks where to start: the **previous session** at this event, the car's **last time out**, a **baseline**, or blank. Setup and weather are copied as starting values. Hot pressures, hot stagger, shock travel, race result, conditions & feedback, notes and photos are not copied. |
| **Baselines** | Tick **Save as a baseline setup** on any sheet and give it a name (e.g. "Archerfield slick"). Recall it from the start prompt, from **Start from baseline…** on each car at an event, or from **Setups → Baselines**. |
| **Track conditions & car feedback** | Each sheet has quick-pick track descriptions (Tacky, Slick, Rubbered up, Big cushion…), the driver's and crew lead's description of how the car behaved (Loose exit, Tight entry, No drive off…), and their comments plus changes for next session. You can also type your own descriptions. |
| **Search conditions & feedback** | **Setups → Search** filters every sheet by condition and behaviour tags (driver, crew lead or either), track, car and free text in comments. Results show the matching words highlighted and can be compared side by side, to see what you ran last time the track was like this. |
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

### Tracks, contacts, suppliers and series

- **Track directory (shared by all teams):** on first start the server loads 705 tracks:
  - 379 come from your two directory JSON files (AU/NZ and Canada/USA). Address, size, surface and classes are filled in from `Tracks.xlsx` where names match.
  - 294 more were in `Tracks.xlsx` but not the JSON (64 Australian, 230 US). Rows that matched an existing track by fuzzy name and state were merged, not duplicated. They are listed in `shared/seed/tracks_duplicates_skipped.csv`.
  - New Zealand (40 tracks) comes from `Tracks - New Zealand.xlsx`, checked 18 Oct 2026. The 8 NZ tracks already listed were matched and updated (e.g. *Riverside Raceway* → *Riverside Speedway*, Western Springs marked Closed); 32 were added. Unverified or conflicting values ("Not verified", "Conflicting: …"), contact-only addresses and suspect values were left blank. Every decision is in `shared/seed/nz_import_report.csv`.
  - Corrections to tracks that already exist on a server ship in `shared/seed/track_updates.json`. A field is changed only if it still holds the old value, so edits made by a platform admin are kept.
  - When the bundled list changes, an upgrade adds new tracks and fills empty fields. It never overwrites edits.
  - Fields follow the spreadsheet: name, address, location, state, size, surface, radius, banking, cushion, lat/long, website, contact number, status, notes and classes.
  - Platform admins refresh the directory from a newer JSON under **All teams & licences → Track directory import**. Tracks are matched on the JSON `id`, and you choose: add new only, fill empty fields, or overwrite.
- **Linking tracks to a team:**
  - **By class:** set **Classes we race** on the Tracks page. Tracks running a matching class appear under **Our tracks**.
  - **Manually:** open a track and choose **Link to team**. You can also set a home track or hide a class-matched track.
  - Teams can add a team-only track that's missing from the directory.
- **Contacts:**
  - **Shared:** admin-managed, e.g. track promoters.
  - **Team:** private to the team.
  - Each has full name, organisation, position, phones, emails, website and full address.
- **Roles:** a contact can be linked to any track, supplier, series, event or car, with a different role on each (Owner, Track promoter, Race director, Sales, Accounts… or type your own). Promoter links between shared records can themselves be shared.
- **Suppliers:** per team, with category, account number, phone, email, address and their contacts' roles.
- **Race series:** per team (name, season, class, sanctioning body, points notes). Events are either stand-alone or a round of a series, and link to a directory track.
  - Multi-day events (date → end date) get **Day 1 / Day 2…** tabs, and each setup sheet records its day.
  - The series page lists the rounds with each car's feature finish.

### Gears

- **Gear lists:** every team starts with the standard 10-spline quick-change chart (70 sets, with 4.12, 4.57 and 4.86 ring & pinions).
  - Add other lists (midget, micro, late model) under **Gears & tires → Gear lists**. Paste the chart in: each line needs a set number and the teeth, e.g. `15A 21/22`.
  - Ring & pinions are entered as pinion and ring teeth.
- **Per car:** set the car's gear list and ring & pinion ratio (Team → Cars).
- **Availability:** the **Gear chart & availability** tab shows low/high final drive for every ring & pinion. Enter **Team qty** for the sets you own, and untick any car that can't use a set.
- **Gear calculator:** pick the car and your current gear (or type its final drive) and the rpm, then:
  - **Hit a final drive:** ranks the sets closest to the ratio you want.
  - **Change rpm:** enter `+200`, `−150` or a target such as `8200`; it works out the ratio needed and ranks the sets.
  - **Try a gear set:** shows the new final drive, % change, rpm at the same speed and mph.
  - Results can be limited to the sets available for that car, or compared across every ring & pinion.
- Final drive = R&P × spur ratio (low = small ÷ large, high = large ÷ small). New rpm = rpm × new ratio ÷ current ratio.

### Adjustable shocks

- A shock asset, and each dyno run, can be **Non-adjustable, Single, Two-way, Three-way or Four-way**. Picking the shock on a run brings its type across.
- An adjustable run stores **one block per adjuster setting**: a label, the adjuster positions (LS/HS comp, LS/HS reb as applicable), a note such as "good if rough/heavy", and optional readings. All settings overlay on one graph; click a legend entry to hide or show it.
- **Paste whole printout** imports Kenco/Slade/Roehrig/Intercomp text: each title line starts a new setting, and header rows such as `Speed CC RO RC CO` map the columns.
- Single tables also have **Paste / import** and **Fill velocity** (e.g. 0–10 every 0.25).
- Setup sheets now record the **Adjuster settings** per corner, plus gear **position** and **final drive**.

### Areas, access and licensing

Access to anything is checked in three layers, on the server (sync, history and attachments) and in the app:

1. **Licence:** is the team licensed for this area or feature? Platform admins set this under **Platform admin → Teams & licences** by choosing a plan and ticking or unticking individual areas and features per team. Owners are bound by the licence too.
2. **Area access:** does the role include *Enter "At the Track"* (and so on)?
3. **Module action:** View / Edit / Delete for each module inside the area.

Changing a role or licence takes effect on each device at its next sync. Data the person can no longer see is removed from their device.

### Platform admin (global settings)

Platform admins get a **Platform admin** area (sidebar, home tile and an **Admin** tab on phones). The first account created is a platform admin, and it can make others admins.

| Page | What it manages |
|---|---|
| **Overview** | Teams by licence status, users, seats in use, licence allocation per plan, teams needing attention (expired, suspended, ending within 30 days, or out of seats), and recent admin activity. |
| **Teams & licences** | Create a team, optionally with an **owner invite link** for someone else (you don't have to join). Per team: name, plan, status (Active / Trial / Suspended), **seats**, **licence end date**, admin notes and feature overrides. You can also **Join & open** a team to support it, or delete a team (you type its name to confirm). |
| **Plans & allocation** | Edit what each plan includes, its **seats per team**, how many **licences** you have to allocate (shown as used / available), and a price note. You can add plans (e.g. *Club*), remove unused ones, and restore a built-in plan. |
| **Users** | Every account with its teams and last sign-in. Edit name or email, **reset password** (shows a one-time temporary password), make or remove platform admins, **disable** an account (signs it out everywhere), and remove someone from a team. |
| **Tracks & directory** | Track counts by country and status, data gaps, shared contacts and suppliers. Import, **export all tracks as JSON**, or re-apply the bundled list. |
| **Pick-lists** | The standard choices every team sees: track conditions, car behaviour, contact roles, supplier categories and race classes. Add, remove, reorder or paste a list; restore the default at any time. |
| **Settings** | App name (shown in the menu and browser tab), support email, invite link lifetime, default plan and seats for new teams, and an **announcement banner** for all users (Information / Warning / Critical, with an optional end date). |
| **System & activity** | Version, uptime, database size, uploads, migrations, record counts, a button to re-check base forms for every team, and the full **admin audit log**. |

How licences are enforced:
- **Seats:** a team can't create more invites than its seats (members plus pending invites). Accepting an invite also checks this. Blank seats means the plan's default; blank on the plan means unlimited.
- **Licence end date:** after this date the team can still sign in and read everything, but changes are refused. Everyone sees a red *read-only* banner until you renew.
- **Suspended:** members can't open the team at all (platform admins still can).
- Plan, seat and feature changes reach devices at their next sync or app refresh (within 10 minutes while the app is open).

### Teams, roles and permissions

- **Multi-team:** one person can belong to several teams and switch between them in the sidebar. Platform admins create more teams under **Platform admin → Teams & licences**.
- **Invites:** go to **Team → Invite someone** and pick a role. You get a link to send by text or email; it's valid for 14 days (platform admins can change this). Each team's **Licence** card shows its plan, seats and end date. Existing users who open it add the team to their account.
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
