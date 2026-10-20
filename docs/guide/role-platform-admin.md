---
id: role-platform-admin
title: Platform admin
section: roles
order: 70
persona: platform-admin
summary: Run the server — create teams, allocate licences, support users, and keep the shared data current.
for: platform
covers: option:platform-admin-role
related: platform-admin, ai-assistant, calendar-suggestions
---
You look after RaceOps for every team on your server.

## Setting up a new team

1. **Platform admin → Teams & licences → create a team.** Pick its type (race team, engine shop or both), plan, seats and licence end date.
2. Tick **owner invite link** to hand it to someone else, or join it yourself.
3. Send the owner the link, and point them to [Set up a new team](/help/getting-started).

## Day to day

- **Overview.** Teams needing attention: expired, suspended, ending within 30 days, or out of seats.
- **Users.** Reset a forgotten password (gives a one-time temporary password), or disable an account that shouldn't sign in.
- **Support a team.** **Join & open** from Teams & licences.
- **Announcements.** Planned downtime or new features. Use the banner under **Settings**.
- **Shared data.** Track directory, pick-lists and shared tuning guides.
- **Shared calendars.** Keep the series, track and major-event dates current, and moderate teams' requests. The sidebar and Home show how many are waiting. See [Shared calendars](/help/calendar-suggestions).
- **AI.** Watch spend per team, and change allowances.

See [Platform admin](/help/platform-admin) for every page.

## Keep the server healthy

- Back up both volumes: the database and uploads.
- Keep secrets (API keys) in the Portainer stack's environment, never in files.
- **System & activity** shows the version, migrations and the admin audit log.
