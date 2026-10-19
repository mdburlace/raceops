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
2. Fill in the date, valving label, purpose (baseline, after rebuild…) and gas pressure.
3. Pick the **Test speeds**. **3.00**, **6.00** and **10.00 in/s** are there to start with. Keep one or more, tap ✕ to drop one, or type another speed (e.g. 8) to add it. A run needs at least one.
4. Enter the readings at each test speed:
   - **Non-adjustable shock:** a force-vs-velocity table for each test speed, headed e.g. *6.00 in/s test*. Each table starts with velocities from 0 up to that speed.
   - **Adjustable shock:** one block per adjuster setting at each speed. **+ Setting** adds a block for every test speed in the run. Each block has a label, the adjuster positions, its test speed, a note such as *good if rough/heavy*, and optional readings.
5. Press **Save**.

## Fill the readings quickly

- **Paste whole printout** reads Kenco, Slade, Roehrig and Intercomp text. Each title line starts a new setting, and header rows like `Speed CC RO RC CO` map the columns.
- Each speed's table has its own **Paste / import**, which also has **Load Excel / CSV file** (.xlsx, .csv, .tsv). If the file has several sheets, pick one. Check the columns, then **Replace** or **Add to existing**. Old .xls files need re-saving as .xlsx.
- **Fill velocity** fills the speed column, e.g. 0–10 every 0.25.
- With the AI add-on, **Fill from photo, PDF or Excel** reads a printout. See [Fill forms from photos, PDFs and spreadsheets](/help/import-files).

## Compare runs

Each test speed is its own curve, e.g. *LF baseline · 6.00 in/s*. Tick runs to overlay their curves on one graph. Click a legend entry to hide or show a curve. From a setup sheet, **Shock dyno** shows the latest runs for the shocks on that sheet.

## Torsion bar tests

Press **New bar test** and pick the bar. Its serial number, manufacturer, model and corner come across from the bar's asset record if they're set there.

**Bar details**

- Date tested, **Serial #**, **Manufacturer**, **Model**;
- **Bar size (diameter)** and **Bar type** (solid, hollow / gun-drilled, titanium…);
- **Target corner**: LF, RF, LR or RR;
- the **Nominal rate** it's sold as, and active length.

**How it was tested**

- **Arm length** (15 in to start with);
- **Rate measured at (arm travel)** (3 in to start with). Testing every bar the same way means rates compare like with like.

**Readings**

Under **Compression & rebound readings**, enter the force at each arm travel:

- **Compression** as the bar winds up;
- **Rebound** as it releases.

The table starts at 0–3 in every 0.5 in. If your tester only gives the two numbers at the test travel, type them in **Compression at test travel** and **Rebound at test travel** instead.

**Results**, at the top of **Spring rate & split**:

- **Rate at 3 in.** Compression ÷ travel, in lb/in at the arm.
- **Rebound rate.**
- **Split (hysteresis).** Compression − rebound at the test travel, in lb and as a percentage. A growing split usually means the bar is tiring.
- **Against baseline.** How this bar's rate compares with the baseline average for its size and type.
- **Against nominal.** How the rate compares with the rate it's sold as.
- **Since initial test.** How far the rate (and split) has moved since the bar's initial measurement.

The curve shows compression (solid) and rebound (dashed). The **Torsion bar rate** calculator is beside the nominal rate.

## Initial measurement (at purchase or first build)

**Initial measurement (at purchase or first build)** marks the first test of a shock or bar: when it was bought, or first built or revalved. Every later test of that shock or bar is compared with it.

- **A new shock or bar:** its first test is ticked for you, showing **Yes**. Later tests start at **No**.
- **Tests saved before this option existed:** the earliest test of each shock or bar offers **Mark it as the initial measurement**. Press it, then **Save**.

- **Torsion bars:** **Since initial test** shows the change in rate, as a percentage, and in split.
- **Non-adjustable shocks:** the readings show the change in compression and rebound force at about 5 in/s.
- **Adjustable shocks:** each adjuster setting is compared with the setting of the same name in the initial run, such as *set 10* against *set 10*.
- **The dyno list** marks the initial run with **Initial**. [Analytics → Shock fade](/help/analytics) measures from it.

Each shock or bar has one initial measurement. If you tick it on another run, you're warned, and saving moves it to that run.

## Rate baselines

The **Torsion bars** tab has a **Rate baselines** table. For each bar size and type it shows:

- how many bars you have;
- the **baseline rate**, which is the average of the tests in the baseline;
- the range;
- the baseline split.

To set or change a baseline:

1. Press **Set baseline** (or **Change baseline**) on that size and type.
2. Tick the tests to average, usually new bars or a set you trust.
3. Press **Save baseline**.

You can also tick **Use in baseline averages** on any single test. In the list, each test shows its rate, split and its difference from the baseline. Within 2% shows green, 2–4% amber, and over 4% red.

## Runs from before test speeds

Older runs keep their readings. They show under **Readings without a test speed** until you pick the speed they were taken at and press **Move**. A run with a single test speed uses them for that speed automatically.
