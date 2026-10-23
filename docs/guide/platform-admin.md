---
id: platform-admin
title: Platform admin
section: admin
order: 10
summary: Teams and licences, plans, users, the track directory, pick-lists, AI and server settings.
for: platform
pages: /admin, /admin/teams, /admin/plans, /admin/users, /admin/directory, /admin/lists, /admin/settings, /admin/system, /admin/ai
covers: setting:app_name, setting:defaults, setting:announcement, setting:licences, setting:plans, setting:pick_lists, setting:directory, feature:track, feature:workshop, feature:engines, feature:team
related: role-platform-admin, ai-assistant, team-type, calendar-suggestions
---
Platform admins run the RaceOps server for every team. The first account created is a platform admin, and it can make others admins. The **Platform admin** area is in the sidebar, on Home, and under **Admin** on phones.

| Page | What it's for |
|---|---|
| **Overview** | Teams by licence status, users, seats in use, licences per plan, teams needing attention, and recent admin activity. |
| **Teams & licences** | Create a team, optionally with an owner invite link for someone else. Tick **Practice team** to load it with demo data for [training](/help/training). Per team: name, team type, plan, status (Active / Trial / Suspended), seats, licence end date, notes and feature overrides. **Join & open** a team to support it. Delete a team (you type its name to confirm). |
| **Plans & allocation** | What each plan includes, seats per team, licences to allocate, a price note, and the **Shared engines** limit for engine shops. Add plans, remove unused ones, or restore a built-in plan. |
| **Users** | Every account, its teams and last sign-in. Edit name or email, **reset password** (shows a one-time temporary password), make admins, **disable** an account, and remove someone from a team. |
| **Tracks & directory** | Track counts and gaps, shared contacts and suppliers. Import tracks, export all as JSON, or re-apply the bundled list. |
| **Shared calendars** | The series, track and major-event calendars every team uses. Add, edit and delete dates and series, import published calendars, moderate teams' requests, appoint officials, add official feeds, merge duplicates and restore old versions. See [Shared calendars](/help/calendar-suggestions). |
| **Pick-lists** | Track conditions, car behaviour, contact roles, supplier categories, sanctioning bodies (for series, events and calendar dates) and race classes (also the list a car’s Class picks from). Add, remove, reorder, paste, or restore the default. |
| **AI assistant** | Turn AI on, choose the models, set the monthly allowance per team and the token prices, test the connection, and see spend per team. |
| **Feedback & ideas** | Problem reports and requests from users, and your own ideas. Review them into **Now**, **Next** or **Later**, publish the roadmap, and send work to Claude. See [Feedback and ideas](/help/feedback-admin). |
| **Settings** | App name, support email, invite link lifetime, the **Code repository** the [release notes](/help/release-notes) link to, default plan and seats for new teams, and an **announcement banner** with an optional end date. **Email notifications** shows whether email is set up, with **Send me a test email**. |
| **Backups** | Full backups of the whole server and the schedule for team backups, destinations (server folder, S3-compatible storage, Google Drive, Dropbox, OneDrive), and restoring everything or one team. See [Backups and restore](/help/backups-platform). |
| **Recently deleted** | Recover anything deleted in any team or the shared directory, and set how long deleted items are kept (for every team, or per team). See [Recently deleted](/help/recently-deleted). |
| **System & activity** | Version, uptime, database and uploads, migrations, record counts, re-check base forms, and the full admin audit log. |

## Plans and features

{{plans}}

Tick or untick single features per team under Teams & licences. AI is an add-on feature.

## How licences work

- **Seats.** Members plus pending invites can't exceed the team's seats. Blank means the plan's default; blank on the plan means unlimited.
- **Licence end date.** After it, the team can sign in and read everything, but changes are refused, and a red read-only banner shows.
- **Suspended.** Members can't open the team at all; platform admins still can.
- Changes reach devices at their next sync, or within 10 minutes while the app is open.

## Server settings

API keys and other secrets go in the server's environment (the Portainer stack), never in the app: `ANTHROPIC_API_KEY` for AI and `OPEN_METEO_API_KEY` for commercial weather use. See the README for every variable.
