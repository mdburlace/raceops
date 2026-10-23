---
id: transport
title: Transport
section: business
order: 40
summary: Trip plans, load lists built from the event and ticked off with no signal, pre-trip checks, driver licences and the team's vehicles.
for: module:transport
pages: /transport, /r/trip/*, /r/load_list/*, /r/pre_trip/*, /r/licence/*
covers: type:trip, type:load_list, type:pre_trip, type:licence, module:transport, feature:transport
related: assets, maintenance, region-currency, business
---
**Business → Transport** gets the cars, engines and crew to the track and home again.

## Vehicles

The hauler, toterhome and trailer are assets with the category **Vehicle** (**Transport → Vehicles → Add a vehicle**). They get the usual service schedules and lifecycle, plus **Registration due** and **Inspection due**, which show in Reminders 30 days before.

## Trip plans

**New trip**: the event, vehicle, when you leave, the route, who's driving (with their licence class), fuel stops and tolls. When the fuel and tolls are filled in, **Record as a travel expense** adds them to the event's costs in Finance.

**Work & rest** on a trip is a planning aid only. Where your country's rules need an official record — an NHVR work diary in Australia, a logbook in New Zealand, an ELD in the USA, a tachograph in the UK and Europe — use an approved provider.

## Load lists

1. Make a **template** once: a load list with **Use as a template** ticked and a name like *Sprint car race weekend*, listing your standard kit.
2. For each event: **New load list**, pick the event, then pick the template and press **Add the event's car, engines and the template**. It adds the event's car, its engines and spare engines, then the template's items.
3. At the workshop, tick **Loaded** as each item goes on. At the track, tick **At track** as it comes off. After, tick **Back home**. Each tick records who and when.

Ticking works with no signal and syncs later.

## Pre-trip checks

**New pre-trip check** before every trip: tyres, wheel nuts, lights, brakes, coupling, tie-downs, fluids, doors, papers and safety kit. Note any issues, then tick **OK to travel**.

## Licences

**Licences → Add a licence**: the driver, the licence class and expiry (and medical expiry if needed). The classes follow your team's region — HR or HC in Australia, Class 2–5 in New Zealand, CDL A or B in the USA, C1 or C+E in the UK. Reminders warns you 60 days before one runs out.

**Who can do this:** roles with Transport → edit (the built-in Transport role). Vehicles need Assets → edit. Transport must be in your team's plan.
