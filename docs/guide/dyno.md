---
id: dyno
title: Shock and bar dyno
section: workshop
order: 30
summary: Record shock dyno runs and torsion bar tests, import printouts, and overlay curves.
for: module:dyno
pages: /workshop/dyno, /r/dyno_run/*
covers: type:dyno_run, module:dyno, feature:dyno
related: assets, import-files, shocks-on-setup
---
**In the Workshop → Shock & bar dyno** holds every run. **Shocks** and **Torsion bars** switch between the two lists.

## Record a shock run

1. Press **New shock run** and pick the shock. Its adjustable type comes across from the shock.
2. Fill in the date, valving label, purpose (baseline, after rebuild…), gas pressure and test speeds.
3. Enter the readings:
   - **Non-adjustable shock:** one force-vs-velocity table.
   - **Adjustable shock:** one block per adjuster setting, with a label, the adjuster positions, a note such as *good if rough/heavy*, and optional readings.
4. Press **Save**.

## Fill the readings quickly

- **Paste whole printout** reads Kenco, Slade, Roehrig and Intercomp text. Each title line starts a new setting, and header rows like `Speed CC RO RC CO` map the columns.
- **Paste / import** on a table also has **Load Excel / CSV file** (.xlsx, .csv, .tsv). If the file has several sheets, pick one. Check the columns, then **Replace** or **Add to existing**. Old .xls files need re-saving as .xlsx.
- **Fill velocity** fills the speed column, e.g. 0–10 every 0.25.
- With the AI add-on, **Fill from photo, PDF or Excel** reads a printout. See [Fill forms from photos, PDFs and spreadsheets](/help/import-files).

## Compare runs

Tick runs to overlay their curves on one graph. Click a legend entry to hide or show a curve. From a setup sheet, **Shock dyno** shows the latest runs for the shocks on that sheet.

## Torsion bar tests

Press **New bar test**, pick the bar and record the rate readings. The **Torsion bar rate** calculator is beside the nominal rate.
