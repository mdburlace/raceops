---
id: training-engine-builder
title: "Training: engine builder"
section: training
order: 13
summary: Hands-on exercises in the practice team — work a customer job, read its teardown, start a build sheet, print the handover pack, share the engine with its owner, write its tune, and check your own engine's life.
for: module:jobs, module:engines
team: shop
covers: option:training-engine-builder
related: training, role-engine-builder, shop-jobs, engine-teardown, engine-builds, engine-tunes, handover-pack, share-engine-page, customers
demo: Sam Hart, Hart 410, J-1001, Freshen after 480 laps
---
**Time:** about 40 minutes. **You need:** the practice team (it's a race team and an engine shop), signed in as someone who can edit jobs.

**The story:** *Sam Hart* has brought in his engine, *Hart 410*, for a freshen. It's job **J-1001**, in progress.

![Video: Work job J-1001 through to the handover pack](video/training-shop-job.webm)

## Exercise 1: Open the job (5 min)

1. Go to **Engine Shop → Jobs** and open **J-1001**.
2. Read what was asked for, the part and the labour already on it.

**When it's right:** you can say what the customer reported (*down on power at the top end*) and when it's promised.

## Exercise 2: Record the work (10 min)

1. Press **Edit**. Under **Findings**, write what you found, e.g. *Cylinder 4 ring gap out of spec*.
2. Add a part: a set of bearings, quantity 1, cost and price.
3. Add 3 hours of labour for *Hone and re-ring*. Leave the rate blank to use the shop rate.
4. Set the status to **Waiting on parts**. Press **Save**.

**When it's right:** the totals show parts, labour and tax. The parts margin shows on the job but never to the customer.

## Exercise 3: Start the build sheet (10 min)

1. On the job, press **New build sheet**.
2. Fill in a few measurements, e.g. bore and a main bearing clearance. Press **Save**.

**When it's right:** the build sheet is linked to the job and shows on the engine's history.

## Exercise 4: Print the handover pack (5 min)

1. On the job, press **Job sheet / handover pack**.
2. Look through the pages, then press **Print / save as PDF**.

**When it's right:** you have a PDF with the work done, parts and labour, specs, clearances and torque.

## Exercise 5: Share the engine with its owner (5 min)

1. Open *Hart 410* (from **Customers → Sam Hart**, or **Customer engines**).
2. Under **Customer access → Engine page link**, press **Create engine page link**, then **Open**.

**When it's right:** you see the page the owner would see, without your internal notes or costs.

## Exercise 6: Write the engine's tune (10 min)

1. Go to **Engine Shop → Engine tunes**. Under *Hart 410*, press **New tune**.
2. Name the version *Freshen v1*. Leave **Share with the engine’s owner** ticked.
3. Under **Pill settings**, add a row: **From** *90*, **To** *93*, **Main pill** *70*, **H/S pressure** *108*, **H/S pill** *72*.
4. Fill in the **Spark plugs** and **Plug gap**, then press **Save**.
5. Open the engine page link from Exercise 5 again.

**When it's right:** the engine page shows **Engine tunes** with *Freshen v1* marked current. See [Engine tune sheets](/help/engine-tunes).

## Exercise 7: Your own engine (5 min)

1. Go to **Assets** and open *410 #3*.
2. Look at its laps against its 600-lap limit, and its fresh build sheet.

**When it's right:** you can say how many laps it has done since the build.

## Exercise 8: Read the teardown (10 min)

*Hart 410* is already half torn down for job **J-1001**.

1. Go to **Engine Shop → Build sheets**. On *Hart 410*'s card, open the **Teardown** (*Down on power*).
2. Look under **1. Forensic clean & visual log** and **2. High-stress valvetrain** for what's flagged.
3. Scroll to **Findings & decisions**. Read **What the evidence points to**.
4. Press **Fill in 1 suggested decision**. Set **Root cause** to *Metal fatigue*, and under **Tuning limits for the next build** write *Check the #4 injector*.
5. Press **Save**, open the teardown again and press **Print**.

**When it's right:** the intake spring on cylinder 4 is flagged (12% down on the new 280 lb), **Valve springs** is set to **Replace** in the table, and the printout lists the findings. See [Engine teardown & pre-check](/help/engine-teardown).

## Check yourself

<details><summary>You've tried a tune on the dyno that the customer shouldn't see yet. How do you keep it to yourself?</summary>
Untick <b>Share with the engine’s owner</b> on that version. Only shared versions show on the owner's engine page and in their linked team.
</details>
<details><summary>A spring tests 12% under new and your limit is 10%. Does RaceOps replace it?</summary>
No — it flags the spring and suggests <b>Replace</b>. You make the decision in the <b>Reuse, machine or replace</b> table, and the limits are yours to set under <b>Limits &amp; new-part baseline</b>.
</details>
<details><summary>Does the customer ever see your parts costs?</summary>
No. Customers see prices only on jobs where you tick <b>Show prices to the customer</b>, and never costs, margins or internal notes.
</details>
<details><summary>Where does the job number come from?</summary>
It comes from the shop's <b>Job number prefix</b>, set on <b>Team Management → Members &amp; invites</b> under <b>Team type &amp; engine shop</b>, and counts up automatically.
</details>

## Sign-off

Take a job from **Booked in** to **Ready for pickup**: findings, parts, labour, a build sheet and the printed handover pack.
