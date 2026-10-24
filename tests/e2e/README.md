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
| `e2e32` | Event lists show round and track first (Events, At the Track, Calendar, track page); Save and Cancel at the top of the calendar date form, the Our calendar quick edit and the event form |
| `e2e33` | API responses not cached (`Cache-Control: no-store`), the clear-cache endpoint, **Can’t sync** badge when sync fails but the server answers, Repair this device (unreachable server changes nothing; repair keeps the sign-in and syncs again) |
| `e2e34` | Training pack: practice team created from Teams & licences (demo data, banner), the crew chief exercise on the demo data, no calendar requests from practice teams, reset (and only for practice teams), the Training guide section, videos and printed cards |
| `e2e35` | Files on feedback and ideas: allowed types and sizes, picked files, added later and removed, safe serving (type from the name, inline or download), the limit of 5, admin files the sender can't remove, files on ideas, attachments in the brief |
| `e2e36` | Backups: destinations (server folder, S3 with wrong keys, Google Drive and Dropbox via the mock sign-in), full backup now and download, team backups (platform storage and the team's own), team schedule, team restore with devices downloading the team again, restore from a file, a deleted team brought back from a full backup, scheduled backups with pruning, full restore of everything. Needs `psql` and `node` (it runs the schedule check directly) |
| `e2e37` | Team data export (JSON with files, XML, CSV from the page) and Recently deleted: a member recovers their own (not others'), a team manager anything in the team, a platform admin from the admin page; the team's request for a longer time approved; platform default; removal for good past the team's time (runs the clean-up directly) |
| `e2e38` | Workshop setup sheets: rights (mechanic yes, driver no), the Workshop setups list, a new one copied from the car's latest, linked to an event, the event form only offering the car's, a track sheet started from the event's workshop setup (front/rear merged into four corners, shop-only fields left behind), and the start chooser's Workshop setup option |
| `e2e39` | Engine tunes and workshop engine checks: rights (mechanic does checks and edits tunes, driver reads tunes only), versions and **Make active**, a new version copied from the newest and made active, the tune printout, the pill settings for the setup sheet's ADR (gaps and off-chart readings) and **Use this jetting**, the tune on a workshop setup, engine checks flagged against the tune and the last check, a new check flagged as you type, the blank check printout, and an engine shop's shared tune (private ones hidden) copied by the linked team as its active tune |
| `e2e40` | Multi-day events: one event with a row per day (gaps, names, start times, rained out), the server keeping days and dates in step (older ranges, an older app moving only the dates, messy days numbered, multi-day switched off), day tabs and sheets by day, the setup sheet's **Day** pick, a day with sheets can't be removed or switched off, the list and month view (only the days it runs, rained out crossed out), quick edit of consecutive days, a shared date's days going to the team's entry and following changes, per-day iCal entries (shared and published), the public page, and the days editor on a phone |
| `e2e41` | Release notes: every release from `docs/releases` (newest in full, earlier ones listed, opened and stepped through, sections left out when empty), the version in the sidebar and on Help, the one-off updated note on Home, the **Code repository** setting (GitHub only, tidied) and the code and pull request links it adds, no links without it, and the page on a phone |
| `e2e42` | Team roles and the Business area: the new built-in roles and **Add standard roles**, more than one role per member (never Owner as an extra), part rights enforced by the server (driver's debrief, car chief's change list), costs hidden and kept for roles without money rights, parts order approval, reminders, the crew list and race-night card, the event page, finance (budget warning, event P&L, Xero export), a load list from the event and a template, hospitality check-in and sponsor deliverables, the sponsor portal (no amounts), a results post drafted and approved (and with mock AI), and region & currency (licence classes) |
| `e2e43` | Multi-day events: what happened on each day (outcome, withdraw reason, result, notes), the overall result worked out from the days and following them, a hand-picked overall result that stays, the days' results in chips and the Events day lines, a viewer's read-only day result, and the published calendar showing day results only with **Show results** (never reasons or notes) |
| `e2e44` | Events in more than one series, round prefixes and locked setup sheets: the platform admin's **Edit series** adding shared dates (main series or **Also counts towards**, prefix and round) and **Take out**, the team's entry following (and keeping its own series), **Add events to this series** on a team series, a chip per series on the event, prefixes instead of *Rd* in lists, and locking a setup sheet (read-only, no delete, server refusing edits and deletes but not the running order, unlock only with **Unlock locked setup sheets**, a driver's lock dropped) |
| `e2e45` | Setup sheet changes and the quick add screen: Block height (was Blocked) and Turns, rake, tilt, RR radius rod, Jacobs ladder, birdcage angles and the three rpm readings on every team's form (and the workshop setup's, with block heights → Block height and turns → Turns), the quick add screen from a long press and right-click (keypad, sixteenths, common values, keyboard, Cancel), Pick for wing angle, the angle finder (tilt sensor, Zero, Flip, Reset zero, zero kept between boxes), values saved to the server, a phone, and none on a viewer's read-only sheet |
| `e2e46` | Quick add extras and photos: Turns − and + by half a turn, **Last session** and **Say it** (speech, faked) on the quick add screen; the team photo added by the owner (shrunk to 800 px, in the sidebar, kept when team settings are saved, not moveable by a device), changed by the Marketing Manager, refused for a mechanic and non-photos; member photos added from Team → Members and Profile, seen by teammates but not outsiders, an owner's protected, removed; Profile on a phone |
| `e2e47` | Full team budget and a fuller sponsor record: new expense categories, income kinds, budget and sponsor fields and deliverable columns on every team's forms; the budget in groups, the contingency reserve (Crash & failure repairs and ticked expenses, in Reminders when low) and the income budget; the sponsor's billing contact, links, industry, renewal outlook, activation and exclusivity, the interaction log added from the sponsor page (follow-up on the sponsor, in the pipeline and Reminders), the exclusivity clash (and none once a deal ends), promise status with proof (Deployed = done, off Reminders) on the page, season report and sponsor page; phones |
| `e2e48` | Training videos: the **Training videos** page lists every video with its poster, linked from the training start page; a narrated video has VP9 picture, Opus sound and a WebVTT captions file, an English captions track that's off until CC and shows the words being said when on; a role's exercises still open with their video |

When you add a suite, name it `e2eNN.py` with the next number, add a row here, and make it print `… OK` as its last line.
