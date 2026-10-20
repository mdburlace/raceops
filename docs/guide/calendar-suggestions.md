---
id: calendar-suggestions
title: Shared calendars (platform admin)
section: admin
order: 25
summary: Keep the series, track and major-event calendars up to date for every team — add, edit and delete dates and series, import published calendars, and moderate teams' requests.
for: platform
pages: /admin/calendar
covers: option:calendar-suggestions
related: calendar, platform-admin
---
The shared calendars hold every series, track and major-event date that teams pull into their own calendars. As a platform admin you keep them right. Open **Platform admin → Shared calendars**.

Use **‹** and **›** to change the year. Anything you save here goes live for every team straight away.

![Major events on the shared calendars](img/calendar-admin.webp)

## Calendars

Choose a view:

- **Series**: every shared series for the year, including new ones with no dates yet. Tap one to see and manage its rounds. **Edit series** changes its name, season, class, sanctioning body or other details.
- **Tracks**: every track with dates this year. Tap one for its dates.
- **Major events**: titles, championships and classics, such as the Australian Sprintcar Title.
- **All dates**: everything for the year.

### Add or change dates

- **Add a date**: fill in the event name, date (and end date for a multi-day meeting), track, series and round, and the classes running. Tick **Major event** for a title or classic and give it its **Major event name**, and set the **Sanctioning body** if it differs from the series'. Adding from a series, track or the Major events view fills that in for you.
- **Edit**: change a date. The form opens under that date. Every team's entry that came from it changes too.
- **Delete**: removes the date from the shared calendar. Teams that already added it keep their own entry. To keep it visible but show it's off, edit it and set **Status** to **Cancelled** instead.
- **New series** (in the Series view): adds a series every team can use. Name and season are required.
- **Import a calendar**: read the dates from a link, iCal feed, PDF, photo, screenshot or pasted text, check them, then save. The AI reading counts against the team you're signed in to, so that team needs the AI add-on (iCal doesn't).

## Requests

Teams send their own series, tracks, dates and major events, and ask for changes to shared ones. The **Requests** tab shows how many are waiting. So does the number beside **Shared calendars** in the sidebar, and a note on Home.

![A requested change, with the new values beside the current ones](img/calendar-suggestions.webp)

Each request shows the team and person who sent it, when, and any note. Before you decide, every request is checked against the shared calendars:

- **⚠ Same as / Looks like**: a series or track with the same or a similar name (and season, for series) is already shared.
- **⚠ Already listed**: a date at the same track on the same day (or the same series round on the same day) is already shared.
- **⛔ Clash**: the same series round is already listed on another date, or the same track has a different meeting that day.

### Deciding

- **The series or track**: choose **Add as a new shared series/track**, or **Use the shared … instead** to merge it into one that's already there. An exact match is picked for you.
- **Each date**: choose **Add**, **Link to** an existing date it duplicates (picked for you), or **Refuse** with a reason the team will see.
- **A change**: the requested values are shown beside the current ones, with the differences highlighted.

Press **Approve** (or **Approve the rest** when you've refused some dates). To turn the whole request down, type a **Note to the team** and press **Reject all**.

### What approving does

- **Shared records become the single source of truth.** The series, track and dates are added (or matched to existing ones).
- **The team is relinked.** Its own copies of the series and track are retired. Its events, series entries, track links and contacts point at the shared records. Private notes from its copies become the team's own notes on the shared record.
- **Loose dates are tidied.** Shared dates that only had the track's name are linked to the newly shared track.
- **Teams follow changes.** When a shared date changes, through a change request or your own edit, every team's entry from that date follows it. Their car, plan, result and notes are kept.
- **The team is told.** It sees the outcome under **Calendar → Requests**, with every refused date and its reason.

**All** shows past requests and who decided them.

## From a team's calendar

You can also manage shared dates from **Team Management → Calendar → Shared calendars** in any team you belong to. There, **Add a date**, **Edit** and **Import a calendar** publish straight away. Untick **Publish to every team now** to save one as a suggestion instead.
