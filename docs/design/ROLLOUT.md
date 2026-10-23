# RaceOps — Environments, Release and Production Roll-out

> Companion to [DESIGN.md](DESIGN.md). It covers how code moves from a developer's machine to production through non-production environments, how builds are deployed to each one, and whether production should stay on Docker. Update it whenever the build, test or deployment process changes.

---

## 1. Where we are today

| Aspect | Today | Risk |
|---|---|---|
| Environments | Production only (Portainer stack on the home Docker host). Testing happens in a throw-away container. | Every change is first exercised by real teams in production. |
| Build | Portainer builds the image from the Git repo on the production host (`build: .`). | What runs is whatever `main` was when someone pressed redeploy. No record of which commit is live, no quick rollback. |
| Versioning | `server/package.json` stays at `1.0.0`; no tags. | You can't tell what's deployed or go back to a known version. |
| Tests | 29 Playwright suites in `tests/e2e/`, run by hand with `tests/e2e/run.sh`. | They don't run automatically on every change yet. |
| Database changes | Migrations run on container start. No backup step before a deploy. | A bad migration can only be undone from whatever backup exists. |
| Backups | Two Docker volumes, backed up by hand. | No tested restore. |

## 2. Principles

1. **Build once, promote the same image.** One image per commit, built by CI. Staging and production run that exact image (same digest). Production never builds from source.
2. **Configuration lives in the environment, not in the image.** Each environment has its own stack environment: secrets, URLs and providers.
3. **Every environment is the same shape.** Same compose file, same Postgres major version, same reverse-proxy pattern. Only the data, scale and secrets differ.
4. **Automated gates before people.** The guide check, design check, build and end-to-end tests run on every change. People only look at what passed.
5. **Every release can be undone.** Versioned images, migrations that the previous version can live with, and a database dump taken right before each production deploy.
6. **Offline clients are part of the system.** Installed apps update on next open, and offline devices may push changes days later. Every release must keep accepting the previous app's data (DESIGN.md §21).

## 3. Environments

| | **DEV** | **TEST (CI)** | **STAGING** | **PRODUCTION** |
|---|---|---|---|---|
| Purpose | Write and debug code | Automated checks on every push and pull request | Acceptance testing, release rehearsal, demos, guide screenshots | Real teams |
| Where | Developer machine or cloud dev container | GitHub Actions runner (temporary) | Portainer stack `raceops-staging`, ideally on a separate VM | Portainer stack `raceops` |
| How it's run | `node src/index.js` + `vite` dev server, local Postgres; or `docker compose up` | `docker compose` with the image just built, in a job | Image tag `edge` (latest `main`) or a release candidate | Pinned release tag, e.g. `1.6.0` |
| Database | Local, disposable | New and empty each run | Own database, refreshed from an **anonymised** copy of production | Production |
| Hostname | `localhost` | `localhost` in the runner | `staging.raceops.<domain>`, reachable on the LAN or over Tailscale only | `raceops.<domain>` |
| AI | `AI_PROVIDER=mock`, or a dev key | `mock` | A separate Anthropic **workspace** with a small monthly limit | Production key |
| Weather | `mock` | `mock` | `open-meteo` | `open-meteo` |
| Email | `MAIL_TRANSPORT=file` | `file` (tests read the outbox) | SMTP to a mail catcher (Mailpit container), so nothing reaches real people | Real SMTP |
| Calendar feeds | off (`CALENDAR_FEED_HOURS=0`) | `CALENDAR_FETCH_PRIVATE=1` | on | on |
| Deploys | whenever | every push | automatically on every merge to `main` | by approval, after staging sign-off |
| Who uses it | developer | nobody (machines) | you and a few trusted testers | everyone |

Why these four: DEV and TEST catch code problems cheaply. STAGING catches the problems that only show up with real data, real HTTPS, a real proxy and an installed phone app, such as migrations on production-sized data, service-worker updates and email. Production then only ever receives an image that has already run on staging.

**Separate hostnames matter for a PWA.** An installed app and its offline database belong to the address they came from. Staging must have its own hostname so testers' phones never mix staging and production data.

### 3.1 Staging data

Refresh staging from production on demand (and at least before each release):

1. `pg_dump -Fc` from production (the nightly backup will do).
2. Restore into the staging database.
3. Run an anonymising script (keep it in `tools/anonymise.sql`):
   - Set every user's email to `user-<id>@staging.invalid`, except named testers.
   - Reset every password to one known staging password.
   - Set `tenants.ai_budget_usd` low (or turn AI off in staging's **Platform admin → AI**), so tests can't run up costs.
   - Clear `engine_shares` tokens and published calendar tokens, so production links don't work against staging.
4. Copy the uploads volume, or leave staging without attachments if they're large.

Production secrets never go into staging. Staging has its own `JWT_SECRET`, database password, Anthropic workspace key and SMTP settings.

## 4. Source control and versioning

- **Trunk-based.** `main` is always releasable. Work happens on short-lived branches (`feature/…`, `fix/…`) merged by pull request once CI passes. Small changes may go straight to `main` while you're the only developer, as long as CI runs.
- **Semantic versions.** Each production release is a Git tag `vMAJOR.MINOR.PATCH`:
  - MINOR for features;
  - PATCH for fixes;
  - MAJOR for a change that needs action from admins, such as a new required environment variable or a contract migration.
- **Bump `server/package.json`** (and `web/package.json`) to the release version in the release commit. **Platform admin → System & activity** then shows what's running. Inject the Git commit too (build argument `GIT_SHA` → environment variable), so the System page shows the exact commit.
- **Release notes:** `docs/guide/whats-new.md` already serves as user-facing notes. Add a short `CHANGELOG.md` entry for admin-facing changes (new environment variables, migrations, manual steps).
- **Tests in version control.** The Playwright suites are in `tests/e2e/`, with `server.sh` (fresh test server) and `run.sh`. They're what CI runs, and the acceptance tests for a rebuild (DESIGN.md §19).

## 5. Build and deployment pipeline

```
 push / PR ─► CI: install ─► guide + design checks ─► web build ─► docker build ─► e2e (compose + Playwright, mocks)
                                                                                   │ pass
 merge to main ───────────────────────────────────────────────────────────────────►│ push image ghcr.io/mdburlace/raceops:sha-<sha>, :edge
                                                                                   ▼
                                                 STAGING redeploys :edge ─► smoke test ─► UAT / sign-off
                                                                                   │
 tag v1.6.0 ─► CI retags the SAME digest :1.6.0 and :1.6 (no rebuild) ─────────────┤
                                                                                   ▼
                     PRODUCTION: backup DB ─► set image tag 1.6.0 ─► redeploy ─► smoke test ─► watch logs
```

### 5.1 Registry and image tags

Use **GitHub Container Registry** (private): `ghcr.io/mdburlace/raceops`.

| Tag | Meaning | Used by |
|---|---|---|
| `sha-<7>` | every successful `main` build (immutable) | traceability, rollback |
| `edge` | latest successful `main` | staging |
| `1.6.0` | a release (immutable) | production |
| `1.6` | latest patch of 1.6 | optional |

Promotion re-tags an existing digest. It never rebuilds, so production runs exactly the bytes that passed CI and staging.

### 5.2 CI workflow (GitHub Actions)

`.github/workflows/ci.yml` (outline):

```yaml
name: ci
on: { push: { branches: [main], tags: ['v*'] }, pull_request: {} }
jobs:
  build-test:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_HOST_AUTH_METHOD: trust }
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: cd server && npm ci && npm audit --omit=dev --audit-level=high
      - run: cd web && npm ci && npm run build          # runs check-guide and check-design first
      - run: docker build -t raceops:ci --build-arg GIT_SHA=${{ github.sha }} .
      - name: e2e
        run: |   # server.sh recreates the test DB and starts the server with mock AI/weather and file email
          pip install -r tests/e2e/requirements.txt && python3 -m playwright install --with-deps chromium
          PGADMIN_URL=postgresql://postgres@localhost:5432/postgres tests/e2e/run.sh
      - if: failure()
        uses: actions/upload-artifact@v4
        with: { name: e2e-output, path: tests/e2e/out }
      - if: github.ref == 'refs/heads/main' && success()
        name: push image
        run: |
          echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker tag raceops:ci ghcr.io/mdburlace/raceops:sha-${GITHUB_SHA::7}
          docker tag raceops:ci ghcr.io/mdburlace/raceops:edge
          docker push --all-tags ghcr.io/mdburlace/raceops
  release:
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions: { packages: write }
    steps:
      - run: |   # retag the digest built for this commit; fails if CI never built it
          V=${GITHUB_REF_NAME#v}
          docker buildx imagetools create -t ghcr.io/mdburlace/raceops:$V -t ghcr.io/mdburlace/raceops:${V%.*} \
            ghcr.io/mdburlace/raceops:sha-${GITHUB_SHA::7}
```


### 5.3 Deploying to staging and production (pull-based GitOps)

GitHub's runners can't reach a Docker host on a home network, and opening Portainer to the internet isn't wise. So deployments are **pulled** by Portainer rather than pushed by CI.

1. Change `docker-compose.yml` so the image comes from the environment, and keep `build:` only for local use:
   ```yaml
   app:
     image: ${RACEOPS_IMAGE:-raceops:latest}
   ```
2. Add a small deploy folder:
   ```
   deploy/
     staging.env      RACEOPS_IMAGE=ghcr.io/mdburlace/raceops:edge
     production.env   RACEOPS_IMAGE=ghcr.io/mdburlace/raceops:1.6.0
   ```
   Secrets stay in each Portainer stack's own environment, never in these files.
3. Each Portainer stack is a **Git repository stack** with automatic updates (polling, or a webhook reached over Tailscale or a Cloudflare tunnel). Give Portainer a read-only token for GHCR. Check that your Portainer edition supports GitOps updates for stacks; otherwise use a small self-hosted GitHub runner on the LAN that calls Portainer's API.
   - **Staging** follows `edge` and pulls a new image on every merge (enable "re-pull image").
   - **Production** changes only when `deploy/production.env` changes. **Promotion is a one-line pull request** (`1.5.2` → `1.6.0`) that you approve and merge. That gives an audit trail of who deployed what, when.

A simpler first step that needs no GitOps: keep deploying by hand in Portainer, but set `RACEOPS_IMAGE` to a version tag in the stack environment and press **Update the stack → Re-pull image**. Even this removes building on the production host.

### 5.4 Production release checklist

1. Staging runs the release candidate and has been signed off. Sign-off covers the release's features, login, sync on an installed phone, offline edit then reconnect, and the e2e run is green.
2. The training pack is current: the guide check passes (it requires `reviewed:` in `docs/guide/training.md` to match the newest What's new entry), the training videos were re-recorded if their screens changed, and the e2e suite for the practice team is green. On staging, reset a practice team and run the exercises for the roles the release touches.
3. Confirm the release's `CHANGELOG.md` manual steps, such as new environment variables added to the production stack **before** deploying.
4. Take a database dump: `pg_dump -Fc` → `pre-1.6.0.dump`, copied off the host.
5. Announce if needed: **Platform admin → Settings → announcement banner** (e.g. "Update tonight 9pm, about 2 minutes").
6. Update the production image tag and redeploy. Migrations and form upgrades run on start. Watch the logs for `Applying migration` and `RaceOps listening`.
7. Smoke test:
   - `/api/health`;
   - sign in;
   - **System & activity** shows the new version and migrations;
   - open a team, check sync, open the guide.
8. Watch for errors for the first hour. Keep the previous tag noted for rollback.

Pick deploy windows away from race nights (Friday and Saturday evenings), when teams are offline at the track and will sync later.

### 5.5 Rollback

| Situation | Action |
|---|---|
| App bug, no migration in the release (or only additive ones) | Set the image tag back to the previous version and redeploy. Takes minutes. |
| A migration the old version can't run against | Stop the app, restore `pre-<version>.dump`, deploy the previous tag. Changes made since the deploy are lost on the server but still held on devices that made them offline. Tell teams to open the app so it re-syncs. |
| Bad data from a feature | Fix forward with a patch release. `record_history` holds every previous version of every record. |

## 6. Database migration rules

Migrations run automatically, are forward-only and are applied in file-name order. To keep rollback cheap:

1. **Expand, then contract.** Release N adds new columns, tables or keys and writes both old and new. Release N+1 (or later) removes the old ones. The previous image must still run against the new schema.
2. **Never rename or drop in the same release that starts using the replacement.**
3. **Data changes must be idempotent** (`WHERE NOT …`, `IF NOT EXISTS`), like the existing permission backfills.
4. **Record JSON is a contract with offline devices.** Add keys and don't rename them. Upgrades of shipped forms go through `FORM_UPGRADES`/`PHASE3_UPGRADES` so they apply once and keep teams' edits.
5. **Rehearse on staging** with a fresh production copy and time it. Anything over a few seconds on production-sized data needs a plan, such as batching or a maintenance window.
6. A migration file is never edited after it has reached production. Fix forward with a new file.

## 7. Client compatibility (PWA)

- The service worker updates the app on next open. Until then a device runs the old app against the new server.
- The server must accept the previous app's sync payloads and API calls for at least `JWT_TTL` (60 days).
- **Recommended addition:**
  - the web app sends `X-RaceOps-Version` with each request;
  - `/api/me` returns `min_client_version`;
  - a device below it shows "A new version is ready — tap to update" before syncing.

  This lets a release that must change the contract refuse old clients politely instead of failing silently.

## 8. Feature roll-out to some teams first

The licence system already supports per-team feature overrides (`tenants.features`). Use it for staged feature roll-out inside production:

- Ship a risky module behind a feature key, such as `beta_calendar_feeds`, that no plan includes.
- Turn it on for one or two pilot teams in **Platform admin → Teams & licences**. Widen it, then add it to plans and remove the flag.
- This gives a canary for **features** without running two versions of the app, which the single-instance design doesn't allow (DESIGN.md §14).

## 9. Monitoring and backups per environment

| | Staging | Production |
|---|---|---|
| Uptime check (Uptime Kuma or similar) on `/api/health` | yes | yes, with alert to phone/email |
| Container restart alert | optional | yes |
| Nightly `pg_dump` + uploads backup, copied off the host | weekly | daily (DESIGN.md §19.2) |
| Restore test | is the restore test: staging refresh = restore of production backup | quarterly |
| Log retention | 7 days | 30 days (Docker `json-file` with `max-size`/`max-file`, or ship to Loki) |
| Backup-failed alert | — | yes |

Using the production backup to refresh staging tests the backups every time staging is refreshed.

## 10. Should production stay on Docker?

### Short answer

**Yes. Keep Docker containers, run by Docker Compose through Portainer, for production.** Harden how images are built and deployed (sections 5–6) and how data is protected (section 9). Don't move to Kubernetes or a different architecture now. Revisit when one of the triggers in 10.3 happens.

### 10.1 Why

- **The app is built for one instance.** Sign-in lockouts, background jobs, the settings cache and the feed timer live in memory (DESIGN.md §14). An orchestrator's main benefit, running several copies for availability and scale, isn't available without first changing the app. Kubernetes would add a lot of moving parts for the same single container.
- **The load is small and spiky.** A few dozen teams, mostly reading local data on their phones, syncing small JSON batches. One modest VM (2 vCPU, 4 GB RAM) has large headroom. AI calls wait on Anthropic, not on local CPU.
- **Offline-first lowers the cost of downtime.** If the server is down for a few minutes during a deploy, apps keep working and sync later. Zero-downtime deploys aren't worth much complexity yet.
- **Containers are already the right unit.** The same image runs in CI, staging and production. Compose describes the whole stack in one file, and Portainer gives you a UI, logs and GitOps. That's enough for one operator.
- **Portability is kept.** If you later move to a managed platform, the same image goes with you.

### 10.2 Options considered

| Option | Fit now | Notes |
|---|---|---|
| **Docker Compose + Portainer (current, hardened)** | ✅ Recommended | Lowest operating effort; matches the single-instance design; GitOps from Git. |
| Docker Swarm | ➖ | Rolling updates and secrets, but still one replica because of in-memory state. Little gain. |
| Kubernetes (k3s, managed AKS/EKS/GKE) | ❌ Not now | Health-based rollouts, autoscaling and many nodes, none of which help a single-replica app. High learning and upkeep cost for one operator. |
| PaaS (Fly.io, Render, Railway) + managed Postgres + object storage | ➖ Later | Good once there are paying customers who expect an SLA: managed backups, point-in-time recovery, TLS, no home-network dependency. Needs attachments moved to S3-compatible storage first. |
| Plain Node on a VM with systemd | ❌ | Loses image-based promotion and parity between environments. No benefit over containers. |

### 10.3 Where production runs, and when to change

The bigger production question is **where** the host is, not Docker versus something else:

- **Home lab (now):** fine for your own team and a few friendly teams, provided backups are copied offsite and you accept that power, internet or hardware faults at home take it down.
- **A cloud VM in an Australian region** (same Docker Compose stack, managed backups/snapshots), or managed Postgres plus a small VM: move when other teams rely on it for their race weekends. Their tolerance for downtime drops, and your home internet and power become a single point of failure for other people's businesses. The deployment approach in this document doesn't change; only the host does.

Change architecture when any of these happen:

1. You need **no downtime during deploys**, or availability above what one host can give.
2. Load needs **more than one app instance** (sustained CPU above 60%, or sync latency growing).
3. **Customers or contracts** require an SLA, data residency or audited backups (point-in-time recovery).
4. Running the box yourself takes more time than the product does.

When that time comes, the steps in order are:

1. **Make the app stateless:**
   - sign-in lockouts and background jobs into Postgres tables (or Redis);
   - settings reload across instances through Postgres `LISTEN/NOTIFY`;
   - the feed timer run by one instance only, using a Postgres advisory lock;
   - attachments to S3-compatible storage.
2. **Move Postgres to a managed service** with point-in-time recovery.
3. **Run two or more app containers** behind the proxy, on a PaaS or Swarm. Kubernetes only if there are many services by then.

## 11. Implementation roadmap

| Step | What | Effort | Benefit |
|---|---|---|---|
| 1 | ~~Put the e2e suites in version control~~ (done: `tests/e2e/`); add `CHANGELOG.md`; start version tags and bump versions | small | Tests are safe and runnable by CI; you know what's deployed |
| 2 | GitHub Actions CI: checks, build, e2e, push to GHCR (`sha-…`, `edge`) | medium | Every change is tested the same way; images are built once |
| 3 | `image: ${RACEOPS_IMAGE}` in compose; production pinned to a version tag; manual re-pull in Portainer | small | No more building on production; one-click rollback |
| 4 | Automated nightly backups (database + uploads) to NAS and offsite, with an alert on failure | small | Recoverable from host loss |
| 5 | Staging stack: separate VM, hostname, Mailpit, staging AI workspace, anonymised data refresh script | medium | Real-world rehearsal before production; tested restores |
| 6 | GitOps: `deploy/*.env`, Portainer Git stacks with auto-update; production promotion by pull request | small–medium | Audited, repeatable deployments |
| 7 | Client version handshake (`min_client_version`) and `GIT_SHA` on the System page | small | Safe contract changes; exact traceability |
| 8 | Feature flags for pilot teams on risky modules | small | Staged feature roll-out inside production |
| 9 | (When triggers in 10.3 occur) stateless app → managed Postgres → multiple instances | large | High availability and scale |
