# End-to-end tests

Browser tests for RaceOps, written in Python with Playwright (Chromium). Each suite drives the real app
against a real server and database, with the AI and weather providers mocked and emails written to files.

They are the acceptance tests for the whole product, including for a rebuild (see `docs/design/DESIGN.md` §19),
so **add one per feature** and keep them passing.

## Set up once

```bash
pip install -r tests/e2e/requirements.txt
python3 -m playwright install --with-deps chromium
cd web && npm ci && npm run build && cd ..        # the test server serves the built app
cd server && npm ci && cd ..
```

You also need a Postgres 16 server you can create databases on (a local install or
`docker run -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine`).

## Run

```bash
tests/e2e/run.sh                 # fresh database + server, then every suite in order
tests/e2e/run.sh --no-reset      # every suite, against a server you've just reset with server.sh
tests/e2e/run.sh e2e29           # one suite (after a full run, so its earlier data exists)
tests/e2e/server.sh              # just reset the database and start the test server
```

Settings are environment variables (defaults in brackets):

| Variable | Default | Meaning |
|---|---|---|
| `PGADMIN_URL` | `postgresql://postgres@localhost:5432/postgres` | superuser connection used to drop and create the test database |
| `TEST_DB` | `raceops_test` | test database name |
| `DB_PASSWORD` | `raceops` | password for the `raceops` database user |
| `PGHOSTPORT` | `localhost:5432` | where the server connects to Postgres |
| `RACEOPS_URL` | `http://localhost:8080` | where the test server listens; the suites use it too |
| `MAIL_OUTBOX` | `/var/tmp/outbox` | where test emails are written (read by e2e28/e2e29) |

Output goes to `tests/e2e/out/` (ignored by Git): a log per suite, screenshots per suite, and the server log.

## How the suites work

- **They run in order and build on each other.** `server.sh` creates the first user,
  `owner@test.com` / `password1` with the team **Burlace Racing**. Each suite adds teams, people and records
  that later suites use. A full run always starts from an empty database.
- Each suite takes one argument, its screenshot folder, and prints a last line containing `OK` when it passes.
  `run.sh` stops at the first suite that doesn't.
- The test server runs with `AI_PROVIDER=mock`, `WEATHER_PROVIDER=mock`, `CALENDAR_FETCH_PRIVATE=1`
  (so calendar import can read the server's own iCal feed), `CALENDAR_FEED_HOURS=0`, `GITHUB_PROVIDER=mock` (fake GitHub issues), `MAIL_TRANSPORT=file`,
  and `APP_URL` equal to `RACEOPS_URL`.
- Files the suites upload are in `fixtures/` (a dyno spreadsheet, a CSV sheet, a tiny PDF and PNG for the mocked
  AI, and part of the Australian/NZ track list for the directory re-import test).

## What each suite covers

| Suite | Covers |
|---|---|
| `e2e` | First run, cars, assets, setups, maintenance, forms; offline change then sync; mobile and tablet; accepting an invite (Mechanic) |
| `e2e2` | Gears and tyres, setup with gear and Crew Chief, shock and bar dyno, engine build, between-round checks, reviews and reports, role access, licensing (Trackside plan) |
| `e2e3` | Car gear list and ring & pinion, gear chart and calculator, pasted gear list, adjustable shock sweeps |
| `e2e4` | Tracks and classes, contacts and roles, series, read-only shared records, directory re-import, mobile |
| `e2e5` | Profile, tracks, setup feedback, copying from the previous session, baselines, search |
| `e2e6` | Platform admin: plans and seats, teams and owner invites, licence overrides and expiry, suspension, users, pick-lists, settings and announcement, directory and system |
| `e2e7` | Events with a directory track, one car per event, sessions, choosing the sheet to copy, session order |
| `e2e8` | Sign-in lockouts by account and by address, password change attempts |
| `e2e9` | AI (mocked): plans, fill from photo, voice debrief, dyno PDF, Ask RaceOps, usage and allowances, AI by role |
| `e2e10` | Setup advisor: problems from feedback tags, AI talk-through, tuning guides and PDF import, mobile |
| `e2e11` | Server validation, collapsible sidebar sections, themes |
| `e2e12` | Track weather, units, field descriptions (ⓘ) and the team's own descriptions, mobile tooltips |
| `e2e13` | Calculators page, corner weights, calculators beside fields, engine clearances and checks |
| `e2e14` | Sticky headers and scrolling on setup sheets and calculators |
| `e2e15` | Engine shop: creation, menus and home, shop settings, customers, engines, jobs, build sheets, printouts |
| `e2e16` | Engine sharing: public link, plan cap, team links, laps flowing back, lifecycle, change of owner |
| `e2e17` | Spreadsheet into a dyno table, AI fill from CSV, shocks by corner and car, adjusters by shock type, bump rubbers, fuel planner |
| `e2e18` | Help & guide: Home checklist, guide home and search, **?** links, printable guide, role guides, engine shop guide, mobile |
| `e2e19` | Setup sheet layout: copy from a session, changes only, before/after, folding, arrange sections, mobile |
| `e2e20` | One class list: car class picks, classes offered on Tracks |
| `e2e21` | Our tracks: empty start, added by racing, linking from the directory, home track, hiding, our-classes filter |
| `e2e22` | Analytics: performance, setups, engines and parts, mobile |
| `e2e23` | Shock dyno at several test speeds, fuel in US gallons or litres |
| `e2e24` | Torsion bar rate baselines and tests from the asset |
| `e2e25` | Calendars: shared dates, series entries, suggest, import (text and iCal), what happened, admin review, print and publish |
| `e2e26` | Initial dyno measurement (bars and shocks), calendar quick edit, series, sanctioning body, major event names |
| `e2e27` | Requests to the shared calendars: send series, tracks and dates, change requests, moderation, single source of truth, outcome |
| `e2e28` | Officials, follow and updates (with email), questions, results, clashes, merge, history and restore, feeds, public pages |
| `e2e29` | Series entries: choosing rounds for a partial series |
| `e2e30` | Feedback & roadmap: bug reports with pictures, requests, similar items and votes, admin review (edit, areas, questions, approve, duplicate, decline), send to Claude (mock GitHub issue and brief), done, emails |
| `e2e31` | Setup sheet inventory: bars, tyres and wheels by corner and car, manual entry and Save to inventory, top and front wings, front wicker, wing positions in Assets |
| `e2e32` | Event lists show round and track first (Events, At the Track, Calendar, track page); calendar date form has Save and Cancel at the top |

When you add a suite, name it `e2eNN.py` with the next number, add a row here, and make it print `… OK` as its last line.
