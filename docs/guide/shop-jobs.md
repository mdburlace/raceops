---
id: shop-jobs
title: Jobs — parts and labour
section: shop
order: 20
summary: Open a work order, record parts and labour, move it through to collected.
for: module:jobs
team: shop
pages: /jobs, /r/job/*
covers: type:job, module:jobs, setting:share_prices
related: customers, handover-pack, engine-builds, shop-settings
---
A job is a work order for one engine.

## Open a job

1. Go to **Engine Shop → Jobs** and press **New job**. You can also press **New job** on an engine.
2. Pick the customer and engine, the job type (fresh build, freshen, repair…) and the status.
3. Fill in the dates, who it's assigned to and what was asked for.
4. Press **Save**. The job number is filled in with your prefix.

## As the work goes

- **Findings, work done and recommendations.** These go on the job sheet and the customer's history.
- **Parts.** Description, quantity, cost and price. Cost is never shown to customers.
- **Labour.** Description, hours and rate. A blank rate uses the shop rate.
- **Discount, tax, invoice number and paid.**

Totals show parts, labour, tax, the total and your parts margin.

**New build sheet** on the job starts an [engine build sheet](/help/engine-builds) linked to it. Measurements, clearances and torque go into the handover pack.

## Status

{{job-statuses}}

Home shows jobs by status, jobs due in the next 7 days or overdue, and jobs ready for pickup.

## Show prices to the customer

Off by default. Tick **Show prices to the customer** on a job to include its prices on the customer's engine page link and their team's copy. Internal notes, parts costs and margins are never shown.

**Job sheet / handover pack** prints the job. See [Job sheet and handover pack](/help/handover-pack).
