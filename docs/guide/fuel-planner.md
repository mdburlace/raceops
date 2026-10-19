---
id: fuel-planner
title: Plan fuel for a session
section: track
order: 24
summary: Predict the fuel to start with from planned laps, past fuel use and the car's minimum fuel.
for: module:setups
team: race
covers: option:fuel_plan
related: cars, setup-sheets, calculators
---
The **Race** section of every setup sheet starts with a **Fuel plan**.

![The fuel plan at the top of the Race section](img/fuel-planner.webp)

## How it works

**Fuel to start with = planned laps × fuel per lap + minimum fuel.**

- **Planned laps.** Enter the laps you expect to run: race laps plus any pace or caution laps.
- **Fuel per lap.** Worked out from sessions where laps, fuel started and fuel finished were all filled in. In order:
  1. This event's earlier sessions, plus this track with **this engine** at other events.
  2. If there are none: this track with this car.
  3. If there are none: this car at any track.

  The plan shows which sessions it used, and how many laps.
- **Minimum fuel.** The car's **Minimum fuel (pickup)**, so you never run low enough to uncover the pickup. Set it on the car; see [Add your cars](/help/cars).

Press **Use as fuel started** to put the prediction into *Fuel started*.

## Warnings

- **Fuel started is below the prediction.** The tank could drop below the minimum before the end.
- **Fuel finished was below the minimum.** The pickup may have uncovered. Check the fuel per lap, or add margin.

## Keep it accurate

The plan is only as good as what's recorded. After each session, fill in **Laps**, **Fuel started** and **Fuel finished**. *Fuel used* is calculated. Sessions with any of the three missing are left out.

The **Fuel for a race** calculator (button beside *Fuel started*) does the same sum by hand.
