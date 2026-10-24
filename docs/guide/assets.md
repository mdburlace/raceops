---
id: assets
title: Assets — engines, shocks, bars and more
section: workshop
order: 10
summary: Track every part with a life — status, position, life limit, measurements and where it ran.
for: module:assets
pages: /workshop, /assets, /assets/:id, /r/asset/*, /r/measurement/*
covers: type:asset, type:measurement, module:assets, feature:workshop, setting:shock_info
related: maintenance, dyno, shocks-on-setup, setup-sheets
---
An asset is any part you want to track: shocks, torsion bars, engines, gears, rear ends, wings, safety gear and more.

## Add an asset

1. Go to **In the Workshop → Assets** and press **New asset**.
2. Pick the **category** (Shock, Torsion bar, Engine…) and give it a name you'll recognise, e.g. *RR shock #3*.
3. Set its **status**: In Service, Spare, Out for Service, On Order or Retired.
4. Set the **car** it's on and its **position**.
5. Optionally, add a **parent** (e.g. a gear fitted in a rear end), purchase details, a **life limit** in laps, races or hours, and an **expiry date** (e.g. SFI belts).
6. Press **Save**.

## Vehicles

The hauler, toterhome, trailer and tow vehicle are assets with the category **Vehicle**. Pick the **Vehicle type**, and set **Registration due** and **Inspection due** — both show in Reminders 30 days before. Give them service schedules like any other asset. See [Transport](/help/transport).

## Shocks: position and adjustable type

Two shock settings change what setup sheets show:

- **Position** (LF, RF, LR, RR). The shock appears first in that corner's list. With no position, it's offered at every corner.
- **Shock adjustable.** Non-adjustable, single, two-, three- or four-way. This decides which adjuster boxes show on the sheet.

{{adjusters}}

The same goes for **torsion bars** and **wheels** on the setup sheet. For a **wing**, set the position to **Top** or **Front**, so it's offered for the top or front wing. See [Shocks, bars, tyres, wheels and wings on the setup sheet](/help/shocks-on-setup).

See [Shocks, adjusters and bump rubbers](/help/shocks-on-setup).

## Life and history

An asset's page shows:

- **Lifecycle:** laps and races since its last service, against its limit. These are counted from setup sheets that use it.
- **Measurements** over time, charted against a spec band. Add one with **+ Measurement**.
- **Maintenance schedules** for it (**+ Schedule**).
- **Installed components.**
- For shocks: its dyno runs.
- **Spent on this** (people who can see costs): what it was bought for, and every expense and parts order with it as the **Inventory item** — services, repairs, rebuilds. See [Finance](/help/finance#expenses-and-the-inventory).

Assets near or over their limit show under **Needs attention** on Home and the Workshop hub.

Retired assets are hidden from pick lists but keep their history.
