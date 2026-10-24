---
id: engine-teardown
title: Engine teardown & pre-check
section: engines
order: 11
summary: Record an engine's condition as it comes apart — plugs, chambers, oil filter, springs, valves, bores, mains, rods, pistons, crank and crack tests — find the root cause and decide what's reused, machined or replaced.
for: module:engines
pages: /r/engine_teardown/*, /print/teardown/:id
covers: type:engine_teardown, feature:engine-teardown
related: engine-builds, engine-checks, engine-tunes, shop-jobs, calculators
---
A teardown & pre-check is the forensic inspection of an engine as it comes apart, before the rebuild. It does three jobs:

- records the engine's **condition as found** — the baseline for the rebuild;
- helps find the **root cause** of a failure;
- decides, for each part, whether it's **reused, machined or replaced**.

As you enter readings, RaceOps checks them against your limits and lists what it finds under each part of the sheet. At the end it shows what the evidence points to and suggests a decision for each part.

## Start a teardown

1. Go to **Engine Builds** (or **Engine Shop → Build sheets**).
2. On the engine's card, press **Teardown**.
3. **Build being torn down** is filled in with the engine's latest build sheet. Change it if you need to.
4. Pick **Why it came apart**, fill in the laps and **What happened**.
5. Work through the four parts of the sheet (below), then **Findings & decisions**.
6. Press **Save**.

The engine's card lists its last three teardowns, with the root cause and how many readings are over a limit. Engine shops can link the teardown to the customer's **Shop job**.

**Who can do it:** anyone whose role can edit engine builds. Roles that can only view engine builds can read teardowns and their findings, but can't change them.

## Limits & new-part baseline

Your limits and the figures for new parts. A new teardown copies them from the engine's last one, so you set them once per engine. The readings always start blank.

- **Spring pressure loss** (10% to start with), **valve stretch** (0.002 in), **deck flatness** (0.001 in) and **deck height side to side** (0.001 in) have starting values. Change them to your own.
- The rest are blank until you fill them in: new spring seat and open pressures, new valve length, guide clearance, bore taper and out-of-round, main housing and rod big-end out-of-round, new rod bolt length and stretch, ring vertical clearance, skirt collapse, wrist pin clearance, snout runout and fuel in the oil.
- Blank new spring seat pressures use the **Spring seat pressure** on the build sheet being torn down. Skirt collapse is measured against the **Piston size** on that build sheet.

If you've entered readings with no limit to check them against, **Findings & decisions** lists what's missing.

## 1. Forensic clean & visual log

Before anything is cleaned off:

- **Spark plug** for each cylinder: good, detonation / aluminium peppering, lean (white or blistered), rich (sooty), oil pulling, or damaged.
- **Combustion chamber carbon & colour** for each cylinder.
- **Oil filter**: cut it open and check the pleats under a light. Record the **ferrous** metal (on the magnet) and **non-ferrous** metal (not on the magnet) — none, fine or heavy — and what the metal looks like. Grey or silver flakes are bearing overlay; copper means the bearings are worn through the overlay; steel points at the crank, cam or lifters; aluminium at the pistons, block or heads; bronze or brass at the guides, bushes or thrust faces.
- **Fuel dilution test** of the drained oil (lab analysis, flash or smell test, viscosity check, blotter spot), the percentage of fuel in the oil, and how the drained oil looked. Methanol thins the oil and washes the bearings.

## 2. High-stress valvetrain

- **Every spring's seat and open pressure**, intake and exhaust, for each cylinder. Each is compared with the new-spring figure: a spring that has lost more than your limit is flagged for replacement (metal fatigue). Springs within 80% of the limit are flagged to watch.
- **Valve length** for each valve. Stretch is the length minus the new length. A stretched titanium exhaust valve points to over-revving or valve float.
- **Guide clearance** for each valve (a dial bore gauge gives the most accurate reading).
- **Retainers** (titanium galling or cracking) and **keepers** (indentation or lock crush).

## 3. Rotating assembly & block tolerances

| Part | What you measure | Why |
|---|---|---|
| **Cylinder bores** | Each bore at the top, middle and bottom, across the thrust faces and along the pin, with a **torque plate** fitted | Shows how the walls distort with the head torqued down. Taper and out-of-round are worked out for each cylinder |
| **Main bearing bores** | Each housing bore vertically and horizontally, the line bore with an alignment bar, and the back of each main bearing | Finds main cap distortion, cap walk and bearing fretting from crankshaft whip at high rpm |
| **Connecting rods** | Big end vertically and horizontally, rod bolt length, and a Magnaflux crack test of each rod | Finds a stretched big end, stretched rod bolts or a crack before a rod lets go |
| **Piston ring lands** | Top and 2nd ring vertical clearance with a feeler gauge | Finds ring lands deflected or pounded by detonation or very high cylinder pressure |
| **Piston skirt & pin** | Skirt diameter at the gauge point, wrist pin bore clearance, and whether each pin is galled or bent | Finds skirts collapsed by heat and galled or bent pins |
| **Crankshaft snout & keys** | Snout runout, the damper keyways and the oil pump drive surfaces | High-rpm vibration and heavy dampers or clutches can crack or bend the snout |

Bores measured without **Bores measured with a torque plate** ticked are flagged: they may change once the head is torqued down.

## 4. Crack testing & stress mapping

- **Crack detection**: for the block main webs, each head's combustion chambers, the crank fillets and the crank snout and keyways, pick the method (**Magnaflux** for steel and iron, **dye penetrant** for aluminium) and the result. Rods are tested in part 3.
- **Deck flatness** of each bank: the biggest gap under a machinist's straightedge. Over the limit (0.001 in, 0.025 mm to start with) flags the block for decking.
- **Deck height** at the front and rear of each bank. The difference between the banks, and between the highest and lowest corner, is checked against the limit, so compression is the same side to side.

## Findings & decisions

At the top of this section:

- **How many readings are over a limit or failed**, and how many are close (within 80% of the limit).
- **What the evidence points to**: the likely causes (detonation, a lean mixture, oil starvation, fuel in the oil, metal fatigue, over-revving, overheating, coolant in the oil…) with the findings behind each, most evidence first.
- **Suggested from the measurements**: a decision for each part with a finding — **Machine** or **Replace** — and why. Press **Fill in … suggested decisions** to put them in the **Reuse, machine or replace** table. Decisions you've already made are left alone.

Then fill in:

1. **Root cause** and **How we know**.
2. **Tuning limits for the next build**, e.g. *take 2° of timing out*. They show on the rebuild sheet.
3. The decision for every part in **Reuse, machine or replace**, with why. Add rows for anything else.
4. **Signed off by**.

The suggestions come from your limits. They're a starting point, not a rule: you make the decisions.

## Start the rebuild sheet

Open a saved teardown and press **Start the rebuild sheet**. A new build sheet opens for the engine, set to **Rebuild**, with the laps filled in and the last build's figures copied as usual. Save it, and:

- the teardown shows a link to its **Rebuild sheet**;
- the build sheet shows **Teardown before this build** — the date, root cause, every part machined or replaced, and the tuning limits.

A build sheet started another way shows the engine's newest teardown from before its date.

## Print it

- Open a teardown and press **Print** for the filled-in sheet with its findings.
- For a blank sheet to fill in on the bench, press **Print a blank teardown sheet** on the engine's card. It's laid out like the screen, with every choice to tick.

See also [Engine build sheets](/help/engine-builds) and [Workshop engine checks](/help/engine-checks).
