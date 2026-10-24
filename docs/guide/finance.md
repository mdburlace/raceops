---
id: finance
title: Finance
section: business
order: 30
summary: Season budget in groups with a contingency reserve and an income budget, the season forecast and cash flow, what's owed both ways, the asset register with depreciation, expenses with receipts read by the AI, income, contracts, a profit and loss for every event, and the export to accounting software.
for: module:finance
pages: /finance, /r/expense/*, /r/income/*, /r/budget/*, /r/contract/*
covers: type:expense, type:income, type:budget, type:contract, module:finance, feature:finance, setting:accounting
related: parts-orders, region-currency, business, reports
---
**Business → Finance** keeps the team's money in one place, tied to your events.

## Expenses

1. Press **New expense**.
2. Take a photo of the receipt with **Fill from photo** (AI add-on). It reads the supplier, their business number (ABN, GST number, VAT number or EIN), the receipt number, the amount and the tax.
3. Check the **Category** and pick the **Event** it was for. For crash damage or a mechanical failure, use **Crash & failure repairs**, or tick **Paid from the contingency reserve** (see [Budget](#budget)).
4. Paid in another currency? Pick the **Currency** and the **Rate to team currency** for the day.
5. Not paid yet? Untick **Paid** and set **Due by** — it shows in Reminders.

If you leave **Tax included** blank, the page shows the tax worked out from your region's rate, and the export uses it.

### Expenses and the inventory

- **Inventory item** says what an expense paid for: a new part, or a service or repair on something you already have — the hauler's service, an engine freshen, a shock rebuild. The item's page then shows everything spent on it under **Spent on this**.
- **Add to inventory** (below a saved expense) makes the item for you: pick what it is (an asset category, or **Tyre**), its name and the car. Its cost, supplier and purchase date come from the expense, and it's linked back. Received parts orders have the same button. See [Parts orders](/help/parts-orders).
- **For (crew member)** says whose per diem or pay an expense is.

## Income

**Income → New income** records prize money, sponsorship (pick the sponsor deal), engine jobs (pick the job), merchandise, appearance money, **seat fees or driver contributions**, **series stipends or subsidies**, and **in-kind sponsorship** (goods or services given instead of cash — record their fair value as the amount).

## Budget

**Budget → New season budget**: the season's dates, then an amount for each category, and the income you expect.

The **Budget** tab shows spend against budget for each category, under the groups of a race team's budget:

| Group | Categories |
|---|---|
| **Vehicle & hardware** | Car purchase & lease, Engine |
| **Parts, maintenance & consumables** | Parts, Tyres, Fuel & oil, Workshop |
| **Personnel & payroll** | Wages & contractors, Per diems & catering |
| **Logistics & travel** | Transport, Travel, Accommodation |
| **Event & administrative** | Entry fees, Licences & memberships, Insurance, Track hire & testing |
| **Marketing & hospitality** | Marketing, Hospitality, Merchandise |
| **Contingency** | Crash & failure repairs |
| **Other** | Other, and any category you type yourself |

When a category reaches the warning level (80% unless you change it) it shows in Reminders.

### Contingency reserve

Most teams keep 10–20% of the budget aside for crash repairs and mechanical failures. Set **Contingency reserve** on the budget to that share, e.g. *15*. Any budget lines in **Crash & failure repairs** add to it.

Expenses in **Crash & failure repairs**, and any expense ticked **Paid from the contingency reserve**, come out of the reserve. **Contingency reserve** on the Budget tab shows the reserve, how much is used and how much is left. It shows in Reminders when it reaches the warning level.

### Income budget

Under **Income budget**, list the income you expect by kind: sponsorship, prize money, seat fees, stipends. The Budget tab compares it with what's been received, and shows the net so far against the budgeted net.

## Season forecast

**Finance → Forecast** answers "will we finish the season on budget?" For each category:

- **Spent** so far this season;
- **On order**: approved and ordered parts not yet recorded as expenses;
- **Per meeting**: what the category has cost per meeting so far, from expenses tagged to past meetings;
- **Forecast** = spent + on order + per meeting × the meetings still **Planned** on your calendar.

The top line says whether you're heading over or under the budget, and by how much. Tentative meetings aren't counted, but it tells you what going to them would add.

The income side adds what's been received, what's still to come (sponsor instalments not yet received and income with **Received** unticked) and prize money per meeting so far × the meetings left, for a **Season net forecast**.

It's a forecast from what you've recorded: the more expenses you tag to their meeting, the better it gets.

### Cash flow

Under the forecast, **Cash flow — the next 8 weeks** shows money in (sponsor instalments and income due) and out (unpaid bills by their due date, and each planned meeting at the average cost per meeting) week by week. Anything overdue counts in the first week.

Add **Cash in the bank** (and the date) to the season budget for a running balance. If it would go below zero, the page warns you.

## What's owed

**Finance → Owed** lists:

- **Owed to us**: sponsor instalments not yet received, and income with **Received** unticked;
- **We owe**: expenses with **Paid** unticked (including crew pay), and parts on order that haven't been billed yet.

Each side has a table by age — **Not due**, **1–30 days**, **31–60 days**, **61–90 days**, **Over 90 days** late — and a list with how many days late each one is. Tap one to open it.

## Profit and loss for each event

**Event P&L** lists your past meetings with their net result. Open one to see:

- **Income** tagged to the event, by kind;
- **Costs** tagged to the event, by category, plus parts orders not yet recorded as expenses;
- **Wear**, estimated from the laps run there: each tyre's cost shared by its laps, the engine's last **Rebuild cost** (on its build sheet) spread over its laps to the next freshen, and other parts with a cost and a life in laps.

The event page shows the same totals. **Season P&L** adds up any period. Under **Not paid in cash** it takes off the depreciation of your assets for the period and adds any gain (or takes off any loss) on assets sold or scrapped, for a **Net after depreciation**.

## Asset register and depreciation

Cars, engines, the hauler and other big items lose value. On an asset, under **Value & depreciation**, set:

- **Depreciation**: **Straight line** (evenly over its **Useful life** in years, from its purchase date) or **Per lap** (by the laps it runs against its life limit in laps);
- **Value at the end of its life**: what you expect to get for it at the end.

When it's sold, scrapped, returned or written off, fill in **Sold or scrapped on**, **How it went** and the **Sale or scrap value**. It stops depreciating, and the gain or loss against its book value on the day goes into the season's profit and loss.

**Finance → Assets** lists every depreciating asset with its cost, how much it's depreciated, its **Book value** today and its depreciation this season, and each disposal with its gain or loss. The asset's own page shows the same under **Value**.

These are estimates for planning — your accountant's tax depreciation may differ. Each meeting's profit and loss already counts wear on tyres, engines and parts by the laps run, so depreciation is only in the season view.

## Contracts

**Contracts** keeps sponsorship, supply, driver and venue agreements with their value and renewal or notice date — shown in Reminders 60 days before.

## Crew pay and per diems

1. For each paid crew member or driver, add a contract of kind **Crew / contractor** or **Driver**, pick the **Team member**, and set their **Per diem (each day)** and **Pay per meeting**. The contract's start and end dates say which meetings it covers.
2. Put them on the event's **Crew** list.
3. On the event page, the **Crew** card shows **Crew pay**: each person's per diem (rate × the meeting's racing days) and pay. Press **Add crew costs to Finance**.

They're added as bills to pay (due a week after the meeting) under **Per diems & catering** and **Wages & contractors**, with the person in **For (crew member)**, and show in Reminders until they're marked paid. Anything already added for that person and meeting isn't added twice.

**Who can do this:** people who can add expenses and see costs and amounts.

## Trip costs

On a trip plan with fuel stops and tolls, **Add to Finance** records them as one **Transport** expense for the event, linked to the trip and the vehicle. If the costs change, **Update the expense** brings it into line. See [Transport](/help/transport).

## Export to accounting software

**Export** works the same in every region:

1. Pick your accounting software: **Xero**, **QuickBooks Online**, **MYOB Business**, **Sage Accounting** or the **Universal CSV** (every field, for anything else).
2. Pick the dates. Leave **Only lines not exported yet** ticked.
3. Press **Download**. Import the file in your accounting software. The lines are marked as exported.

Your region sets the tax codes and which software is suggested first. Set your own account code for each category in **Team → Members & invites → Region & currency → Show accounting export settings**.

Coming later: direct connections (no file), and enterprise systems — Oracle NetSuite, Microsoft Dynamics 365 Business Central, Sage Intacct and SAP Business One — for larger teams and engine builders with several businesses.

Payroll isn't included: your accounting software handles wages, tax and super properly.

**Who can do this:** roles with Finance → edit (the built-in Business Manager). Amounts only show to roles with **See costs, prices and amounts**. Finance must be in your team's plan.
