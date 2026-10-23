---
id: region-currency
title: Region and currency
section: settings
order: 30
summary: Set your country so tax, business numbers, licence classes, work-hour rules, inspections and the accounting export match where you race.
for: admin, perm:team.manage
pages:
covers: setting:region
related: finance, transport, team-settings
---
RaceOps starts with Australian rules, but every country-specific rule is part of a **region**: Australia, New Zealand, the United States, the United Kingdom or Europe (EU).

## Set your region

1. Go to **Team → Members & invites → Region & currency**.
2. Pick your **Region**.
3. Change the **Currency** if yours differs, and the tax rate if it varies where you are (US sales tax, EU VAT).
4. Optionally add your **Business name** for exports.
5. Press **Save region & currency**.

## What the region changes

| Region | Tax | Business number | Heavy-vehicle licences | Driver hours | Units |
|---|---|---|---|---|---|
| Australia | GST 10% | ABN | HR, HC, MC | NHVR fatigue rules | Metric |
| New Zealand | GST 15% | GST number | Class 2–5 | NZTA work-time rules | Metric |
| United States | Sales tax (varies) | EIN | CDL A, CDL B | FMCSA hours of service | Imperial |
| United Kingdom | VAT 20% | VAT number | C1, C, C1+E, C+E | Drivers' hours and tachographs | Mixed |
| Europe (EU) | VAT (varies) | VAT number | C1, C, C1E, CE | EU driving time and tachographs | Metric |

The region also sets the vehicle inspections suggested, the tax codes in the accounting export and which accounting software is suggested first. Every accounting connector is open to every region.

Money always keeps its currency: an expense paid abroad records its own currency and the rate, and profit and loss converts it to the team's currency.

These are starting points, not compliance advice. Check your country's rules with a local adviser.

## Accounting export settings

**Show accounting export settings** lets you pick your accounting software and enter your account code for each expense category, so the export lands in the right accounts. See [Finance](/help/finance#export-to-accounting-software).

**Who can do this:** the owner, or a role with **Edit team settings**.
