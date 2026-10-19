---
id: weather
title: Track weather
section: track
order: 26
summary: Pull track weather, calculate from your own readings, and set the team's units.
for: module:setups
team: race
covers: setting:weather_units
related: setup-sheets, calculators, tracks
---
Each setup sheet's **Weather** section has three tools. Whatever they find is shown for you to check before anything changes.

## Get track weather

Pulls readings for the event's track at the time you choose (the session time by default). It can look back up to 92 days to fill in old sheets.

- **From the weather service:** temperature, station and corrected barometer, humidity, dew point and wind.
- **Calculated from those:** density altitude (ALT), ADR, wet bulb and water grains.

It needs the track's latitude and longitude (from the track directory) and a connection.

## Calculate from readings

Type in what your weather station or handheld meter shows: temp, baro, and humidity **or** wet bulb. **Calculate from readings** works out ALT, ADR, grains and dew point. This works offline.

Readings you typed in start **unticked** in the review, so they're never replaced unless you tick them.

## Air Density Online

**Air Density Online ↗** opens that site. It has no way for other apps to read from it, so RaceOps links to it rather than pulling from it.

## Units

US (°F, inHg, ft) by default, or metric. The setting is for the whole team; change it in the weather panel on any sheet. It needs the **Edit team settings** right.

The **Air & weather** [calculators](/help/calculators) do the same sums for any readings.
