---
id: training-mechanic
title: "Training: mechanic"
section: training
order: 11
summary: Hands-on exercises in the practice team — between-round checks, what's due, schedules, checklists, parts and their life, a dyno run, a new tyre, the workshop setup and an engine check.
for: module:maintenance, module:assets
covers: option:training-mechanic
related: training, role-mechanic, engine-checks, engine-tunes, between-round-checks, maintenance, assets, dyno, gears
demo: Car 17, 410 #3, 2026 v2, Intake spring for #5, Lakeside baseline, Valley Speedway — Club night, Small oil weep on the RR shock, Oil and filter change, RR shock rebuild, RR Penske 8760, Spare Penske, Hoosier
---
**Time:** about 45 minutes. **You need:** the practice team, signed in as a mechanic.

**The story:** it's club night. Between rounds you check the car, and back in the workshop you catch up on what's due.

![Video: A between-round check and what's due in the workshop](video/training-workshop.webm)

## Exercise 1: Read the last check (5 min)

1. Go to **At the Track → Between-round checks**.
2. Open the check after **Heat 1** for Car 17.

**When it's right:** you've found the issue noted: *Small oil weep on the RR shock*.

## Exercise 2: Check the car after the Feature (10 min)

1. Press **New check**. Pick **Valley Speedway — Club night**, **Car 17** and the session *Feature*.
2. Tick pressures, lug nuts, tyre wear and fuel. Type the fuel added (e.g. *3*).
3. Press **+ note** on *Inspect shocks for leaks* and write *RR still weeping*.
4. Press **Save**.

**When it's right:** the new check is listed under the Heat 1 check.

## Exercise 3: See what's due (5 min)

1. Go to **In the Workshop** (the Workshop hub).
2. Look at **Service due** and **Assets needing attention**.

**When it's right:** you can see the *Oil and filter change* is due, and the *RR shock rebuild* is due in 1 race (9 of its 10 races). Races are counted from the setup sheets that use the car and the shock.

## Exercise 4: Do the oil change (5 min)

1. Go to **Car maintenance → Schedules**.
2. Press **Done today** beside *Oil and filter change*.

**When it's right:** the count starts again: it shows *Due in 3 races* and moves down the list.

## Exercise 5: Send the RR shock for a rebuild (5 min)

1. Go to **Assets** and open *RR Penske 8760*.
2. Look at **Lifecycle**: races since its last service, against its limit of 10.
3. Press **Edit** and set **Status** to **Out for Service**. Press **Save**.

**When it's right:** the shock shows *Out for Service*. On a setup sheet, use **Show all shocks…** to fit the *Spare Penske* in its place.

## Exercise 6: A weekly service (5 min)

1. Go to **Car maintenance** and press **+ Weekly**. Pick **Car 17**.
2. Tick the items you've done, and add a measurement where there's a box for one.
3. Press **Save**.

**When it's right:** the service is listed with your name and today's date.

## Exercise 7: Record the shock after its rebuild (5 min)

1. Go to **Shock & bar dyno** and press **New shock run**. Pick *RR Penske 8760*.
2. Set **Purpose** to after rebuild, keep the **6.00 in/s** test speed, and enter two or three readings.
3. Press **Save**.

**When it's right:** the run is listed under **Shocks**, and appears on the shock's page.

## Exercise 8: Add a new tyre (5 min)

1. Go to **Gears & tires → Tires** and press **New tire**.
2. Name it *RR-15*, brand *Hoosier*, **Intended position** *RR*, **Available for cars** *Car 17*, **Circumference** *106.25*.
3. Press **Save**.

**When it's right:** on a setup sheet, *RR-15* is listed first at the RR corner. See [Shocks, bars, tyres, wheels and wings on the setup sheet](/help/shocks-on-setup).

## Exercise 9: The car's workshop setup (10 min)

1. Go to **In the Workshop → Workshop setups** and open *Lakeside baseline* for Car 17.
2. Read the **Baseline & reference conditions**: the fuel load and block heights the measurements were taken with.
3. Go back and press **New workshop setup** for Car 17. It starts from *Lakeside baseline*.
4. Name it *Valley tacky*. Change the **Ride height** at the LF to *9* and the **Top wing angle** to *14*. Press **Save**.
5. Open *Valley tacky* and, under **Use for an event…**, choose *Valley Speedway — Club night* and press **Link**.

**When it's right:** the event page for tonight shows **Workshop setup: Valley tacky**. See [Workshop setup sheets](/help/workshop-setups).

## Exercise 10: The engine check (10 min)

1. Go to **In the Workshop → Engine checks**. Under *410 #3*, the newest check shows how many things there are to look at.
2. Open it. Under **Compared with the tune and the last check**, find the cylinder whose intake spring has dropped, and the cylinder whose plug reads lean.
3. Read **Parts needed for the next race**: *Intake spring for #5. Check #6 nozzle.*
4. Go back and press **New engine check** under *410 #3*. **Compare with tune** is already *2026 v2*.
5. Type a **Leak-down** of *12* for cylinder #1 and watch the list underneath.
6. Tick the **Fuel system & injectors** jobs, then press **Save**.

**When it's right:** the list flags cylinder #1's leak-down as you type, and your check is at the top of the list. See [Workshop engine checks](/help/engine-checks).

## Check yourself

<details><summary>How does RaceOps tell you a valve spring is going weak?</summary>
It compares each spring's seat pressure with the engine's last check. A drop of 10% or more is flagged, so type every cylinder's reading each time.
</details>
<details><summary>Why record the fuel load and block heights on a workshop setup?</summary>
Because every other measurement depends on them. With a different fuel load or different blocks, ride heights and corner weights change, and the numbers no longer compare with last time.
</details>
<details><summary>Where do races and laps for a schedule come from?</summary>
From setup sheets: each sheet for that car (or with that part picked) adds its laps and race meeting.
</details>
<details><summary>A part needs to go away for service. How do you stop it being picked by mistake?</summary>
Set its status to <b>Out for Service</b>. It still shows in its history, and you can fit a spare.
</details>
<details><summary>Where do you add a new wheel or torsion bar?</summary>
In <b>Assets</b>, with the category <b>Wheel</b> or <b>Torsion Bar</b> and its corner as the position. Or type it on the setup sheet and press <b>+ Save to inventory</b>.
</details>

## Sign-off

From **Service due** on the Workshop hub (or **Needs attention** on Home), pick a job that's due, do it in RaceOps (schedule done, asset updated or checklist saved), and show the trainer where it's recorded.
