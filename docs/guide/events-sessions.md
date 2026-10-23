---
id: events-sessions
title: Events and sessions
section: track
order: 10
summary: Create a race meeting, add its sessions in running order, and run multi-day events and series.
for: module:events
team: race
pages: /track, /events, /events/:id, /series, /series/:id, /r/event/*, /r/series/*
covers: type:event, type:series, module:events, feature:track
related: calendar, setup-sheets, tracks, compare-search
---
An **event** is one race meeting for one car. Each **session** (Hot Laps, Heat 1, Feature…) gets its own setup sheet. Events are also the entries on your [Calendar](/help/calendar), where you can add them straight from the series and track calendars.

![An event with its sessions in running order](img/event-sessions.webp)

## Create an event

1. Go to **At the Track → Events** and press **New event**. You can also use **New event here** on a track.
2. Pick the **Track** from the directory; your own tracks are listed first. Location, length, surface and banking fill in from it, and you can still change them.
3. Pick the **Car**. If the team has only one active car, it's chosen for you.
4. Set the **Date**. For a meeting over more than one day, tick **Runs over more than one day** instead and set each day (see below).
5. If it's a round of a championship, pick the **Series** and type the **Round**.
6. If the car was set up in the shop for this meeting, pick its **Workshop setup**. The track sheets can then start from it (see [Workshop setup sheets](/help/workshop-setups)).
7. Press **Save** at the top of the form. **Save** and **Cancel** stay in view as you scroll.

**Events** lists upcoming and past meetings. Each shows its round and track first, e.g. *Rd 3 · Valley Speedway*, then the series and the car. Lists elsewhere, such as **At the Track**, **Calendar**, each series and each track, show events the same way.

## Add sessions

On the event, press **+ Add session**. The next unused standard session is suggested (Hot Laps, Qualifying, Heat 1, Heat 2, Dash, B-Main, Feature, Practice). Choose **Other** to type any name, e.g. *Last chance*. Each session opens a new [setup sheet](/help/setup-sheets).

Sessions are listed in their usual running order. **Reorder** moves them with ▲ ▼ to match how the night actually ran.

- **Compare sessions** puts the event's sheets side by side. See [Compare and search setups](/help/compare-search).

## Crew, logistics and money for the event

Under the sessions, the event page shows everything else about the meeting from the modules your role can see: the **Crew** list, trip plans, load lists, parts orders, expenses, income, the event's **Profit & loss**, hospitality guests, photos and results posts. **+ Add** starts a record already linked to the event. See [Business, reminders and race night](/help/business).

## Multi-day events

A meeting over more than one day is still **one event**: one entry on the calendar, one set of details, and one place for all its setup sheets. Each day has its own row, so the days don't have to run one after another. A practice night on Thursday and race day on Saturday leaves Friday free.

1. On the event, press **Edit event**.
2. Tick **Runs over more than one day**. Two days appear, starting on the event's date.
3. Set the **Number of days**, or press **+ Add a day**. Each new day starts the day after the last one.
4. For each day, set its **date**. You can also give it a **name** (e.g. *Practice*, *Night 1*, *Finals*) and a **start time**.
5. If a day doesn't run, set it to **Rained out** or **Cancelled**. It stays on the event, crossed out.
6. Press **Save**.

![A two-night meeting with a night off between: each day with its name and start time](img/event-days.webp)

The event's date and end date are set from the days. Days are listed by date, whatever order you add them in.

**On the event,** each day gets its own tab, named after the day (or *Day 1*, *Day 2*…) with its date. While the meeting is on, it opens on today's day. A sheet you add goes on the tab you're on. On a setup sheet, **Day** lists the event's days, so you can move a sheet to another day.

**What happened each day, and overall.** On the event, each day's tab has **what happened** for that day:

1. Open the event and press the day's tab.
2. Pick what happened: **Raced the feature**, **Did not make the feature**, **Withdrew** (then the reason) or **Did not race**.
3. Type the **result** in a few words, e.g. *Prelim feature 5th*, and any **notes** for the day.

It saves as you go. The days' results show as a row of chips under **Plan & result** — tap one to open that day.

The meeting's overall result under **Plan & result** is worked out from the days until you pick one yourself: it's **Raced the feature** if you raced a feature on any day; otherwise **Withdrew during the event** (with that day's reason) if you withdrew on any day; otherwise **Did not make the feature**. Every day **Did not race** makes it **Did not attend**, and every day rained out or cancelled makes it **Event cancelled**. Pick a different overall result and it stays as you set it. The year's totals on the Calendar count each meeting once, by its overall result.

**In lists** (**Events**, **Calendar**, the shared calendars, a series' rounds, a track's events, **At the Track** and the printed calendar), the event is one row marked **2 days** (or however many). Under it there's a line for each day, joined to the event by a line down the left:

- the day's date, e.g. *Sat 14 Nov*;
- its name, e.g. *Finals*, or *Day 1 of 2* if it hasn't got one;
- its start time;
- **Rained out** or **Cancelled**, with the day crossed out;
- what happened that day and its result, once they're recorded.

Days already past are greyed, and today's day says *today*. On the **Calendar** and a series' rounds, tap a day's line to open the event on that day.

**Elsewhere,** the calendar's month view marks each day the event runs, not the days in between. Your published calendar and its **Subscribe** link have one entry per day. With **Show results** on, the published page shows each day's result too (never withdraw reasons or notes). A day's result stays with your team: it's never sent to the shared calendars, and an update from the shared calendar keeps it. The weather on a setup sheet starts at that day's date and start time.

**Taking a day off:** a day that has setup sheets can't be removed, and you can't untick **Runs over more than one day** while a later day has sheets. Open each sheet, change its **Day**, then remove the day.

**Quick edit on the calendar:** for an event whose days run one after another, changing the **Date** moves all the days, and the **End date** adds or takes off days at the end. Days with gaps between them are changed in **All details**.

Events from older versions of RaceOps with a date and an end date open with one row for each day in between.

**Who can do this:** anyone whose role can edit events.

## Series

**At the Track → Series** holds your championships: name, season, class, sanctioning body and points notes. A series lists its rounds with each car's feature finish.

- **Shared series:** a series from the shared calendars is kept by the RaceOps admin. Press **Request a change** if something's wrong. Keep your own notes under **Our notes**.
- **Your own series:** a series your team set up shows **Our own series**. **Send to shared calendars** shares it, with its rounds, for every team. Once it's approved, your rounds point at the shared series. See [Calendar](/help/calendar).

The **At the Track** hub shows your next event and recent between-round checks.
