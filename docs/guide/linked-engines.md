---
id: linked-engines
title: Engines from your engine builder
section: engines
order: 20
summary: Link an engine your builder shares, see its build history, and choose whether your laps count on their service tracker.
for: module:engines
team: race
pages: /engines/linked/:id, /link-engine/:code
covers: setting:feed_lifecycle
related: engine-builds, engine-tunes, link-owner-team, assets
---
If your engine builder runs their shop on RaceOps, they can link an engine to your team. You see their build and job history, and they see your laps since its last service. They never see your setups, tracks or results.

## Accept a link

Your builder sends you a link, or an invite code such as *ABCD-2345*.

1. Open the link, or go to **Engine Builds** and enter the code under **Link an engine from your builder**.
2. Pick which of your engines it is, or add it as a new engine.
3. Choose whether to **Count our laps on [shop]'s service tracker for this engine**. It's off unless you tick it.
4. Confirm.

The engine then shows under **Engine Builds → Engines from your engine builder**.

## Count our laps on the shop's service tracker

This is set per engine, by your team.

- **On.** Your laps on that engine since its last service count on the shop's lifecycle bars, so they can tell you when it's due.
- **Off** (the default). The shop still sees your lap count on the link, but its service tracker only uses laps it records itself.

**To change it later:**

1. Go to **Engine Builds → Engines from your engine builder**.
2. Open the engine.
3. Under **Service tracking**, tick or untick the switch. It saves straight away.

**Who can change it:** anyone whose role can edit assets.

## Use your builder's engine tune

If your builder shares the engine's tune, the linked engine shows **Engine tunes from [shop]**, with the builder's current version marked.

1. Go to **Engine Builds → Engines from your engine builder** and open the engine.
2. Under **Engine tunes from [shop]**, press **Use this tune**.

It's copied into your [engine tunes](/help/engine-tunes) as the active version for your engine, so the pill settings are on hand at the track even with no connection. If the builder changes that version later, it shows *updated since you copied it*: press **Update ours** to bring the change across.

**Who can do this:** anyone whose role can edit engine tunes, while the link is active.

## End a link

On the linked engine, press **End link**. You keep a copy of the build history as it is that day, and the shop stops seeing your laps. If the shop changes the engine's owner, the link ends automatically and you keep your copy.

**Our engine record** opens your own asset for the engine, with its laps and schedules.
