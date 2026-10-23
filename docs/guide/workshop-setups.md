---
id: workshop-setups
title: Workshop setup sheets
section: workshop
order: 15
summary: Record how each car is set up on the shop floor, link it to an event as the baseline, and start the track sheets from it.
for: module:shopsetups
team: race
pages: /workshop/setups, /r/shop_setup/*
covers: type:shop_setup, module:shopsetups
related: setup-sheets, engine-tunes, events-sessions, assets, shocks-on-setup, maintenance
---
A workshop setup sheet records how a car is set up on the shop floor, measured on the setup pad, before it goes to the track. Link it to an event, and the setup sheets at that event can start from it.

It's a shorter sheet than the one used at the track. It has no weather, nothing measured after a session (shock travel, hot pressures, hot stagger), no race result, and no track conditions or feedback. It adds the measurements that are only taken in the shop.

## What's on it

| Section | What you record |
|---|---|
| **Baseline & reference conditions** | Fuel load, driver weight or ballast, chassis type (standard or raised rail), and the setup block heights at each corner. Record these first: if they change, the other measurements no longer compare. |
| **Front suspension & geometry** | LF and RF torsion bars (and their material, diameter and brand), torsion arm lengths, bar stops or turns, ride height, toe, caster, camber, axle lead, front axle squaring, and the front shocks with their valving and clicks |
| **Rear suspension & linkage** | LR and RR torsion bars, turns, ride height or block clearance, rear axle squaring, radius rods and pick-up points, Jacob's ladder holes, rear shocks with valving and clicks, tie-downs, bump rubbers and packers |
| **Tyres & wheels** | Tyres, compound, brand and size, cold pressures, front and rear stagger, wheels, rear wheel spacing and the front spindle spacer stack |
| **Wings** | Top wing, its angle, slider position, side-to-side offset and wicker; front wing, its angle and wicker |
| **Drivetrain & engine** | Motor and its [engine tune](/help/engine-tunes), quick-change gear and position, ignition timing, nozzles and bypasses. **Fill timing & fuel system from the tune** copies them from the tune |
| **Weights** | Corner weights; total, left, rear and cross fill in when all four are entered |

Bars, shocks, tyres, wheels and wings are picked from your parts, the same way as on a track sheet (see [Shocks, bars, tyres, wheels and wings on the setup sheet](/help/shocks-on-setup)). The ones meant for that corner and car come first.

## Make one

1. Go to **In the Workshop → Workshop setups**.
2. Under the car, press **New workshop setup**. It starts from the car's latest workshop setup, so you only change what's different.
3. Give it a **Name** that says what it's for, e.g. *Lakeside baseline*, and fill in **Use it for** if it helps.
4. Fill in the measurements, section by section.
5. Press **Save**.

## Link it to an event

Either:

- open the workshop setup, choose the event under **Use for an event…** at the bottom, and press **Link**; or
- edit the event (**Edit event**) and pick it under **Workshop setup**. Only that car's workshop setups are listed.

The event page then shows **Workshop setup: …**. One workshop setup can be the baseline for several events. **Unlink** takes it off an event.

## Start the track sheets from it

At an event with a workshop setup:

- press **Start from workshop setup** beside the car's sessions, for the next session; or
- add a session as usual, and under **Start this sheet from…** choose **Workshop setup** (the event's is chosen) and press **Use workshop setup**.

What comes across:

- fields that are on both sheets, such as pressures, stagger, wings, the motor and gear, and the wheels and tyres;
- the front and rear bars, shocks, adjuster clicks, ride heights and bar turns, which become the four corners on the track sheet (bar turns become **Blocked**).

Measurements only taken in the shop, such as block heights, caster and camber, axle squaring and the Jacob's ladder, stay on the workshop setup. Every change you then make on the track sheet shows *was …* against the workshop setup.

**Who can do this:** roles with **Workshop setup sheets** rights. Roles that edit setup sheets can also delete them; mechanics can view and edit them.
