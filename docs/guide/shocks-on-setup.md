---
id: shocks-on-setup
title: Shocks, adjusters and bump rubbers on the setup sheet
section: track
order: 22
summary: How each corner's shock list is filtered, which adjuster boxes show, and recording bump rubbers.
for: module:setups
team: race
covers: option:shock_filter
related: assets, setup-sheets, dyno
---
## Picking a shock for each corner

![Shocks section: adjusters follow each shock’s type, then travel and bump rubbers](img/setup-shocks.webp)

Each corner's list starts with the shocks that fit it:

- shocks whose **position** is that corner (an LF shock under LF), or that have no position set;
- assigned to **this car**, or not assigned to a car.

If you need a shock from elsewhere, e.g. the spare RF shock on the LF, choose **Show all shocks…** at the bottom of the list. The rest appear, each with its position shown.

Set a shock's position and car on the shock in [Assets](/help/assets). A new shock with no position appears at every corner until you give it one.

## Adjuster settings

The adjuster boxes follow the **Shock adjustable** type set on the shock in Assets:

{{adjusters}}

- Enter clicks (or whatever unit you use) in each box. The sheet saves them as e.g. *Comp 3 · Reb 5*, which the setup advisor and Compare understand.
- If **all four** shocks are non-adjustable, the Adjuster settings field is hidden.
- A shock typed in by hand, or with no type set, gets a single free-text box.
- **Single adjustable** shows one box, labelled *Adjuster*.

## Bump rubbers

Per corner:

- **Type:** make or style.
- **Spec:** durometer, colour code or part number.
- **Height:** free height of the stack, including packers.
- **Packers:** how many spacers are under it.
- **Gap:** distance from the rubber to the shock body at ride height, i.e. the travel before it engages.

Like the other settings, they copy into the next session's sheet.

**Travel** (from zip ties or travel indicators) is recorded after the session and isn't copied.
