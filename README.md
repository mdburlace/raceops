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
| **Fill from photo** | The **AI** bar on any form you can edit: setup sheets, dyno runs, engine builds, maintenance… | Take or pick up to 6 photos, or a PDF: a paper setup sheet, a tire-temperature card, a dyno printout. The AI reads them and lists the values it found next to what's already there. Untick anything wrong, then **Apply**. Dyno printout tables go through the same importer as *Paste whole printout*, so each setting becomes its own curve. Only clearly readable values are filled; nothing is guessed. |
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

**Tuning guides** (from the advisor page) lists the guides. Two shared guides are seeded for every team: *XXX Tech Department — Recommended Chassis Adjustments* and *J & J Auto Racing — Chassis Adjustment Guide*. Only the platform admin can edit shared guides. Teams can add their own, type rules in, or **Import a guide from PDF or photo** (AI) and check the rules before saving. A rule linked to a setup setting and direction (e.g. *Stagger ↓*) can be matched against the team's history. Rules without one are still listed.

Setup sheets also gained a **Weights & chassis** section with total weight, left/rear/cross %, wing position, nose wing, LR radius rod and rear steer, so more guide remedies can be tracked.

### Themes and sidebar

Each person picks their own look under **Profile & device → Appearance**. It is saved to their account, so it follows them to every device. Changes made offline are kept and sent when the device is back online.

- **Standard themes:** Match this device (light or dark from the phone or computer setting), Paddock (light), Night race (dark), Sunlight (high contrast for bright sun), Racing green, Pit wall blue, Chequered flag, Midnight and Carbon & amber.
- **Custom themes:** pick a light or dark base and five colours: page background, cards, text, accent and sidebar. Borders, faint text and soft highlights are derived from those. The whole app previews changes live and warns when text would be hard to read. Each person can keep up to 12.
- **Sidebar sections:** the arrow beside each section heading (At the Track, In the Workshop, …) collapses it to just the heading. A dot on a collapsed heading shows that the current page is inside it. Sections can also be shown or hidden, or collapsed and expanded all at once, from Appearance.

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
