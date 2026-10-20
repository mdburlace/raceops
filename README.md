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

> **Design and operations:** [docs/design/DESIGN.md](docs/design/DESIGN.md) describes the whole system (data model, sync, security, backup and disaster recovery). [docs/design/ROLLOUT.md](docs/design/ROLLOUT.md) covers development, staging and production environments and how releases are deployed.

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

Browsers only allow the offline app (service worker) and "Add to Home Screen" over **HTTPS**; `localhost` is the only exception. Use one hostname, e.g. `raceops.yourdomain.com`, with one trusted certificate, both inside your network and on the internet. An installed app belongs to the address it was installed from, so a different address at home and away would mean two separate installs and two offline copies.

Any reverse proxy works: **pfSense** (below), **Nginx Proxy Manager**, **Traefik**, **Cloudflare Tunnel** or **Tailscale Serve**. Allow uploads up to `MAX_UPLOAD_MB`; in Nginx Proxy Manager, add `client_max_body_size 25m;` under Advanced. HAProxy has no limit by default.

### Publishing through pfSense (HAProxy + Let's Encrypt)

**You need:**
- A domain you control, ideally with DNS at Cloudflare or another provider supported by pfSense's ACME package.
- A public IP on the WAN. Behind carrier-grade NAT (CGNAT), port forwarding won't work, so see *Without opening ports* below.
- The **acme** and **haproxy** packages, installed from System → Package Manager.

**1. Free up port 443 on pfSense.** In System → Advanced → Admin Access, move the webConfigurator to another port (e.g. `8443`) and tick *Disable webConfigurator redirect rule*.

**2. Certificate (Services → Acme Certificates)**
1. In your DNS, add an A record `raceops.yourdomain.com` pointing to your WAN IP. Use pfSense Dynamic DNS if the IP changes.
2. *Account keys*: add one for **Let's Encrypt Production**, then register it.
3. *Certificates*: add one for `raceops.yourdomain.com`, with method **DNS-Cloudflare** (an API token with *Zone → DNS → Edit*). DNS validation means port 80 never has to be open for renewals.
4. In the certificate's *Actions list*, add the shell command `/usr/local/etc/rc.d/haproxy.sh restart`.
5. Click **Issue**. It renews automatically.

**3. HAProxy (Services → HAProxy)**
- **Backend** `raceops`:
  - Server: the Docker host's LAN IP, port `8080` (`APP_PORT`).
  - Health check: HTTP `GET /api/health`.
  - Long AI reads (a multi-page dyno PDF, for example) run in the background, and the app checks back every couple of seconds, so HAProxy's default 30-second *Server timeout* is fine. Raising it isn't needed.
- **Frontend** `https`:
  - Listen on **WAN address : 443** and **LAN address : 443**, both with *SSL offloading* ticked.
  - Type *http / https (offloading)*. Certificate: the ACME certificate.
  - ACL *Host matches* `raceops.yourdomain.com` → backend `raceops`.
  - Tick **Use "forwardfor" option**, so RaceOps sees each person's real address for sign-in protection.
  - Optional: a response header `Strict-Transport-Security: max-age=31536000`.
- Optional: a frontend on WAN and LAN port 80 that redirects to https.
- *Settings*: tick **Enable HAProxy**, then Save and Apply.

**4. Firewall.** In Firewall → Rules → WAN, allow **TCP 443** (plus 80 if you added the redirect) to destination **This Firewall**. No NAT port forward is needed, because HAProxy runs on pfSense itself.

**5. HTTPS inside your network.** In Services → DNS Resolver → **Host Overrides**, add `raceops` · `yourdomain.com` → **pfSense's LAN IP**. Phones on your Wi-Fi then reach HAProxy directly with the same valid certificate, with no warnings and no NAT reflection. Phones set to use private DNS (DNS-over-HTTPS) can bypass the override; turn that off on any phone that doesn't resolve the name. Then open `https://raceops.yourdomain.com` on each phone and **Add to Home Screen** (iPhone) or **Install app** (Android).

**6. Lock down the Docker host.**
- Only pfSense should be able to reach port 8080. Firewall the Docker host or its VLAN so other devices can't connect to it directly.
- Keep `JWT_SECRET` (long and random) and `POSTGRES_PASSWORD` in Portainer's stack environment, never in the repo.

**Without opening ports**
- **Cloudflare Tunnel:** add a `cloudflared` container to the stack. You get public HTTPS with no inbound ports, and it works behind CGNAT. Keep the pfSense host override for fast LAN access.
- **Tailscale** (`tailscale serve`): HTTPS for your team only. Nothing is exposed to the internet, which suits a crew-only setup.

### Security

- **Sign-in protection.** After **5 wrong passwords for one account**, or **20 from one address**, within 15 minutes, sign-in is locked for 15 minutes. Each repeat lockout doubles that, up to 24 hours. A correct password still gets "Too many sign-in attempts" while the lock is on, and people already signed in are not affected. The same rules apply to accepting an invite with an existing account and to changing a password.
  - Lockouts are recorded in **Platform admin → System & activity**, which also lists accounts and addresses with recent failures and lets you **Unlock** or **Clear** them.
  - **Platform admin → Users** shows a locked account with an **Unlock sign-in** button. Resetting someone's password also clears their lock.
  - Lockouts are kept in memory, so restarting the container clears them.

| Setting | Default | Meaning |
|---|---|---|
| `LOGIN_MAX_PER_ACCOUNT` | `5` | Wrong passwords allowed per account within the window |
| `LOGIN_MAX_PER_IP` | `20` | Wrong passwords allowed per client address within the window |
| `LOGIN_WINDOW_MINUTES` | `15` | Window for counting failures |
| `LOGIN_LOCK_MINUTES` | `15` | First lockout length (doubles on repeats, max 24 h) |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Which proxies' `X-Forwarded-For` is trusted. The default covers a proxy on a private network such as pfSense. If your proxy has a public address, set its IP here. |

- **Accounts.** Platform admins can disable an account (it's signed out everywhere), reset a password, and see each person's last sign-in. Teams can be suspended or set to read-only (expired licence) from the admin area.
- **Sessions** last `JWT_TTL` (60 days by default) so the app keeps working offline over a race weekend. Changing `JWT_SECRET` signs everyone out.

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
| **Events** | Race meetings for one **car**. The **Track** is picked from the track directory (your own tracks are listed first), and the event's location, length, surface and banking fill in from it; they stay editable. If a track isn't in the directory, a free-text name field appears instead. If the team has only one active car, it's chosen for you. |
| **Sessions** | An event lists only its car's sessions, in the usual running order. **Add session** one at a time: pick a standard name (Hot Laps, Qualifying, Heat 1/2, Dash, B-Main, Feature, Practice; the next unused one is suggested) or choose *Other* and type any name, e.g. *Last chance* or *Test & tune*. The session field on a setup sheet accepts a typed name too. Tap **Reorder** to move sessions with ▲ ▼ into the order they ran. A missed standard session (e.g. Qualifying added after Heat 1) slots into its usual place automatically; a missed custom one goes last and can be moved up. Events created before the Car field ask which car raced, and any sheets already recorded for other cars stay listed below. |
| **Setup sheet** | Built from your *Sprint Set Up Sheet Collection*: weather, engine (motor, headers, pump, nozzles, gear, main/LS/HS), bars, blocked, ride height, wing, shocks and travel, tire pressures cold/hot, spec/size, stagger, wheels, race result, fuel (fuel used is calculated) and tach. **Final drive is calculated** from the gear set, gear position (low/high) and the car's ring & pinion. |
| **Starting a new sheet** | A new sheet asks where to start. **Copy a session** lists this event's sessions in running order, then the car's earlier events; it defaults to the **previous session** (the one just before the new sheet). The other choices are **last time out**, a **baseline**, or blank. A saved sheet can also copy from any of these with *Copy from…*. Setup and weather are copied as starting values. Hot pressures, hot stagger, shock travel, race result, conditions & feedback, notes and photos are not copied. |
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
- **Torsion bar tests** record:
  - the bar's identity (serial, maker, model, size, type, corner);
  - arm length and the travel the rate is taken at (15 in and 3 in to start with);
  - compression and rebound readings, or just the two values at the test travel.

  The test shows the rate, rebound rate, split (hysteresis) and its difference from nominal and from the baseline. **Rate baselines** average the tests ticked **Use in baseline averages** for each size and type. The code is in `shared/bars.js`.
- **Test speeds:** a shock run is tested at one or more speeds, starting with 3.00, 6.00 and 10.00 in/s; you can type others. Readings are entered per speed: each row stores its speed in `s`, and older rows without one can be moved to a speed. Each speed is its own curve.
- Single tables also have **Paste / import** and **Fill velocity** (e.g. 0–10 every 0.25). **Paste / import** can also **Load Excel / CSV file** (.xlsx, .csv, .tsv; pick the sheet if there are several). Old-style .xls files need saving as .xlsx first.
- **Shocks on setup sheets:** each corner lists shocks set to that **position** (or with no position) and for that car (or no car). **Show all shocks…** at the bottom of the list adds the rest.
- **Adjuster settings** follow the shock picked at each corner. A two-way shows *Comp* and *Reb*, a three-way *LS comp / HS comp / Reb*, a four-way all four. A non-adjustable shock shows *Not adjustable*. If all four shocks are non-adjustable, the field is hidden. A shock typed in by hand, or with no type set, gets a free-text box.
- **Bump rubbers** per corner: type, spec, height, number of packers and gap.
- Setup sheets also record gear **position** and **final drive**.

### Setup sheet layout

- **Section bar:** stays under the title. Tap a section to jump to it. A number on a section shows how many values changed from the copied session.
- **⇅ Arrange:** each person sets their own section order and hides sections they don't use. This is saved in their preferences (`setup_layout`), so it follows them to every device. Tapping a section title folds it. Session folds on saved sheets.
- **Changes:** values that differ from the session the sheet was copied from (`copied_from`, or else the previous session) are highlighted with **was …**. **Changes only** shows just those values.
- **All / Before / After:** fields recorded after the session are tagged `stage: 'after'`, and the switch shows one group or the other.
- **Quick entry:** four-corner values sit on one row. Pressures, wing, nose wing, main jet and shock adjusters have − and + buttons. Enter moves to the next box.
- **Section changes:** shocks are a card per corner, and Wing has its own section. Radius rod and rear steer moved to Chassis. These are applied as form upgrades, and only once, so a team that rearranges its form keeps its own layout.

### Fuel units

- **Units:** fuel is recorded in US gallons or litres. A setup sheet stores its unit in `fuel_unit`, and a car stores its minimum in `fuel_min_unit`. A missing unit means gallons.
- **Show in:** converts what's on screen without changing what's stored.
- **Changing the recorded unit:** converts the amounts already entered.
- **Team default:** `settings.fuel_units` sets the unit for new sheets and cars.
- **Where it's used:** the fuel planner, analytics and the fuel calculator convert as needed.

### Fuel planner

The **Race** section of a setup sheet opens with a fuel plan:

- **Fuel per lap** comes from sessions with laps, fuel started and fuel finished filled in. It uses this event's earlier sessions and this track with this engine at other events (track matched by track record, or name). If there are none, it falls back to this track with this car, then this car anywhere. The sources and session counts are shown.
- **Planned laps** × fuel per lap + the car's **Minimum fuel (pickup)** = the fuel to start with. **Use as fuel started** puts it in.
- Set **Minimum fuel (pickup)** on the car: the least fuel that keeps the pickup covered under load.
- Warnings show if fuel started is below the plan, or fuel finished came in under the minimum.

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

### AI assistant

The AI features use Claude through the Anthropic API. They're off until a platform admin turns them on.

**Setting it up**
1. In the Claude Console (platform.claude.com), create a workspace called *RaceOps* (Settings → Workspaces). Then create a key on the **API keys** page, choosing that workspace. Add it to the Portainer stack as `ANTHROPIC_API_KEY`. The key stays on the server and is never sent to phones.
2. Go to **Platform admin → AI assistant** and tick *Turn on the AI assistant*. Then:
   - **Models:** choose the model for photo fill and debriefs (default Claude Haiku 5.5, fast and low cost) and for Ask RaceOps (default Claude Sonnet 5.5).
   - **Allowance:** set the default monthly allowance per team in US$.
   - Click **Test connection**.
3. AI is an **add-on** licence feature. It's included in *Pro*, and you can tick it on any plan or team under Plans & allocation or Teams & licences.
4. Roles: each role has an **AI assistant** permission under *Shared data*. Existing roles get it; untick it for any role that shouldn't use AI.

**What it does**

| Feature | Where | How it works |
|---|---|---|
| **Fill from photo** | The **AI** bar on any form you can edit: setup sheets, dyno runs, engine builds, maintenance… | Take or pick up to 6 photos, a PDF, or an Excel / CSV file: a paper setup sheet, a tire-temperature card, a dyno printout. The AI reads them and lists the values it found next to what's already there. Untick anything wrong, then **Apply**. Dyno printout tables go through the same importer as *Paste whole printout*, so each setting becomes its own curve. Only clearly readable values are filled; nothing is guessed. |
| **Voice debrief** | Setup sheets → **Voice debrief** | Choose Driver or Crew lead, tap **Talk** (or use the keyboard's microphone) and describe the session. **Fill feedback** turns it into track-condition and car-behaviour descriptions from your pick-lists, tidied comments, track notes and *changes for next session*, all shown for review first. Offline, **Save to comments as is** keeps the words so they can be tidied later. |
| **Ask RaceOps** | **Ask RaceOps** in the menu | Questions in plain English about your records, e.g. "What did we run last time the track was slick?" or "Which shocks are due for service?" Answers link to the setup sheets, events and assets they came from. It can only **read** what that person is allowed to see, and it never changes anything. |

**Costs and control**
- **Allowance:** each team has a monthly allowance (the default, or its own amount on Teams & licences; 0 turns AI off for that team). When it's used up, AI stops until the next month.
- **Estimates:** costs are estimated from the token counts the API reports and the prices on the AI page (US$ per million tokens). Check current prices in Anthropic's docs. Your Anthropic invoice is the real figure.
- **Team opt-out:** a team owner can turn AI off for their team on the Team page.
- **Usage log:** **Platform admin → AI assistant** shows spend per team and recent requests.
- **What's sent:** only the photos, debrief or question being worked on, plus, for Ask, the records it looks up. Text inside records is treated as data, never as instructions.
- **Rate limit:** each person is limited to 40 AI requests per 10 minutes.
- **Offline:** AI needs a connection. Everything else keeps working offline as before.

| Setting | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key. Leave empty to keep AI unavailable. |
| `ANTHROPIC_WORKSPACE_ID` | Only needed if your key isn't limited to one workspace: that workspace's ID (`wrkspc_…`, from Settings → Workspaces in the Claude Console). |
| `AI_PROVIDER` | Leave unset. `mock` is a built-in stand-in used only by automated tests. |

### Setup advisor

**At the Track → Setup advisor**, or the **Setup advisor** button on any saved setup sheet. Pick what the car is doing (loose/tight on entry, centre or exit, or no rear bite). From a sheet, this is pre-filled from the driver and crew feedback. Then choose track conditions, car and track. The advisor shows two things:

- **What's worked for you.** It finds every sheet where the driver or crew reported that problem, compares it with the next session's sheet to see what was changed, and checks that session's feedback to see whether the complaint was gone. Changes are grouped, for example "Stagger ↓ tried 4×, gone next session 3×, still there 1×", with links to the sheets. Sessions at the same track, with the same car or in the same conditions count for more. This builds up as the team records feedback and changes. It runs on the device, so it works offline.
- **Guide recommendations.** Remedies from the tuning guides for that problem. Each shows its effectiveness rating (where the guide gives one), your team's results when you've made that change, the sheet's current value, and a **guides disagree** flag where two guides point opposite ways.

**+ Add to changes** appends a remedy to the sheet's *Changes for next session*. With the AI add-on, **Talk it through** weighs the history against the guides and suggests one to four changes in order, linked to the sessions and guide rules they're based on.

**Tuning guides** (from the advisor page) lists the guides. Two shared guides are seeded for every team: *XXX Tech Department — Recommended Chassis Adjustments* and *J & J Auto Racing — Chassis Adjustment Guide*. Only the platform admin can edit shared guides. Teams can add their own, type rules in, or **Import a guide from PDF, photo or Excel** (AI) and check the rules before saving. A rule linked to a setup setting and direction (e.g. *Stagger ↓*) can be matched against the team's history. Rules without one are still listed.

Setup sheets also gained a **Weights & chassis** section with total weight, left/rear/cross %, wing position, nose wing, LR radius rod and rear steer, so more guide remedies can be tracked.

### Track weather

Each setup sheet's **Weather** section has three tools:

- **Get track weather** pulls readings for the event's track (it needs the track's latitude and longitude in the directory) at the time you choose. That's the session time by default, and it can look back up to 92 days to fill in old sheets. Temperature, station and corrected barometer, humidity, dew point and wind come from Open-Meteo. Density altitude (ALT), ADR, wet bulb and water grains are calculated from them.
- **Calculate from readings** works out ALT, ADR, grains and dew point from readings typed in by hand: temp, baro, and humidity or wet bulb. It works offline.
- **Air Density Online ↗** opens that site. It has no API and requires a personal account, so RaceOps links to it rather than pulling from it.

Values are always shown for review first. Readings typed in by hand start unticked, so they are never replaced without a tick. Units are a team setting: US (°F, inHg, ft) by default, or metric. A team owner or manager changes them in the weather panel.

| Variable | Default | What it does |
|---|---|---|
| `WEATHER_PROVIDER` | `open-meteo` | `open-meteo`, or `off` to hide the weather pull |
| `OPEN_METEO_API_KEY` | *(empty)* | Open-Meteo's free API is for non-commercial use (under 10,000 calls a day). If you charge teams for RaceOps, buy a plan at open-meteo.com and put the key here. |

Responses are cached for 10 minutes per track, so a whole pit area pulling at once makes one call.

### Calculators

**Calculators** is in the sidebar under At the Track, In the Workshop and Engine Builds. Each opens the same page filtered for that area. There are 47 calculators, all working offline, and each shows how its answer is worked out. The last inputs are remembered on the device.

- **Air & weather:** air correction (ADR, density altitude, STD and SAE correction factors, dew point, wet bulb, grains, pressure altitude), density altitude ↔ ADR, altimeter ↔ station pressure, standard-day lap time.
- **Fuel injection & tuning:** main pill for new air (mechanical injection, using the share of pump flow between nozzles and bypass), high-speed bypass, orifice area, change, flow and parallel orifices, fuel flow and pump size, EFI injector size, engine airflow, methanol hydrometer check.
- **Chassis, tyres & weights:** corner weights ↔ percentages, ballast for a target %, stagger for a turn, hot vs cold tyres, tyre size, wheel offset ↔ backspacing.
- **Gearing, speed & laps:** quick-change final drive (with the closest sets on your gear chart), new rpm after a change, speed ↔ rpm, ratio for a target rpm, lap time ↔ speed, lap analysis, fuel for a race.
- **Engine builder:** displacement, bore and stroke, compression ratio, dynamic compression, cam specs from events, valve events from the cam card, valve lift, piston speed and rod ratio, compression height, chamber and dish/dome by burette, gasket volume, dyno correction, HP estimate, flow at another test pressure, bobweight, ring gap.
- **Workshop:** torsion bar rate, wheel rate (motion ratio), torque wrench with an extension, unit converter.

**On the sheets:**
- A small calculator button beside a field (main jet, high-speed bypass, stagger, ADR, ALT, dyno HP, cam centreline and others) opens the matching calculator, filled in from the sheet. The main jet calculator also uses the previous session's ADR and pill. **Use** puts the answer in the field.
- On setup sheets, entering the four **corner weights** fills in total, left %, rear % and cross %.
- Engine build sheets get a **Clearances & checks** card: main, rod and cam bearing oil clearances, piston-to-wall, ring gap per inch of bore, rod ratio, piston speed and bobweight. It is worked out from the measurements already entered.

### Field descriptions

Every standard field has an **ⓘ** beside its label: hover, focus or tap it to see what the field is for, what to enter and where to get the number. In **Forms**, a field's settings let a team write its own description and "where to find it" for any field, including custom ones. Left blank, the standard text is used.

### Themes and sidebar

Each person picks their own look under **Profile & device → Appearance**. It is saved to their account, so it follows them to every device. Changes made offline are kept and sent when the device is back online.

- **Standard themes:** Match this device (light or dark from the phone or computer setting), Paddock (light), Night race (dark), Sunlight (high contrast for bright sun), Racing green, Pit wall blue, Chequered flag, Midnight and Carbon & amber.
- **Custom themes:** pick a light or dark base and five colours: page background, cards, text, accent and sidebar. Borders, faint text and soft highlights are derived from those. The whole app previews changes live and warns when text would be hard to read. Each person can keep up to 12.
- **Sidebar sections:** the arrow beside each section heading (At the Track, In the Workshop, …) collapses it to just the heading. A dot on a collapsed heading shows that the current page is inside it. Sections can also be shown or hidden, or collapsed and expanded all at once, from Appearance.

### Engine shops (building for customers)

A team can be a **race team**, an **engine shop**, or **both**. The platform admin sets this when creating the team (the "Engine shop" plan suits shops), and a team owner can change it under **Team → Team type & engine shop**. Engine shops get:

- **Engine Shop** in the sidebar, with Jobs, Customers, Customer engines, Build sheets and Calculators. Shops that don't race don't see At the Track, Cars or Car maintenance. The home screen shows **In the shop**: jobs by status, jobs due in the next 7 days or overdue, and jobs ready for pickup.
- **Customers**, each with their engines (engine assets with a *Customer (owner)*) and their job history.
- **Jobs (work orders)**, which record:
  - customer, engine, job type and status (Quote → Booked in → In progress → Waiting on parts → Ready for pickup → Collected);
  - dates and who the job is assigned to;
  - what was asked for, findings, work done and recommendations;
  - **parts** (cost and price) and **labour** (hours × rate, using the shop rate when blank);
  - discount, tax, invoice number and paid.

  Totals show parts, labour, tax, total and parts margin. Job numbers count up automatically, with the shop's prefix.
- **Build sheets linked to the job.** "New build sheet" on a job fills in the engine, customer and work order.
- **Job sheet / handover pack.** This is a printable page (print or save as PDF) with the work done, parts and labour, with prices optional. It also includes the build specifications, clearances and torque figures, the next service, and the shop's terms.

The shop sets its labour rate, tax rate and name (e.g. GST), whether prices include tax, the job number prefix and the printed terms under **Team → Team type & engine shop**. RaceOps records invoice numbers but doesn't produce invoices, so they still come from the shop's accounting software.

#### Sharing an engine with its owner

On a customer engine's page, **Customer access** offers two kinds of sharing. Both are free.

- **Engine page link (no login).** This is a private link to send the owner. It shows:
  - the engine, owner and service interval with the last service date;
  - every build with its specs, clearances and torque figures;
  - the work history: what was asked for, findings, work done, recommendations, and parts and labour.

  It never shows internal notes, parts costs or margins. **Prices show only on jobs where "Show prices to the customer" is ticked.** You can replace the link (the old one stops working) or turn it off at any time. The panel shows how many times it has been viewed.
- **Link to the owner's RaceOps team.** "Invite the owner's team" makes an invite link and code. Someone on the owner's team opens it, signs in and picks which of their engines it is (or adds it). Then:
  - the team sees the shop's build and job history read-only under **Engine Builds → Engines from your engine builder**;
  - the shop sees **only the laps and sessions run on that engine since its last service** (and when), never the team's setups, tracks or results;
  - either side can end the link. Each keeps its own records, and the team keeps a copy of the build history as it was that day.
  - **the team decides, per engine, whether its laps count on the shop's service tracker.** The switch is "Count our laps on …'s service tracker", when accepting the link or later on the linked engine's page, and it's off by default. When it's on, the shop's lifecycle bars for that engine (engine page, customer page, asset list, home screen alerts) include the team's laps since the last service. When it's off, the shop still sees the lap count in Customer access, but its service tracker uses only the laps it records itself.

**Changing the engine's owner** (or deleting the engine) turns off its engine page link and ends any team link automatically, and the team keeps its copy. Nothing is emailed: the shop sends the link or invite itself.

Each plan has an optional **Shared engines** limit (Platform admin → Plans): how many engines a shop can share at once. It's blank (unlimited) by default.

### Analytics

**Analytics** (sidebar) builds charts from the team's own records. It's worked out on the device, so it works offline and adds no server load.

- **Performance:** results over time, by track, by track condition, by ADR and temperature, and handling-comment patterns ("went away after").
- **Setups:** "What worked" (any setting against places gained or finish, with a trend line, link strength and banded averages), setup drift, and jetting vs air (the team's own jet chart).
- **Engines & parts:** a service forecast for parts and lap/race schedules (meetings left and an approximate date), engine health (fuel per lap, rpm, dyno HP), and shock fade from dyno runs.
- **Filters:** car, season, track, session type and track conditions. Every chart shows its data coverage, has a table view, and opens the records behind it.
- **On Home:** a **Form & what's due** card.
- **Access:** a licence feature (`analytics`) and a role right (`analytics.view`). Migration 010 gives it to existing roles that can view setups or assets.
- **Code:** calculations are in `shared/analytics.js`, and charts in `web/src/components/Charts.jsx`.

### Calendars

**Team Management → Calendar** plans each racing year. The month the year starts is a team setting, so a season can run 2026-27.

- **Shared series and track calendars:** dates (`fixture` records) that every team can read. Series can now be shared too. Platform admins publish dates directly. Teams send requests (below). **Platform admin → Shared calendars** has views for series, tracks and major events (fixtures with **Major event** ticked, such as the Australian Sprintcar Title). Admins add, edit and delete dates and shared series there (`/api/admin/calendar/*`), and moderate teams' requests on its **Requests** tab.
- **Requests (team → shared):** teams send their own series, track, dates and major events, or a change to a shared series, track or date, as a `calendar_requests` row (migration 012; `server/src/calendarRequests.js`).
  - **Checks:** each request is checked against the shared calendars for duplicates and clashes (name likeness, same date and track, same series round on another date).
  - **Decisions:** the platform admin decides per series, track and date: add, link to an existing one, or refuse with a reason.
  - **Approval:** this creates or links the shared records, points the team's events, series entries, track links, contacts and notes at them, and retires the team's own copies. Their private notes become `local_note` records.
  - **Changes:** a changed shared date (by request or admin edit) updates every team's events from it.
  - **Badges:** admins see the waiting count (`/api/me` `notices`) and teams see unseen decisions (`calendar_notices` on the membership) in the sidebar and on Home.
  - **Old suggestions:** suggestions made before requests existed are turned into requests at start-up.
- **Extras (migration 013, `server/src/calendarPlus.js`):**
  - **Questions:** admins can ask the team about a request (`question` status). The team answers from **Calendar → Requests**. The thread is in `calendar_request_messages`.
  - **Officials** (`calendar_officials`): teams that look after a shared series or track. With auto-approve, their requests go live straight away unless they hit a duplicate or clash (`source = 'official'`).
  - **Follow and updates:** `follow` records. Changes to a followed series or track (dates added, moved, cancelled, results) become `team_notices`, shown under **Calendar → Updates**.
  - **Results:** shared dates carry `entries`, `results` and `results_note`. Teams send them as change requests.
  - **Official feeds** (`calendar_feeds`): an iCal link per shared series or track, checked every `CALENDAR_FEED_HOURS`. New and changed dates arrive as requests with `source = 'feed'` and no team.
  - **Merge and history:** `/api/admin/calendar/duplicates`, `/merge` (repoints every team's records, then retires the old one) and `/history/:id` with restore.
  - **Public pages:** `/cal/series/<id>` and `/cal/track/<id>` in the app, backed by `/api/public/shared/<type>/<id>` and `.ics`. No login. These paths must reach the app through your reverse proxy.
  - **Clashes:** a view in the app only, worked out from the shared dates.
- **Email** (`server/src/mail.js`, `nodemailer`): platform admins get new requests and answers. Team owners and people with `calendar.edit` get decisions, questions, official appointments and followed changes. Each person can turn emails off in **Profile & device**. Nothing is sent unless `SMTP_HOST` is set. **Platform admin → Settings** shows the status and sends a test.
- **Team calendar:** each entry is an `event` with the shared date it came from, **Going?** (Planned / Tentative / Not going) and **What happened** (raced the feature, missed the feature, withdrew with a reason, didn't attend, cancelled). Adding a date picks the car whose class is running, and asks when more than one fits.
- **Series entries** (`season_plan`): series, racing year, car, class, full or partial. A full series adds every round.
- **Import:** a web page, an iCal/webcal link, a PDF, photo or screenshot, or pasted text. iCal is read directly. Everything else goes to the AI assistant, so it needs the AI add-on. Dates are always shown for review first. Facebook and Instagram links are refused with a request for a screenshot, because they need a login. The server fetches links itself and won't open private network addresses.
- **Print and publish:** `/print/calendar` prints the year. **Publish** gives a no-login page at `/c/<token>` and an iCal feed at `/api/public/calendar/<token>.ics`. These show only events the team is going to, with optional tentative events, car and results, and never notes or withdraw reasons. If you publish through a reverse proxy, these paths must reach the app like any other.
- **Access:** the **Calendars** module (`calendar.view/edit/delete`). It needs no area, so any role with `calendar.view` sees it under Team Management, including drivers. Migration 011 gives it to roles with the same rights on Events.
- **Code:** `shared/calendar.js` (racing years, car matching, iCal in and out), `server/src/calendar.js` (import, publish, admin review), `web/src/pages/Calendar.jsx`.

| Variable | Default | What it does |
|---|---|---|
| `SMTP_HOST` | unset | Mail server. Unset means no emails are sent. |
| `SMTP_PORT` | `587` | `465` uses TLS from the start. |
| `SMTP_SECURE` | by port | `true` or `false` to override. |
| `SMTP_USER` / `SMTP_PASS` | unset | Mail login. Keep the password in the Portainer stack. |
| `SMTP_FROM` | `SMTP_USER` | The sender, e.g. `RaceOps <raceops@example.com>`. |
| `APP_URL` | unset | The app's public address, e.g. `https://raceops.example.com`, so emails link back to it. |
| `CALENDAR_FEED_HOURS` | `12` | How often official iCal feeds are checked. `0` turns the checks off. |
| `MAIL_TRANSPORT` | unset | `file` writes emails as JSON to `MAIL_OUTBOX` instead of sending them. For automated tests only. |
| `CALENDAR_FETCH_PRIVATE` | unset | Set to `1` only on a test server to let calendar import open links on private addresses (tests import the server's own iCal feed). |

### Help & guide

**Help & guide** (sidebar, under Profile & device) is the user guide, built into the app and available offline. It covers:

- **Getting started:** setting up a new team, in order.
- **Guides by role:** owner, crew chief, mechanic, driver, engine builder, customer and platform admin.
- **Settings & options:** every switch, where it is and who can change it.
- **Area guides** and **reference tables.**

Each person sees the articles that fit their role and team type; **Show everything** lists the rest. A **?** beside page titles opens the article for that page. **Print / PDF** prints the whole guide with a contents page. Owners and team admins see a **Set up your team** checklist on Home that ticks itself off from the team's data.

Articles are Markdown files in `docs/guide/`. `tools/check-guide.mjs` runs before every web build and fails it when a page, setting, record type, module, role or form field isn't documented. `tools/guide_shots.py` retakes the guide's screenshots from a test server. See `CLAUDE.md` for the checklist every change follows.

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

### End-to-end tests

The Playwright suites are in `tests/e2e/`. With Postgres running and the web app built (`cd web && npm run build`):

```bash
pip install -r tests/e2e/requirements.txt && python3 -m playwright install chromium
tests/e2e/run.sh          # fresh test database and server, then every suite in order
```

See `tests/e2e/README.md` for settings and what each suite covers.

### Layout

```
shared/       catalog.js (modules, permissions, default roles) · baseForms.js (seed forms from your sheets)
server/       Express API · migrations/*.sql (auto-applied) · src/index.js (auth, teams, roles, invites, sync, attachments)
web/          React PWA · lib/store.js (IndexedDB) · lib/sync.js (push/pull) · components/FormRenderer.jsx · pages/*
docs/guide/   User guide articles (Markdown) and img/ screenshots, bundled into the app
tools/        check-guide.mjs (build-time guide check) · guide_shots.py (retake guide screenshots)
CLAUDE.md     What every change must update, including the user guide
```

### Data model and sync

- `records(id, tenant_id, type, data jsonb, deleted, client_updated_at, seq)` holds every business object: car, event, setup, maintenance, schedule, asset, measurement and form. Phase 2 types (`dyno_run`, `gear`, `tire`, `engine_build`) are already reserved in `shared/catalog.js`, so adding them needs no schema change.
- **Pull:** `GET /api/t/:team/sync?since=<seq>` returns only the types the user's role can view.
- **Push:** `POST /api/t/:team/sync` checks edit or delete permission for each change, applies last-write-wins on `client_updated_at`, and writes every attempt to `record_history`.
- Each team is isolated by `tenant_id` on every query, and membership plus role is checked on every request.

### Path to native store apps

The installable web app already covers offline use on iOS and Android. For App Store or Play Store listings, the plan is to wrap this same web build with Capacitor, which adds native camera and file access and push notifications without a second codebase.
