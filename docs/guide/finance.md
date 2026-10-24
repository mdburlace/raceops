---
id: finance
title: Finance
section: business
order: 30
summary: Season budget in groups with a contingency reserve and an income budget, expenses with receipts read by the AI, income, contracts, a profit and loss for every event, and the export to accounting software.
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

## Profit and loss for each event

**Event P&L** lists your past meetings with their net result. Open one to see:

- **Income** tagged to the event, by kind;
- **Costs** tagged to the event, by category, plus parts orders not yet recorded as expenses;
- **Wear**, estimated from the laps run there: each tyre's cost shared by its laps, the engine's last **Rebuild cost** (on its build sheet) spread over its laps to the next freshen, and other parts with a cost and a life in laps.

The event page shows the same totals. **Season P&L** adds up any period.

## Contracts

**Contracts** keeps sponsorship, supply, driver and venue agreements with their value and renewal or notice date — shown in Reminders 60 days before.

## Export to accounting software

**Export** works the same in every region:

1. Pick your accounting software: **Xero**, **QuickBooks Online**, **MYOB Business**, **Sage Accounting** or the **Universal CSV** (every field, for anything else).
2. Pick the dates. Leave **Only lines not exported yet** ticked.
3. Press **Download**. Import the file in your accounting software. The lines are marked as exported.

Your region sets the tax codes and which software is suggested first. Set your own account code for each category in **Team → Members & invites → Region & currency → Show accounting export settings**.

Coming later: direct connections (no file), and enterprise systems — Oracle NetSuite, Microsoft Dynamics 365 Business Central, Sage Intacct and SAP Business One — for larger teams and engine builders with several businesses.

Payroll isn't included: your accounting software handles wages, tax and super properly.

**Who can do this:** roles with Finance → edit (the built-in Business Manager). Amounts only show to roles with **See costs, prices and amounts**. Finance must be in your team's plan.
