---
id: tracks
title: Tracks and the classes you race
section: track
order: 5
summary: The shared track directory, your own tracks, and classes we race.
for: module:tracks
team: race
pages: /tracks, /tracks/:id, /r/track/*, /r/team_track/*
covers: type:track, type:team_track, module:tracks, setting:classes
related: events-sessions, weather
---
RaceOps comes with a shared directory of 700+ tracks: address, size, surface, banking, classes and location. Every team reads it; only platform admins change it.

## Our tracks

**Our tracks** starts empty. A track is added when:

- **you race there.** Creating an event at a track adds it, whether you picked the track from the directory or typed its name;
- **you link it.** Open any track in the **Directory** and press **Link to team**, or **Make home track**. Your home track shows first;
- **you add a team-only track** for somewhere that isn't in the directory.

To take a track off the list, open it and press **Unlink**, or **Hide from our tracks** for one you've raced at. **Show in our tracks** brings a hidden track back.

## Classes we race

On the Tracks page, press **Edit** beside *Classes we race*, pick your classes and press **Save classes**. This needs the **Edit team settings** right.

Classes don't add tracks to Our tracks. Instead:

- in the **Directory**, tracks that run your classes are marked **our class**, and **Runs our classes** filters to them;
- when you pick a car's **Class**, your classes are listed first.

Your cars' classes are offered as quick picks.

## Team notes and missing tracks

- **Team notes.** Each track can hold your team's own notes, such as pit gate, power or fuel. Only your team sees them.
- **Missing track?** Add a team-only track. Or, when creating an event, type the track name; a free-text field appears for tracks not in the directory.
- **Share a team-only track:** on its page, press **Send to shared calendars**. Once a RaceOps admin approves it, it joins the shared directory, and your events and notes move to the shared track.
- **Something wrong on a shared track?** Press **Request a change** on its page. The admin checks it, then it updates for everyone.
- **Our notes:** each shared track has **Our notes**, which only your team sees. **Team notes** on a linked track still work as before.

## Why location matters

[Track weather](/help/weather) needs the track's latitude and longitude. The [fuel planner](/help/fuel-planner) matches sessions at the same track. Events at the same directory track always match. Typed track names match by name.

From a track, **New event here** starts an event already set to that track.
