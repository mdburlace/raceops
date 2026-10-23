# RaceOps — System Design

> **Purpose.** This document describes RaceOps in enough detail to rebuild it from scratch if the
> repository, the server or both are lost. It is also the starting point for anyone changing the code.
>
> **Keep it current.** It is part of every release (see [§20 Maintaining this document](#20-maintaining-this-document)).
> `node tools/check-design.mjs` runs in every build and fails if a migration, environment variable,
> server module or record type is missing from it.

| | |
|---|---|
| Product | RaceOps — race team and engine shop manager (self-hosted, multi-tenant PWA) |
| Repository | `github.com/mdburlace/raceops`, branch `main` |
| Owner | Mark Burlace |
| Last schema migration | `014_feedback.sql` |
| Last updated | October 2026 (training pack: practice teams, exercises, cards, videos; Repair this device) |

---

## Contents

1. [What RaceOps is](#1-what-raceops-is)
2. [Architecture overview](#2-architecture-overview)
3. [Technology stack](#3-technology-stack)
4. [Repository layout](#4-repository-layout)
5. [Runtime and deployment](#5-runtime-and-deployment)
6. [Data model](#6-data-model)
7. [Identity, tenancy, licensing and access control](#7-identity-tenancy-licensing-and-access-control)
8. [Offline-first sync](#8-offline-first-sync)
9. [Forms engine](#9-forms-engine)
10. [Server modules and API](#10-server-modules-and-api)
11. [Functional modules](#11-functional-modules)
12. [Shared calendars subsystem](#12-shared-calendars-subsystem)
13. [Web client](#13-web-client)
14. [Background work and in-memory state](#14-background-work-and-in-memory-state)
15. [External integrations](#15-external-integrations)
16. [Security](#16-security)
17. [User guide system](#17-user-guide-system)
18. [Build, test and quality gates](#18-build-test-and-quality-gates)
19. [Operations, backup and disaster recovery](#19-operations-backup-and-disaster-recovery)
20. [Maintaining this document](#20-maintaining-this-document)
21. [Known constraints and technical debt](#21-known-constraints-and-technical-debt)
- [Appendix A — Environment variables](#appendix-a--environment-variables)
- [Appendix B — Migrations](#appendix-b--migrations)
- [Appendix C — Record types](#appendix-c--record-types)
- [Appendix D — API routes](#appendix-d--api-routes)
- [Appendix E — Web routes](#appendix-e--web-routes)

---

## 1. What RaceOps is

RaceOps is a team management app for dirt-track sprintcar racing teams and the engine shops that build their engines. One server hosts many teams (tenants). People use it in a browser or install it as an app on phones, tablets and desktops. It **works with no signal at the track**: every screen reads from a local database on the device, and changes sync when the device is back online.

The app is split into four **areas**, each with its own access control and licensing:

| Area | Contents |
|---|---|
| **At the Track** (`track`) | Events and sessions, setup sheets, the setup advisor, between-round checks, gears and tyres, tracks |
| **In the Workshop** (`workshop`) | Car maintenance checklists and service schedules, asset lifecycle and measurements, shock and torsion-bar dyno |
| **Engine Builds** (`engines`) | Engine build sheets, and for engine shops: customers, jobs (parts and labour), sharing engines with owners |
| **Team Management** (`team`) | Members, roles, forms, reports, Crew Chief stats, reviews, the calendar |

Cross-cutting features: cars, contacts and suppliers, analytics, 47 calculators, a fuel planner, track weather, an optional AI assistant (paid add-on), the shared calendars, and an in-app user guide.

A **team type** (`race`, `shop` or both) decides which areas and screens a team sees. A **platform admin** runs the server: creates teams, sets licences and plans, keeps the shared directories (tracks, contacts, tuning guides, series and calendar dates) and moderates requests from teams.

---

## 2. Architecture overview

```
                       ┌──────────────────────────── Device (browser / installed PWA) ──────────────────────────┐
                       │  React SPA  ──reads/writes──►  IndexedDB (Dexie: records, meta)                        │
                       │      │                              ▲                                                  │
                       │      └── sync loop (push dirty → pull since seq) ─────────────┐                        │
                       │  Service worker (Workbox): caches app shell, guide images      │                        │
                       └────────────────────────────────────────────────────────────────┼────────────────────────┘
                                                                                        │ HTTPS (JSON, Bearer JWT)
   Internet / LAN ──► Reverse proxy (pfSense HAProxy, TLS, Let's Encrypt) ──────────────┘
                                         │ HTTP :8080
                       ┌─────────────────▼───────────────────────── Docker host (Portainer stack) ─────────────┐
                       │  app container: Node 22 + Express 5                                                   │
                       │    /api/*  REST API (auth, sync, admin, AI, calendars, sharing, weather, jobs)       │
                       │    /*      static SPA from web/dist (index.html fallback)                            │
                       │    in-memory: settings cache, sign-in limiter, background jobs, feed timer           │
                       │    volume raceops_uploads → /data/uploads (attachments)                              │
                       │  db container: Postgres 16  (volume raceops_db)                                       │
                       └───────────────┬───────────────────────────────────────────────────────────────────────┘
                                       │ outbound HTTPS
               Anthropic Messages API · Open-Meteo · SMTP server · public iCal / web pages (calendar import & feeds)
```

Key design choices:

- **One generic document table (`records`)** holds almost all business data as JSON, keyed by `type`. New features mostly add record types and form definitions, not tables. Relational tables are used only for identity, tenancy, auditing and server-side workflows.
- **Local-first client.** The UI never waits on the network. Every write goes to IndexedDB with `dirty=1`, and a sync loop pushes and pulls. Conflicts resolve by **last write wins on the client timestamp**, and every attempt is kept in `record_history`.
- **Shared code** in `shared/` runs on both server and client: the catalogue of modules, permissions and plans, base form definitions, calculators, calendar logic and the guide parser. This is what keeps permission checks identical on both sides.
- **Single process, single container** for the app (see [§14](#14-background-work-and-in-memory-state)). Postgres is the only stateful dependency besides the uploads volume.
- **Server-side secrets only.** API keys (Anthropic, Open-Meteo, SMTP) live in environment variables and are never sent to devices.

---

## 3. Technology stack

| Layer | Technology | Version (pinned by lockfiles) |
|---|---|---|
| Runtime | Node.js | 22 (Docker `node:22-alpine`) |
| HTTP | Express | 5.x |
| Database | PostgreSQL | 16 (Docker `postgres:16-alpine`), extension `pgcrypto` |
| DB driver | `pg` | 8.x |
| Auth | `jsonwebtoken` 9.x, `bcryptjs` 3.x (cost 10) | |
| Uploads | `multer` 2.x | |
| Email | `nodemailer` | 10.0.15 (exact pin) |
| Compression | `compression` | 1.8 |
| Web UI | React 18, React Router 6 | |
| Local DB | Dexie 4 (+ `dexie-react-hooks`) on IndexedDB | |
| Build | Vite 5, `@vitejs/plugin-react`, `vite-plugin-pwa` 0.21 (Workbox) | |
| Markdown | `marked` 14 (user guide) | |
| Spreadsheets | `read-excel-file` 5 (import from Excel/CSV on device) | |
| Tests | Python 3 + Playwright (Chromium), in `tests/e2e/` | |
| Hosting | Docker + Portainer stack, pfSense HAProxy + ACME | |

Both packages are ES modules (`"type": "module"`). There is no TypeScript and no CSS framework; styles are one hand-written `web/src/styles.css` with CSS custom properties for theming.

---

## 4. Repository layout

```
CLAUDE.md                 rules for changing the code (guide, design doc, tests)
README.md                 deployment and admin documentation
Dockerfile                two-stage build: web (Vite) → runtime (Node, server + web/dist)
docker-compose.yml        Portainer stack: db (postgres) + app
docs/
  design/DESIGN.md        this document
  design/ROLLOUT.md       environments, release and deployment approach
  guide/*.md              user guide articles (bundled into the app)
  guide/img/*.webp        guide screenshots (made by tools/guide_shots.py)
server/
  package.json            server dependencies
  migrations/NNN_*.sql    forward-only SQL migrations, applied in name order at start-up
  src/index.js            app bootstrap, auth routes, tenancy, sync, members, roles, invites, attachments, start-up tasks
  src/db.js               pg pool, tx() helper, migration runner
  src/auth.js             JWT, bcrypt, requireAuth, requireMember, HttpError
  src/settings.js         platform settings cache, audit log, seat limits
  src/ratelimit.js        sign-in lockouts (in memory)
  src/admin.js            /api/admin: teams, plans, users, directory, lists, settings, system, audit
  src/ai.js               AI assistant (Anthropic), usage and cost logging, allowances
  src/jobs.js             background job wrapper for long requests
  src/weather.js          Open-Meteo forecast proxy
  src/sharing.js          engine shop ↔ owner sharing (public links, team links)
  src/calendar.js         calendar import (link/iCal/AI), publish, admin shared-calendar edits
  src/calendarRequests.js team → shared calendar requests and moderation
  src/calendarPlus.js     follows, notices, officials, feeds, merge, history, public shared pages, mail status
  src/mail.js             SMTP email (nodemailer), admin, team and single-user recipients
  src/feedback.js         feedback & ideas: bug reports, requests, roadmap and votes, admin pipeline, GitHub issues for Claude
  src/practice.js         practice teams for training: seed demo data, reset
shared/                   code used by server AND web
  catalog.js              areas, modules, record types, permissions, plans, default roles
  platform.js             default platform settings, plans merge, licence state, AI models and prices, pick-lists
  baseForms.js … baseForms4.js   base form definitions and upgrade rules
  fieldInfo.js            ⓘ descriptions for every form field
  calcs.js, gearLists.js, fuel.js, dyno.js, bars.js, sessions.js, analytics.js, advisor.js, weather.js, tracks.js,
  engineChecks.js, enginePack.js, shop.js, setupLayout.js, themes.js, calendar.js
  practiceData.js         demo data for practice teams (training)
  guide.js, guideData.js, guideChecklist.js   user guide parser, generated tables, first-run checklist
  seed/tracks.json, track_updates.json, guides.json   seed data for the shared directory
tests/
  e2e/                    Playwright suites e2e.py … e2eNN.py, fixtures/, server.sh (fresh test server), run.sh, README
tools/
  check-guide.mjs         guide coverage check (runs in the build)
  check-design.mjs        design document coverage check (runs in the build)
  guide-baseline.json     baseline for the guide check
  guide_shots.py          retakes guide screenshots against a test server
  training_videos.py      records the training videos (docs/guide/video/*.webm) against a test server
web/
  index.html, vite.config.js, public/ (icons)
  src/main.jsx, App.jsx   entry and routes
  src/lib/                api, session, store (Dexie), sync, data hooks, theme, guide, parsing, computations
  src/components/         FormRenderer, TableFields, Layout, charts, Ai, Weather, SharedRequests, etc.
  src/pages/              one file per area/page group
```

---

## 5. Runtime and deployment

### 5.1 Container image

`Dockerfile` has two stages:

1. **web** (`node:22-alpine`): copies `shared/`, installs `web/` dependencies with `npm ci`, copies `web/`, `docs/`, `tools/` and `server/src` (the guide check reads server code to find settings and pages), then `npm run build` — which runs `tools/check-guide.mjs` and `tools/check-design.mjs` **before** `vite build`. A guide or design document that is behind the code fails the image build.
2. **runtime** (`node:22-alpine`): `NODE_ENV=production PORT=8080 UPLOAD_DIR=/data/uploads`; installs server production dependencies; copies `shared/`, `server/` and the built `web/dist`; runs as user `node`; `HEALTHCHECK` calls `GET /api/health`; `CMD node server/src/index.js`.

The runtime image contains the full **server** source and the **built** web app, not the web source.

### 5.2 Stack

`docker-compose.yml` (deployed as a Portainer stack):

| Service | Image | Volumes | Notes |
|---|---|---|---|
| `db` | `postgres:16-alpine` | `raceops_db:/var/lib/postgresql/data` | DB `raceops`, user `raceops`, password `POSTGRES_PASSWORD`; healthcheck `pg_isready` |
| `app` | built from `Dockerfile`, tagged `raceops:latest` | `raceops_uploads:/data/uploads` | waits for db healthy; port `${APP_PORT:-8080}:8080`; all settings from environment (Appendix A) |

### 5.3 Start-up sequence (`server/src/index.js`)

1. Load modules, create the uploads folder, configure Express (`trust proxy`, compression, JSON limit 10 MB).
2. Mount routes (public → `requireAuth` → admin → tenant router `/api/t/:tid` with `requireMember`).
3. Serve `web/dist` with `index.html` fallback for non-`/api` paths; `sw.js` and `index.html` are `no-cache`.
4. `migrate()` — waits up to ~60 s for Postgres, then applies each `server/migrations/*.sql` not yet in `schema_migrations`, one transaction per file.
5. `convertLegacySuggestions()` — one-off move of old calendar suggestions into requests.
6. `startFeedChecks()` — timer for official iCal feeds (first run after 2 minutes).
7. `loadSettings()` — platform settings into memory.
8. `ensureBaseForms()` — for every team: add missing base forms, apply form upgrades, add standard gear lists.
9. `ensureGlobalTracks()` — seed/refresh the shared track directory from `shared/seed/tracks.json` (keyed by a hash of the file in `schema_migrations`) and apply `track_updates.json` corrections.
10. `ensureGlobalGuides()` — add shared tuning guides from `shared/seed/guides.json`.
11. Listen on `PORT`.

All start-up tasks are idempotent, so a restart is always safe.

### 5.4 Network and HTTPS

Browsers only allow the service worker and "Add to Home Screen" over HTTPS, so production sits behind a TLS-terminating reverse proxy (pfSense HAProxy with an ACME/Let's Encrypt certificate via DNS validation). One hostname is used both inside and outside the network (DNS host override on pfSense for the LAN). The proxy must forward `X-Forwarded-For`; `TRUST_PROXY` controls which proxies are trusted. Long requests run as background jobs, so default proxy timeouts (HAProxy 30 s, Cloudflare 100 s) are fine. Full steps are in `README.md`.

### 5.5 Persistent state

| State | Where | Backed up by |
|---|---|---|
| All business data, users, settings, audit, AI usage, requests | Postgres volume `raceops_db` | `pg_dump` (see §19) |
| Attachments (photos, PDFs) and feedback pictures | volume `raceops_uploads` (`/data/uploads/<uuid>`, `/data/uploads/feedback/<uuid>`) | file copy of the volume |
| Secrets and settings | Portainer stack environment | password manager / secure export |
| Sign-in lockouts, background jobs, settings cache | process memory | not persisted (by design) |

---

## 6. Data model

### 6.1 Relational tables

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts | `id uuid`, `email unique`, `name`, `password_hash` (bcrypt), `is_platform_admin`, `disabled`, `last_login_at`, `prefs jsonb` (theme, sidebar, units, `email_notices`) |
| `tenants` | Teams | `id`, `name`, `racing_type`, `settings jsonb` (team type, season start, units, shop settings, calendar publish, AI opt-out…), `plan`, `features jsonb` (per-team overrides), `status` (`active`/`suspended`), `seats`, `licence_expires date`, `admin_notes`, `ai_budget_usd` |
| `roles` | Per-team roles | `tenant_id`, `name` (unique per team), `permissions jsonb` (array of permission keys), `is_owner` |
| `memberships` | User ↔ team | PK `(user_id, tenant_id)`, `role_id` |
| `invites` | Invite links | `tenant_id`, `email`, `role_id`, `token unique`, `expires_at`, `accepted_at` |
| `records` | **All syncable business data** | `id uuid` (client-generated), `tenant_id` (NULL = shared/global), `type`, `data jsonb`, `deleted`, `created_by`, `updated_by`, `created_at`, `updated_at`, `client_updated_at`, `seq bigint` from sequence `record_seq` |
| `record_history` | Every write attempt | `record_id`, `tenant_id`, `type`, `op` (create/update/delete), `outcome` (applied/superseded), `data`, `user_id`, `client_updated_at` |
| `attachments` | Files on records | `tenant_id`, `record_id`, `filename`, `mime`, `size`, `storage_path` (relative to `UPLOAD_DIR`), `caption`, `uploaded_by` |
| `schema_migrations` | Applied migrations and seed markers | `name` PK |
| `platform_settings` | Server-wide settings (key → jsonb) | keys `general`, `plans`, `lists`, `ai` |
| `admin_audit` | Platform admin and security log | `user_id`, `action`, `target`, `detail`, `at` |
| `ai_usage` | Every AI call | tenant, user, feature, model, token counts, `cost_usd`, `ok`, `error` |
| `engine_shares` | No-login engine pages | shop `tenant_id`, `engine_id`, `token`, revoke info, view counts |
| `engine_links` | Shop engine ↔ owner team | `shop_tenant_id`, `engine_id`, `code`, `status` (pending/active/ended), `team_tenant_id`, `team_asset_id`, `feed_lifecycle`, `snapshot` |
| `calendar_requests` | Team/feed requests to the shared calendars | `tenant_id` (NULL for feed), `kind` (share/change), `subject_type`, `subject_id`, `title`, `payload`, `note`, `status`, `decision`, `source` (team/feed/official), `seen` |
| `calendar_request_messages` | Question/answer thread on a request | `request_id`, `from_admin`, `body` |
| `calendar_officials` | Teams that look after a shared series/track | `tenant_id`, `entity_type`, `entity_id`, `auto_approve`; unique (tenant, entity) |
| `team_notices` | Updates for a team (followed changes, official appointments) | `tenant_id`, `kind`, `title`, `link`, `seen` |
| `calendar_feeds` | Official iCal feed per shared series/track | `entity_id` PK, `entity_type`, `url`, `last_checked`, `last_status` |
| `feedback_items` | Bug reports and requests from users, ideas from platform admins — one pipeline | `ref` (serial, shown as #n), `source` (user/admin), `kind` (bug/enhancement/feature/change), `title`, `description`, `steps`, `expected`, `acceptance`, `areas jsonb` (functionality area keys), `page`, `context jsonb` (device, browser, sync), `priority`, `status` (draft/new/approved/in_progress/done/declined/duplicate/withdrawn), `lane` (now/next/later), `public`, `public_summary`, `duplicate_of`, `decision_note`, `release`, `tenant_id`, `user_id`, `decided_by/at`, `sent_at/by`, `github_issue`, `github_url`, `github_state`, `seen` |
| `feedback_votes` | One vote per user per roadmap item | PK `(item_id, user_id)` |
| `feedback_comments` | Questions and answers on an item | `item_id`, `user_id`, `from_admin`, `body` |
| `feedback_files` | Pictures on an item (screenshots) | `item_id`, `filename`, `mime`, `size`, `storage_path` (`feedback/<uuid>` under `UPLOAD_DIR`) |

### 6.2 The `records` document

```jsonc
{
  "id": "uuid generated on the device",
  "type": "setup",                    // one of RECORD_TYPES (Appendix C)
  "data": {
    "form_id": "uuid of the form record used to edit it",
    "values": { "event": "<uuid>", "car": "<uuid>", "session": "Heat 1", "stagger_cold": "4.5", ... },
    "scope": "global"                 // only on shared records created by a platform admin
    // type-specific extras, e.g. seed_key, base, base_key (forms), merged_into, shared_as
  },
  "deleted": false,                   // soft delete; syncs like any change
  "client_updated_at": "ISO time of the edit on the device (conflict key)",
  "seq": 123456                       // global, increases on every write (sync cursor)
}
```

- **References** between records are plain uuids inside `values` (e.g. a setup's `event`, `car`; an event's `venue`, `series`, `fixture`). There are no foreign keys inside JSON; the UI tolerates missing targets.
- **Forms are records** (`type = 'form'`): each team has its own copy of every base form and may edit it.
- **Global records** (`tenant_id IS NULL`) are readable by every team and writable only by platform admins. Allowed types: `GLOBAL_TYPES` = `track, contact, supplier, contact_link, tuning_guide, series, fixture`.
- **Team copies of shared records**: a team's own series/track that was shared carries `shared_as` (the global id) after approval; team-private notes on shared records are `local_note` records.

### 6.3 Seeds

| File | Loaded into | Rule |
|---|---|---|
| `shared/seed/tracks.json` | global `track` records | added once per file version (sha1 marker in `schema_migrations`); fills blank fields only |
| `shared/seed/track_updates.json` | global tracks | a field is corrected only while it still holds the old shipped value |
| `shared/seed/guides.json` | global `tuning_guide` records | added once per `seed_key` |
| `shared/gearLists.js` | each team's `gear_list` records | added once per `seed_key` |
| `shared/baseForms*.js` | each team's `form` records | see §9 |

---

## 7. Identity, tenancy, licensing and access control

### 7.1 Accounts and sessions

- First run: `GET /api/status` → `needsSetup` when there are no users; `POST /api/setup` (under an exclusive table lock) creates the first user as **platform admin** and their first team.
- Sign in: `POST /api/auth/login` → `{ token, user, memberships, platform }`. Tokens are JWT (HS256, `sub` = user id) signed with `JWT_SECRET`, lifetime `JWT_TTL` (default 60 days so devices keep working offline over race weekends). Production refuses to start if `JWT_SECRET` is missing or shorter than 24 characters.
- `requireAuth` accepts `Authorization: Bearer` (or `?token=` for file downloads), loads the user and rejects disabled accounts.
- Passwords: bcrypt cost 10, minimum 8 characters.
- Invites: a team member with `members.manage` creates an invite (email + role, random token). `POST /api/invites/:token/accept` creates the account (name + password) or, for an existing account, checks its password. Seat limits are enforced on acceptance.

### 7.2 Tenancy

Every tenant route is under `/api/t/:tid`. `requireMember` loads the caller's role in that team plus the team's plan, features, status and licence expiry, and sets:

- `req.role` — `{ permissions, is_owner }`
- `req.ent` — the team's effective features (entitlements)
- `req.readOnly` — the licence has expired (GETs only; platform admins exempt)
- suspended teams are refused (platform admins exempt).

### 7.3 Licensing

- **Features** (`shared/catalog.js FEATURES`): the four areas plus `trackside`, `gears`, `dyno`, `reports`, `reviews`, `analytics`, and the add-on `ai`.
- **Plans** (`PLANS`, editable by the platform admin and stored in `platform_settings.plans`): `pro` (everything), `trackside`, `engine_shop`. A plan may also set `seats` and `share_limit`.
- **Entitlements** = plan features, then per-team overrides in `tenants.features` (`{ key: true|false }`). Computed on the server and sent to devices in each membership.
- **Licence state** (`shared/platform.js licenceState`): active, ending soon, expired (read-only), suspended.

### 7.4 Permissions

Permission keys:

- `area.<track|workshop|engines|team>` — enter an area;
- `<module>.<view|edit|delete>` — for each module in `MODULES` (some modules are view-only);
- admin rights `forms.manage`, `members.manage`, `roles.manage`, `team.manage`.

**Rule (`canType`) — access to a record type requires all of:**

1. the team is licensed for the module's area and feature;
2. the role may enter the area (modules with `area: null`, such as cars, contacts, calendar, AI and analytics, skip this);
3. the role has the module action.

Owners skip 2 and 3 but never 1. Forms: everyone can view; editing needs `forms.manage`. The same functions run on the server (enforcement) and in the web app (what to show).

**Default roles** created with each team: Owner, Crew Chief, Mechanic, Driver / Viewer (see `DEFAULT_ROLES`). Teams can add their own roles.

### 7.5 Platform admin

`users.is_platform_admin`. Can use `/api/admin/*` (teams, plans, users, directory, lists, settings, AI, system, audit, shared calendars) and write global records. Every admin action is written to `admin_audit`.

---

## 8. Offline-first sync

### 8.1 Device store (Dexie, database `raceops`)

```
records: 'id, [tenant_id+type], [tenant_id+dirty]'   // full record copies, dirty = 1 until pushed
meta:    'key'                                       // e.g. since:<tid> = last seq pulled
```

The UI reads only from Dexie (live queries), so it behaves the same online and offline. `saveRecord()` writes locally with `dirty=1` and a new `client_updated_at`, then nudges the sync loop. Deletes set `deleted=1` (soft).

### 8.2 Push — `POST /api/t/:tid/sync`

The device sends dirty records in batches of up to 200 (server limit 500): `{ changes: [{ id, type, data, deleted, client_updated_at }] }`. For each change, in its own transaction, `applyChange`:

1. validates the uuid and type, and locks the current row (`FOR UPDATE`);
2. refuses a type change or a record from another team (`denied`);
3. checks permissions: global records need a platform admin and a global type; team records need `edit`, or `delete` when deleting;
4. **conflict rule:** if the stored `client_updated_at` is newer than the incoming one, the change is `superseded`, written to history, and the newer record is returned;
5. otherwise inserts or updates (new `seq`), writes history `applied`, and runs side effects (`onRecordSaved`, e.g. ending engine sharing when an engine changes owner).

The device then marks each record clean, replaces it with the server copy, or drops it if denied (raising a `raceops:denied` event so the UI can explain). A record edited again while its push was in flight stays dirty.

### 8.3 Pull — `GET /api/t/:tid/sync?since=<seq>`

Returns up to 2000 records with `seq > since` for that team **plus all global records**, limited to the types the role may view, ordered by `seq`, with `more` when there are further pages. The device keeps a local dirty record if it is newer than the incoming one.

### 8.4 Other sync behaviour

- Sync runs on start, on each local change, when the connection returns, when the app comes back to the foreground, and every 30 seconds. The header badge shows **Synced / Syncing / Waiting to sync / Offline / Can’t sync**.
- Attachments are online-only (`/api/t/:tid/attachments`), and need the record to have synced first.
- A change to the user's role, the team's plan, feature overrides or entitlements triggers a **full re-download** (`fullResync`: clean local records dropped, cursor reset to 0). A pull already running when it starts is discarded (a reset generation counter), so it can't save its old cursor over the reset.
- **No caching of the API.** Every `/api` response carries `Cache-Control: no-store` (a middleware ahead of all routes; public iCal feeds set their own value, which replaces it), and the client's `api()` fetches with `cache: 'no-store'`. A browser that once cached a redirect for an API URL replayed it locally (`ERR_TOO_MANY_REDIRECTS`) and stayed **Offline** while other devices worked.
- **Stuck detection and Repair this device.** After two sync attempts in a row fail with no response while `navigator.onLine` is true, the client checks `GET /api/health` (no-store); if it answers, sync status gets `stuck: true`, the badge reads **Can’t sync** and links to **Profile & device**. `repairDevice()` calls `POST /api/device/clear-cache` (public, no state change; responds with `Clear-Site-Data: "cache"` so the browser empties its HTTP cache for the origin), then unregisters the service worker, deletes Cache Storage, drops clean local records and resets the cursor (dirty records and the session are kept), and reloads. If the endpoint can't be reached it changes nothing, so the offline app shell survives.
- Old installed apps keep running until reopened (service worker `autoUpdate`), so **the server must keep accepting older clients' payloads** (see §21).

---

## 9. Forms engine

Most screens are driven by **form definitions** stored as `form` records, rendered by `web/src/components/FormRenderer.jsx`.

### 9.1 Form definition

```jsonc
{
  "target": "setup",                 // record type it edits
  "name": "Setup sheet", "is_default": true,
  "base": true, "base_key": "setup:default",   // shipped form (dyno forms use dyno_kind: shock|bar)
  "sections": [
    { "id": "session", "title": "Session", "carry": true, "fields": [
      { "key": "event", "label": "Event", "type": "ref", "ref": "event", "core": true, "required": true },
      { "key": "stagger_cold", "label": "Stagger (cold)", "type": "number", "unit": "in" },
      { "key": "baseline_name", "type": "text", "showIf": "baseline=true" }
    ]}
  ]
}
```

**Field types:** `text`, `textarea`, `number`, `date`, `select` (`options`, `optionsFrom`, `allowCustom`), `tags`, `check`, `checkbox`, `ref` (another record type), `multiref`, `entityref` (type chosen by another field), `asset`, `member`, `contact`, `track`, `corners` (per-corner/per-cylinder values), `table` (rows with columns), `sweep` (dyno readings by velocity), `calc` and `derived` (computed), `heading`.

**Field options:** `core` (can't be removed by teams), `required`, `unit`, `help`, `placeholder`, `default`, `defaultSelf`, `showIf` (`key=A|B`, `key!=A`, empty allowed), `nocopy` (not carried to the next setup sheet), `suggest`, `measure`.

**Inventory pickers** (`asset` fields and `corners` fields with `input: 'asset'`): the value is `{ asset: <record id> }` when picked, or a plain string when entered manually. `category` limits assets to one category; `ref: 'tire'` lists tyre records instead of assets. `filterByCorner` (and every Shock field) lists first the items whose `position` is that corner, or empty/`N/A`/`Any`, and for this car (`car`, or a tyre's `available_for`); `scopePosition` does the same for a single field (`Top`/`Front` wings). Retired assets and worn-out tyres are hidden. **+ Save to inventory** turns a typed value into a new asset (or tyre) for that corner and car. Referenced items count laps through `setupsByAsset()`.

### 9.2 Base forms and upgrades

- `BASE_FORMS` (from `baseForms.js`, plus phase 2–4 additions) are copied into each new team.
- On every start, `ensureTeamBase()` adds missing base forms and runs `applyUpgrades()` with `FORM_UPGRADES` (phase 2) and `PHASE3_UPGRADES` (phase 3+). Upgrade kinds: add a field after another, patch a field's properties, patch a section, insert a section, move a field. Each upgrade leaves a `_patched_…`/`_moved_…` marker so it applies **once** and a team's later edits win.
- `FORM_REPLACE` swaps in the shipped structure when a marker field is missing (used for big redesigns), keeping sections the team added.
- **Every field needs an ⓘ description** in `shared/fieldInfo.js` (`FIELD_INFO`); the guide check enforces it.

### 9.3 Team form editing

`/forms/:id` lets users with `forms.manage` add, hide, reorder and describe fields and sections. Core fields can be hidden but not deleted. Setup sheets also support a per-user layout (section order, folding, before/after) in `shared/setupLayout.js`.

---

## 10. Server modules and API

Conventions:

- `h(fn)` wraps async handlers; `need(cond, status, message)` throws `HttpError`.
- `HttpError` messages are shown to users; any other error is logged and returned as `Server error` (500).
- `perm(key)` guards admin rights on tenant routes; record-type checks use `canType`.
- Every JSON body is limited to 10 MB; uploads to `MAX_UPLOAD_MB`.

| Module | Mounted at | Responsibility |
|---|---|---|
| `index.js` | `/api` | health, status, setup, login, invites, `me`, team settings, sync, record history, members, roles, invites, attachments, static web |
| `auth.js` | — | JWT, bcrypt, `requireAuth`, `requireMember` |
| `db.js` | — | pool (`max: 10`), `tx()`, migrations |
| `settings.js` | — | settings cache, `publicSettings()` sent to devices, `audit()`, `seatLimit()` |
| `ratelimit.js` | — | sign-in lockouts per account and per address |
| `admin.js` | `/api/admin` | tenants, plans, users (disable, reset password, unlock), lockouts, directory export/import/reseed, settings, lists, overview, audit, system (versions, sizes, upgrade forms) |
| `ai.js` | `/api/t/:tid/ai/*`, `/api/admin/ai` | extract (fill from file), debrief, ask, advise, guide-import, status; admin config and test |
| `jobs.js` | `/api/t/:tid/jobs/:id` | background job polling (`backgroundable()` wrapper) |
| `weather.js` | `/api/t/:tid/weather` | forecast / current weather for a track |
| `sharing.js` | `/api/share/:token`, `/api/t/:tid/engines…`, `engine-links`, `engine-invites`, `linked-engines`, `engine-usage` | engine shop sharing |
| `calendar.js` | `/api/public/calendar/:token(.ics)`, `/api/t/:tid/calendar/import`, `/publish`, `/api/admin/calendar/*` | import, publish, admin edits of shared dates and series |
| `calendarRequests.js` | `/api/t/:tid/calendar/requests…`, `/api/admin/calendar/requests…` | requests, checks, decisions, relinking |
| `calendarPlus.js` | `/api/public/shared/:type/:id(.ics)`, `/api/t/:tid/notices…`, officials, request replies, admin officials/ask/duplicates/merge/history/feeds/mail | calendar extras (§12) |
| `mail.js` | — | `sendMail`, `mailAdmins`, `mailTeam`, `mailUser` |
| `feedback.js` | `/api/feedback/*` (any signed-in user), `/api/admin/feedback/*` | feedback & ideas (§11.1) |
| `practice.js` | `/api/t/:tid/practice/reset`; `makePractice()` called from `POST /api/admin/tenants` | practice teams (§11.2) |

The full route list is in [Appendix D](#appendix-d--api-routes).

---

## 11. Functional modules

Each module is a set of record types, base forms, pages and (sometimes) shared calculations. The user-facing behaviour of every module is documented in `docs/guide/<article>.md`; this section records the design facts needed to rebuild it.

| Module (permission key) | Record types | Design notes |
|---|---|---|
| Cars (`cars`) | `car` | Number, name, class (from Classes we race + shared Race classes), gear list, ring & pinion, minimum fuel; one car per event |
| Contacts (`contacts`) | `contact`, `supplier`, `contact_link` | Team and global directory; `contact_link` gives roles (promoter, race director) at tracks/series |
| Tracks (`tracks`) | `track`, `team_track` | Global directory (seeded), team links (`team_track`: ours/hidden), classes per track, region for clashes |
| Events & series (`events`) | `event`, `series` | Event = meeting with venue (track ref) or free-text track, car, series/round, sessions, intent/outcome; series = name, season, class, sanctioning body |
| Calendar (`calendar`) | `fixture`, `season_plan`, `local_note`, `follow` | See §12 |
| Setups (`setups`) | `setup`, `tuning_guide` | One sheet per session; new sheets copy from the last session or a baseline (`nocopy` fields excluded); shocks, bars, tyres (`tires`) and wheels per corner from inventory or typed, top and front wings (`top_wing`, `front_wing`, `front_wicker`); shocks with adjusters from `ADJUSTERS`; feedback tags; advisor (`shared/advisor.js`) ranks past sheets by similar conditions and tuning-guide rules |
| At-track checks (`trackside`) | `track_check` | Between-round checklist per session |
| Gears & tyres (`gears`) | `gear`, `gear_list`, `tire` | Quick-change gear lists (seeded), owned sets, gear calculator, tyre stock and stagger combinations |
| Maintenance (`maintenance`) | `maintenance`, `schedule` | Checklists; schedules by races, laps, days or hours |
| Assets (`assets`) | `asset`, `measurement` | Parts with status, position, life limit and measurements; engines are assets (`category = Engine`) |
| Dyno (`dyno`) | `dyno_run` | Shock runs (`dyno_kind: shock`, test speeds, sweeps, adjuster type) and bar tests (`bar`); **Initial measurement** flag (auto on first test); overlays; shock fade from the initial run (`shared/dyno.js`, `bars.js`) |
| Engines (`engines`) | `engine_build` | Full build sheet; CID, compression and cam calculations (`shared/calcs.js`); engine checks (`engineChecks.js`) |
| Jobs (`jobs`) | `job` | Work orders with parts and labour, status flow, job numbers, handover pack (`enginePack.js`), shop settings (`shop.js`) |
| Customers (`customers`) | `customer` | Engine owners; sharing in `sharing.js` |
| Reports (`reports`) | — | Computed on device: results by car, spend, maintenance, Crew Chief stats; CSV export |
| Reviews (`reviews`) | `review` | Ratings and feedback per member and period |
| AI (`ai`) | — | Server-side only; see §15 |
| Analytics (`analytics`) | — | Computed on device from records (`shared/analytics.js`): performance, conditions, setups that worked, jet chart, service forecast, shock fade |

Other shared logic: 47 calculators (`calcs.js`, documented by the `{{calculators}}` guide embed), fuel planner (`fuel.js`), sessions (`sessions.js`), themes (`themes.js`), weather maths (`weather.js`).

### 11.1 Feedback, ideas and the roadmap (`server/src/feedback.js`, `shared/feedback.js`)

Not team data, so it lives in its own tables (§6.1), not in `records`, and is online-only.

- **Users** (any signed-in person, `/feedback`): send a bug report (title, what went wrong, steps, expected; the page it came from and device context are added automatically), an enhancement or a new feature (title, what and why); up to 3 pictures (PNG/JPEG/WebP/GIF, 8 MB each); 20 submissions per person per day. **Already on the roadmap?** matches the title against public items by word overlap (`similarity`) and offers a vote instead. **My submissions** shows status, decisions and the admin's questions (answer with `reply`); `seen=false` drives the sidebar badge (`notices.feedback_updates` in `/api/me`). **Roadmap** lists public items that are approved, in progress, or done in the last 120 days, by lane, with one vote per user.
- **Platform admins** (`/admin/feedback`): capture ideas (`source='admin'`, `status='draft'`), edit any item (kind, priority, description, acceptance criteria, functionality areas, public flag and roadmap summary), and decide: approve into a lane (`now` = action now, `next`/`later` = roadmap; non-bug items default to public), decline (note required), mark duplicate (the submitter's vote moves to the original), ask the submitter, move lane, start, done (with release), reopen. Every decision is audited and the submitter is told in the app and by email (`mailUser`). New items and answers email the admins. `notices.feedback_new` counts the inbox.
- **Functionality areas** (`FEATURE_AREAS`): the four areas, every module from the catalogue, and app-wide parts (forms, sync, accounts, licensing, platform admin, navigation, appearance, guide, calculators, weather, import, email, feedback, deployment), each with the code files it lives in. `areaForPage()` links a report to an area from the page it was sent from.
- **Send to Claude**: the web app builds a Markdown brief (`buildBrief`): item details, discussion, areas with their code files, related guide articles (matched by `covers: module:…` and `pages:`), and the `CLAUDE.md` rules (guide, design documents, e2e tests, backward compatibility). The admin can edit it, then either create a GitHub issue (`POST /repos/{GITHUB_REPO}/issues` with labels from `GITHUB_ISSUE_LABELS` and a `CLAUDE_MENTION` line asking Claude to action it and open a pull request — the Claude Code GitHub Action picks it up), post an updated brief as an issue comment, or copy/download it and **Mark as sent**. Either way the item moves to `in_progress`. **Check GitHub** reads the issue's state.

### 11.2 Practice teams and the training pack (`server/src/practice.js`, `shared/practiceData.js`)

- A practice team is an ordinary tenant with `tenants.settings.practice = true` and team type `both`. A platform admin creates one by ticking **Practice team** on **Create a team** (`POST /api/admin/tenants` with `practice: true`); the server calls `makePractice()`, which sets the flag and seeds it in the same transaction. The audit entry records `practice`.
- `practiceData({ form, today, uuid })` returns the demo records (cars, engines, shocks, bars, wheels, wings, tyres, a contact and supplier, the *Club Championship* series with eight past rounds and two setup sheets each, tonight's event with a Heat 1 sheet and a between-round check, next week's round 9, three schedules, a weekly maintenance, an engine build, and an engine shop customer, engine and job J-1001). Dates are relative to `today`, so the data always looks current. `seedPractice()` maps each record to the team's form for its type and writes record history.
- `POST /api/t/:tid/practice/reset` (owner, `team.manage` or platform admin; practice teams only, else 400) soft-deletes every record except `form` and `gear_list` (bumping `seq`, so devices drop them on sync), deletes the team's calendar requests and team notices, and re-seeds. Forms and roles are kept.
- Practice teams can't send calendar requests (`calendarRequests.js` returns 400), so trainees never reach the shared-calendar admins.
- Web: a **Practice team** banner in `Layout` (links to `/help/training`), and a **Practice team** box with **Reset practice data** on the Team page.
- The training pack itself is guide content (`section: training`: `training*.md`): start page, quick start, trainer's guide and rollout plan, quick reference cards (printed with `/print/guide?ids=training-cards`, one card per page), and exercises per role with "Check yourself" questions and sign-off tasks. Videos are WebM files in `docs/guide/video/`, embedded as `![…](video/<name>.webm)` and rendered as `<video>` with the poster `img/<name>.webp`; they are made by `tools/training_videos.py` (Playwright recording with a caption bar and pointer, re-encoded with ffmpeg to VP9) and are not precached by the PWA (online only).

**Team types** (`shared/shop.js TEAM_TYPES`): `race`, `shop`, `both`. They change navigation and checklists, not permissions.

---

## 12. Shared calendars subsystem

The largest cross-team workflow. Shared (global) `series` and `fixture` records are the single source of truth. Teams pull dates into their own `event` records.

### 12.1 Records

- `fixture` (global or team): `name`, `date`, `end_date`, `venue` (track id or text), `series`, `round`, `classes`, `status` (Scheduled/Postponed/Cancelled), `major`, `major_name`, `sanctioning`, `entries`, `results` (table: pos, number, driver, team), `results_note`, `feed_uid`, `source`.
- `event` (team): created from a fixture by `eventFromFixture()`, carries `fixture` (link), `car`, `intent` (Planned/Tentative/Not going), `outcome` (Raced the feature, Did not make the feature, Withdrew…, Did not attend, Event cancelled), `withdraw_reason`, `withdraw_session`, notes.
- `season_plan` (team): series entry — `series`, `season`, `car`, `class`, `participation` (Full/Partial).
- `local_note` (team): private notes on a shared series, track or date.
- `follow` (team): `entity_type` (series/track), `entity`.

### 12.2 Racing year

`tenants.settings.calendar_season_start` (month) defines a racing year (e.g. July → "2026-27"). Helpers in `shared/calendar.js`: `seasonOf`, `seasonLabel`, `seasonRange`, `inSeason`, `seasonMatches`.

### 12.3 Team flows

- **Add a date:** choose the car(s) whose class runs (`carsForFixture`) → event linked to the fixture.
- **Series entry:** full = every round; partial = round picker listing **every** round of the series (any racing year; cancelled hidden). Unticking a round already on the calendar sets the event to `Not going`; ticking sets `Planned`.
- **Shared date changes** flow into linked events automatically (`syncEvents` on the server); offline edits show a "shared calendar changed" prompt.
- **Import:** link, iCal/webcal (parsed by `parseICS`), PDF/photo/screenshot/text (AI). The server fetches links itself and refuses private addresses (SSRF guard) unless `CALENDAR_FETCH_PRIVATE=1` (tests only).
- **Publish:** token stored in team settings; public page `/c/:token` and iCal `/api/public/calendar/:token.ics`; shows only going events, never notes or withdraw reasons.
- **Clashes** (client only): same day and region, flagged when classes overlap.
- **Follow → Updates:** `notifyFollowers()` writes `team_notices` when followed dates are added, moved, cancelled or get results; unseen counts appear on the membership (`calendar_updates`).

### 12.4 Requests and moderation (`calendarRequests.js`)

- A team sends `share` requests (its own series, track or dates, with events) or `change` requests (to a shared series, track or date; results are changes too).
- **Checks** on every request: same or similar name (series/track), same date and track or same series round (duplicate), and the same round on another date or another meeting at the track (clash).
- **Decision** per item: add, link to existing, or refuse with a reason. `decide()` writes global records, then `relinkTeam()` repoints the team's events, series entries, track links, contacts and notes to the shared records, retires its own copies (`shared_as`), and turns their notes into `local_note`.
- Statuses: `pending`, `question`, `approved`, `partly_approved`, `rejected`, `withdrawn`. `seen=false` drives the team's badge.
- **Officials** with `auto_approve` skip moderation (`source='official'`) unless a duplicate or clash is found.
- **Questions:** admin asks (status `question`, email to team); team answers (back to `pending`, email to admins).

### 12.5 Admin tools (`calendarPlus.js`)

- **Feeds:** one iCal URL per shared series/track; checked every `CALENDAR_FEED_HOURS`; new dates become one share request and changed dates become change requests (`source='feed'`, `tenant_id NULL`), matched by `feed_uid` or date+name.
- **Duplicates and merge:** similar names → merge repoints every tenant's records (`MERGE_TYPES`), de-duplicates per team, moves officials/feeds/requests, soft-deletes the loser with `merged_into`.
- **History and restore:** from `record_history`; restoring a fixture re-syncs teams' events.
- **Public shared pages:** `/cal/series/:id` and `/cal/track/:id` (web), backed by `/api/public/shared/:type/:id` and `.ics`.

### 12.6 Email

`mail.js` — sent after the transaction commits (`sendAfter`). Admins: new requests and answers. Team (owners + `calendar.edit` roles): decisions, questions, official appointments, followed changes. Users opt out with `prefs.email_notices = false`. No SMTP host → nothing sent. `MAIL_TRANSPORT=file` writes JSON files to `MAIL_OUTBOX` for tests.

---

## 13. Web client

- **Entry:** `web/src/main.jsx` → `App.jsx` (React Router). Public routes (login, invite, share page `/s/:token`, published calendar `/c/:token`, shared calendar `/cal/:type/:id`, print pages) and signed-in routes inside `Layout` (Appendix E).
- **Session** (`lib/session.jsx`): token, user, memberships, platform settings and notices in `localStorage` (`raceops.session`); current team `tenantId`; `refresh()` re-reads `/api/me`. Exposes `can`, `canType`, `canArea`.
- **API** (`lib/api.js`): `api(path, { method, body })` adds the token and throws errors with the server's message; `apiJob()` posts with `async: true` and polls `/jobs/:id`.
- **Data** (`lib/data.js`): `useTeamData()` live-queries Dexie for the current team and global records, with `list(type)`, `byId`; helpers `v()`, `vals`, `titleOf`, `fmtDate`, `formFor`, `isVisible`.
- **Layout:** sidebar grouped by area (collapsible, per-user), badges (calendar requests/updates, admin queue), sync badge, announcement banner, mobile bottom bar. Each page header has a **?** linking to the guide article for that route.
- **PWA** (`vite.config.js`): `registerType: autoUpdate`; precaches JS, CSS, HTML, images and fonts (including guide images, so Help works offline); navigation fallback `index.html`, never for `/api/`.
- **Theming:** CSS custom properties on `:root`, light/dark and custom themes from `shared/themes.js`, stored in `users.prefs`.
- **Printing:** dedicated routes (`/print/calendar`, `/print/guide` (optionally `?ids=a,b` for chosen articles), `/print/job/:id`) with print CSS.

---

## 14. Background work and in-memory state

| State | Module | Effect of a restart | Multi-instance impact |
|---|---|---|---|
| Platform settings cache | `settings.js` | reloaded at start | other instances would serve stale settings until restart |
| Sign-in lockouts | `ratelimit.js` | cleared | limits would apply per instance |
| Background jobs (AI reads, imports) | `jobs.js` | in-flight jobs lost; the app says "try again" | polling must reach the instance that ran the job |
| Feed check timer | `calendarPlus.js` | restarts (first run after 2 min) | every instance would check feeds |

**The app must run as exactly one instance.** Scaling out needs these moved to Postgres (or Redis) first — see `ROLLOUT.md`.

---

## 15. External integrations

| Service | Used for | Config | Failure behaviour |
|---|---|---|---|
| Anthropic Messages API | AI: fill from photo/PDF/Excel, voice debrief, Ask RaceOps, setup advisor, guide import, calendar import | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_BASE_URL`; models and prices in Platform admin → AI (defaults `claude-haiku-5-5` fast, `claude-sonnet-5-5` smart) | 300 s timeout; clear error messages; usage and cost logged to `ai_usage`; per-team monthly allowance; `AI_PROVIDER=mock` for tests |
| Open-Meteo | Track weather | `WEATHER_PROVIDER` (`open-meteo`/`off`/`mock`), `OPEN_METEO_API_KEY` for paid plans | weather panel shows an error; rest unaffected |
| SMTP | Notification emails | `SMTP_*`, `APP_URL` | logged, never breaks a request |
| GitHub REST API | Feedback items sent to Claude as issues | `GITHUB_TOKEN` (fine-grained, Issues read/write), `GITHUB_REPO`, `GITHUB_ISSUE_LABELS`, `CLAUDE_MENTION`, `GITHUB_API_URL`; `GITHUB_PROVIDER=mock` for tests | 20 s timeout; clear messages for a refused token or missing repo; the brief can always be copied instead |
| Public web / iCal | Calendar import and feeds | `CALENDAR_FEED_HOURS`, `CALENDAR_FETCH_PRIVATE` (tests) | 20 s timeout; private addresses refused; Facebook/Instagram refused with advice |

AI rules: all calls are server-side; each checks the `ai` licence feature, the role's `ai.view`, the team's opt-out and the monthly allowance (`tenants.ai_budget_usd` or the platform default). Only the visible table is sent when extracting dyno data. Long reads run as background jobs.

---

## 16. Security

- **Transport:** HTTPS at the proxy; HSTS recommended; the app port is reachable only from the proxy.
- **Auth:** bcrypt passwords; long-lived JWT (revocation by disabling the user or changing `JWT_SECRET`); sign-in lockouts per account (5) and per address (20) in 15 minutes, doubling to 24 hours, logged to the audit log.
- **Authorisation:** every tenant route checks membership; every record write checks type permissions; global writes need a platform admin; licence expiry makes a team read-only; suspension blocks it.
- **Data isolation:** all tenant queries filter by `tenant_id`; sync pulls only the team's records and global records of viewable types.
- **Uploads:** stored under random uuids outside the web root; served with `nosniff`, a restrictive CSP and `Content-Disposition`; size-limited.
- **Feedback pictures:** images only, size- and count-limited, stored under random uuids, served only to the person who sent the item and platform admins, with `nosniff` and a restrictive CSP. Admin names and emails, device context and GitHub details are stripped from what submitters see.
- **SSRF:** server-side fetching refuses private, loopback, link-local and CGNAT addresses.
- **Secrets:** environment variables only (Portainer stack); never in the repo, logs or devices. `x-powered-by` is off.
- **Audit:** `admin_audit` (admin actions, lockouts), `record_history` (every data write), `ai_usage`.

---

## 17. User guide system

- Articles are Markdown files in `docs/guide/` with front matter: `id`, `title`, `section`, `order`, `summary`, `for` (audience), `team`, `pages` (routes it explains), `covers` (types, modules, features, permissions, roles, team types, settings, options), `related`.
- `shared/guide.js` parses articles; the web app bundles them (`@docs` alias) and shows them at `/help`, with search, role filtering, the **?** link per page and `{{embed}}` tables generated from code (`EMBEDS` in `shared/guideData.js`: roles, permissions, plans, settings, calculators, themes, shock adjusters).
- `shared/guideData.js SETTINGS` lists every setting; `shared/guideChecklist.js CHECKLIST` is the first-run checklist on Home.
- `tools/check-guide.mjs` fails the build if any page, record type, module, licence feature, admin right, team type, built-in role, setting read in the code, link, image or field description is undocumented.
- Screenshots: `tools/guide_shots.py` against a test server. Videos: `tools/training_videos.py` (needs ffmpeg), into `docs/guide/video/` with posters in `docs/guide/img/`.
- `helpImages` collects `img/…` and `video/…` references; the check fails if a referenced file is missing.

---

## 18. Build, test and quality gates

| Gate | Command | Runs |
|---|---|---|
| Guide coverage | `node tools/check-guide.mjs` | in `npm run build` (and so in `docker build`) |
| Design document coverage | `node tools/check-design.mjs` | in `npm run build` |
| Web build | `cd web && npm run build` | Vite production build |
| End-to-end tests | `tests/e2e/run.sh` (suites `e2e.py` … `e2e34.py`) | `tests/e2e/server.sh` recreates the test database and starts the server with `AI_PROVIDER=mock WEATHER_PROVIDER=mock CALENDAR_FETCH_PRIVATE=1 CALENDAR_FEED_HOURS=0 MAIL_TRANSPORT=file MAIL_OUTBOX=… APP_URL=…`, then creates the first user `owner@test.com` through `/api/setup`; suites run in order and build on each other (see `tests/e2e/README.md`) |
| Dependency audit | `npm audit` (server and web) | before each release |

Local development: Postgres on `localhost:5432` (db/user `raceops`), `cd server && npm i && node src/index.js`, `cd web && npm i && npm run dev` (Vite proxies `/api` to `:8080`).

---

## 19. Operations, backup and disaster recovery

### 19.1 Routine operations

- **Health:** `GET /api/health` (container healthcheck and proxy check). **Platform admin → System & activity** shows version, Node, Postgres, database size, uploads size, migrations, record counts and the audit log.
- **Logs:** container stdout (migrations, form upgrades, lockouts, unhandled errors, email failures).
- **Updates:** deploy a new image; migrations and upgrades run on start (see `ROLLOUT.md`).

### 19.2 Backups (minimum)

| What | How | Frequency | Keep |
|---|---|---|---|
| Database | `docker exec <db> pg_dump -U raceops -Fc raceops > raceops-YYYYMMDD.dump` | daily, and before every production deploy | 14 daily, 8 weekly, 12 monthly |
| Uploads | archive the `raceops_uploads` volume (`tar` or `restic`) | daily | as above |
| Source | GitHub + a mirror (second remote) + `git bundle create raceops.bundle --all` stored with backups | every release | all releases |
| Images | registry (GHCR) tags per release | every release | all releases |
| Secrets and stack config | password manager entry: stack environment, Portainer stack file, pfSense config backup (XML) | on change | latest + previous |

Backups must be copied **off the Docker host** (NAS and offsite/cloud). Test a restore at least quarterly into the staging environment.

### 19.3 Recovery runbooks

**A. App container broken or bad release.** Redeploy the previous image tag. If the release ran a migration that isn't backward compatible, restore the pre-deploy database dump (B).

**B. Database lost or corrupted.**
1. Stop the `app` service.
2. Recreate the `db` service with an empty volume.
3. `pg_restore -U raceops -d raceops --clean --if-exists raceops-YYYYMMDD.dump`.
4. Start `app` (migrations bring the schema up to the image's version).
5. Devices re-sync. Changes made offline after the backup are pushed again from devices that still hold them.

**C. Docker host lost.** Build a new host with Docker and Portainer. Recreate the stack from the saved stack file and environment. Restore the database (B) and the uploads volume. Point the proxy backend at the new host. The hostname and certificate are unchanged, so installed apps keep working.

**D. Repository lost.**
1. Restore from the mirror or the latest `git bundle` (`git clone raceops.bundle raceops`).
2. If both are gone: the latest runtime image in the registry contains `server/` and `shared/` source plus `web/dist`. Extract it with `docker create` + `docker cp`. Rebuild the web source from this document, the guide (`docs/guide` is in every bundle), and the e2e suites as the acceptance test.
3. Re-create `CLAUDE.md`, `README.md` and these design documents from the latest copies held off-repo.

**E. Rebuild from scratch (last resort).** Follow §3–§18 in order: schema (Appendix B), catalogue and permissions (§7), sync (§8), forms engine (§9), modules (§11–§12), client (§13). Use the user guide as the functional specification and the e2e suites as acceptance tests.

**Targets:** RPO 24 hours (daily backups; devices often hold newer changes), RTO 4 hours for A–C.

---

## 20. Maintaining this document

This document is updated **in the same commit** as the change it describes. For every release, check:

| If the release… | Update |
|---|---|
| adds a migration | Appendix B, §6.1 if a table changes, header "Last schema migration" |
| adds or changes an environment variable | Appendix A, `docker-compose.yml`, `README.md` |
| adds a server module or route | §10, Appendix D |
| adds a record type or module | §11, Appendix C, §7.4 if permissions change |
| adds a web route | Appendix E |
| changes sync, auth, licensing or permissions | §7, §8 |
| adds an external service | §15, §16 |
| adds in-memory state or a timer | §14 |
| changes build, test or deployment | §5, §18, `ROLLOUT.md` |
| changes backup or recovery | §19 |

Then set **Last updated** in the header. `node tools/check-design.mjs` checks that every migration file, every environment variable read in `server/src`, every file in `server/src` and every record type appears in this document; the build fails otherwise.

---

## 21. Known constraints and technical debt

- **Single instance only** (§14). Horizontal scaling needs shared state first.
- **Attachments on a local volume.** Moving to object storage (S3-compatible) is needed for multi-host or PaaS hosting.
- **Client/server compatibility.** Installed apps update on next open, and offline devices may push changes days later, so record payloads and APIs must stay backward compatible for at least `JWT_TTL`. Prefer additive changes; never rename a value key without an upgrade path.
- **Forward-only migrations.** Rollback means restoring a dump unless the migration was additive. Write migrations "expand first, contract later" (see `ROLLOUT.md`).
- **Conflict resolution is last-write-wins per record**, on device clocks; a device with a wrong clock can win or lose unexpectedly. History keeps every attempt.
- **Version number** in `server/package.json` is not bumped per release yet; release tags are recommended in `ROLLOUT.md`.
- **JWT revocation** is coarse (disable user or rotate the secret).

---

## Appendix A — Environment variables

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | `postgres://raceops:raceops@localhost:5432/raceops` | yes (set by compose) | Postgres connection |
| `POSTGRES_PASSWORD` | — | yes (compose) | Database password, used to build `DATABASE_URL` |
| `JWT_SECRET` | dev value | yes in production (≥ 24 chars) | Token signing; changing it signs everyone out |
| `JWT_TTL` | `60d` | | Session length |
| `PORT` | `8080` | | HTTP port in the container |
| `APP_PORT` | `8080` | | Host port (compose) |
| `NODE_ENV` | `production` (image) | | Enables the JWT secret check |
| `UPLOAD_DIR` | `/data/uploads` (image) | | Attachment storage |
| `WEB_DIR` | `web/dist` | | Built web app location |
| `MAX_UPLOAD_MB` | `25` | | Upload size limit |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | | Proxies whose `X-Forwarded-For` is trusted |
| `LOGIN_MAX_PER_ACCOUNT` | `5` | | Failures per account per window |
| `LOGIN_MAX_PER_IP` | `20` | | Failures per address per window |
| `LOGIN_WINDOW_MINUTES` | `15` | | Failure window |
| `LOGIN_LOCK_MINUTES` | `15` | | First lockout length |
| `ANTHROPIC_API_KEY` | — | for AI | Anthropic key |
| `ANTHROPIC_WORKSPACE_ID` | — | | Only for keys not limited to one workspace |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com/v1/messages` | | Override the API endpoint |
| `AI_PROVIDER` | `anthropic` | | `mock` for automated tests only |
| `WEATHER_PROVIDER` | `open-meteo` | | `open-meteo`, `off`, `mock` (tests) |
| `OPEN_METEO_API_KEY` | — | | Paid Open-Meteo plans |
| `SMTP_HOST` | — | for email | Mail server; unset = no email |
| `SMTP_PORT` | `587` | | `465` = TLS from the start |
| `SMTP_SECURE` | by port | | `true`/`false` override |
| `SMTP_USER` / `SMTP_PASS` | — | | Mail login |
| `SMTP_FROM` | `SMTP_USER` | | Sender address |
| `APP_URL` | — | for email links | Public address of the app |
| `CALENDAR_FEED_HOURS` | `12` | | Feed check interval; `0` = off |
| `GITHUB_TOKEN` | — | to send to Claude by GitHub issue | Fine-grained token for the repository with Issues: read and write |
| `GITHUB_REPO` | — | with `GITHUB_TOKEN` | Repository for issues, e.g. `mdburlace/raceops` |
| `GITHUB_ISSUE_LABELS` | `raceops-feedback` | | Labels on new issues (comma-separated) |
| `CLAUDE_MENTION` | `@claude` | | How the issue calls Claude (the Claude Code GitHub Action's trigger) |
| `GITHUB_API_URL` | `https://api.github.com` | | GitHub Enterprise or a proxy |
| `GITHUB_PROVIDER` | — | tests only | `mock` creates fake issues in memory |
| `CALENDAR_FETCH_PRIVATE` | — | tests only | `1` allows fetching private addresses |
| `MAIL_TRANSPORT` | — | tests only | `file` writes emails to `MAIL_OUTBOX` |
| `MAIL_OUTBOX` | `/tmp/raceops-outbox` | tests only | Folder for `file` emails |

## Appendix B — Migrations

| File | Purpose |
|---|---|
| `001_init.sql` | `pgcrypto`; users, tenants, roles, memberships, invites, records (+ `record_seq`), record_history, attachments, schema_migrations |
| `002_areas_licensing.sql` | tenants `plan`, `features` |
| `003_global_records.sql` | `records.tenant_id` and `record_history.tenant_id` nullable (global records); global indexes |
| `004_platform_admin.sql` | `platform_settings`; tenant `status`, `seats`, `licence_expires`, `admin_notes`; user `disabled`, `last_login_at`; `admin_audit` |
| `005_ai.sql` | `ai_usage`; tenant `ai_budget_usd`; `ai.view` for existing roles |
| `006_user_prefs.sql` | `users.prefs` |
| `007_engine_shop.sql` | jobs and customers rights for roles with engine rights |
| `008_engine_sharing.sql` | `engine_shares`, `engine_links` |
| `009_link_lifecycle.sql` | `engine_links.feed_lifecycle` |
| `010_analytics.sql` | `analytics.view` for roles that can read setups or assets |
| `011_calendar.sql` | calendar rights from event rights |
| `012_calendar_requests.sql` | `calendar_requests` |
| `013_calendar_plus.sql` | requests `source`, nullable tenant; `calendar_request_messages`, `calendar_officials`, `team_notices`, `calendar_feeds` |
| `014_feedback.sql` | `feedback_items`, `feedback_votes`, `feedback_comments`, `feedback_files` |

## Appendix C — Record types

| Module | Types |
|---|---|
| cars | `car` |
| contacts | `contact`, `supplier`, `contact_link` |
| tracks | `track`, `team_track` |
| events | `event`, `series` |
| calendar | `fixture`, `season_plan`, `local_note`, `follow` |
| setups | `setup`, `tuning_guide` |
| trackside | `track_check` |
| gears | `gear`, `gear_list`, `tire` |
| maintenance | `maintenance`, `schedule` |
| assets | `asset`, `measurement` |
| dyno | `dyno_run` |
| engines | `engine_build` |
| jobs | `job` |
| customers | `customer` |
| reviews | `review` |
| (all) | `form` |

## Appendix D — API routes

Public: `GET /api/health`, `POST /api/device/clear-cache`, `GET /api/status`, `POST /api/setup`, `POST /api/auth/login`, `GET|POST /api/invites/:token[/accept]`, `GET /api/share/:token`, `GET /api/public/calendar/:token[.ics]`, `GET /api/public/shared/:type/:id[.ics]`.

Signed in: `GET|PATCH /api/me`; feedback `GET /api/feedback/mine|roadmap|similar`, `POST /api/feedback`, `POST /api/feedback/seen`, `POST /api/feedback/:id/files|reply|withdraw|vote`, `GET /api/feedback/files/:fid`.

Team (`/api/t/:tid`): `PATCH /`; `GET|POST /sync`; `GET /records/:id/history`; `GET /members`, `PATCH|DELETE /members/:id`; `GET|POST /invites`, `DELETE /invites/:id`; `GET|POST /roles`, `PATCH|DELETE /roles/:id`; `GET|POST /attachments`, `GET /attachments/:id/file`, `DELETE /attachments/:id`; `GET /jobs/:id`; `GET /weather`; AI `GET /ai/status`, `POST /ai/extract|debrief|ask|advise|guide-import`; sharing `/engines/…`, `/engine-links/…`, `/engine-invites/…`, `/linked-engines…`, `/engine-usage`; practice `POST /practice/reset`; calendar `POST /calendar/import`, `PUT /calendar/publish`, `GET|POST /calendar/requests`, `POST /calendar/requests/:id/withdraw|reply`, `POST /calendar/requests/seen`, `GET /calendar/officials`, `GET /notices`, `POST /notices/seen`.

Admin (`/api/admin`): `tenants`, `plans`, `users`, `lockouts`, `directory`, `tracks/export|import|reseed`, `settings`, `settings/general`, `settings/lists/:key`, `overview`, `audit`, `system`, `system/upgrade-forms`, `ai`, `ai/test`, `calendar/data`, `calendar/fixtures/:id`, `calendar/series/:id`, `calendar/requests[/:id/decide|ask]`, `calendar/officials[/:id]`, `calendar/duplicates`, `calendar/merge`, `calendar/history/:id[/restore]`, `calendar/feeds[/:id[/check]]`, `mail`, `mail/test`, `feedback` (list by view, create idea), `feedback/:id` (get, patch, delete), `feedback/:id/files|decide|claude|github`.

## Appendix E — Web routes

Public: `/login`, `/invite/:token`, `/s/:token`, `/c/:token`, `/cal/:type/:id`, `/print/calendar`, `/print/guide`, `/print/job/:id`.

Signed in: `/` (home), `/track`, `/workshop`, `/engines`, `/team`, `/team/members`, `/team/reports`, `/team/reviews`, `/team/stats`, `/roles`, `/forms`, `/forms/:id`, `/cars`, `/events`, `/events/:id`, `/series`, `/series/:id`, `/setups`, `/compare`, `/track/advisor`, `/track/advisor/guides[/:id]`, `/track/checks`, `/track/gears`, `/tracks`, `/tracks/:id`, `/calendar`, `/maintenance`, `/assets`, `/assets/:id`, `/workshop/dyno`, `/engines/linked/:id`, `/link-engine/:code`, `/jobs`, `/customers`, `/customers/:id`, `/contacts`, `/contacts/:id`, `/suppliers`, `/calculators`, `/analytics`, `/ask`, `/help`, `/help/:id`, `/feedback`, `/profile`, `/r/:type/:id` (generic record editor), `/admin`, `/admin/teams|plans|users|directory|lists|settings|system|ai|calendar|feedback`.
