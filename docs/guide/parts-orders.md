---
id: parts-orders
title: Parts orders and approvals
section: business
order: 20
summary: Ask for parts, have the crew chief approve them, then record them as expenses — costs hidden from roles that shouldn't see them.
for: module:purchases
pages: /purchases, /r/purchase/*
covers: type:purchase, module:purchases, option:purchases.approve, option:money.view
related: finance, roles-permissions, business
---
**Business → Parts orders** is where anyone can ask for a part, and the crew chief (or whoever has **Approve or decline parts orders**) says yes or no.

## Ask for a part

1. Go to **Business → Parts orders** and press **New parts order**.
2. Fill in **What's needed**, the part number, quantity, supplier, car and the event it's for, and **Needed by**.
3. Add the cost if you know it (and your role can see costs).
4. Press **Save**. It shows as **Requested**.

## Approve or decline

People who can approve see **Approve** and **Decline** on each request in the list (and on the order). Requests waiting for them are in **Reminders**. The order records who decided and when.

Only a role with **Approve or decline parts orders** can approve or decline — the server refuses it from anyone else, even if they can edit parts orders.

## Ordered, received, and into Finance

Change the status to **Ordered**, then **Received**. With Finance in your plan, **Record as an expense** opens a new expense filled in from the order. Saving it links the two and marks the order received, so its cost lands in the event's profit and loss once.

## Costs and amounts

Costs on parts orders (and amounts in Finance and sponsor deals) only show to roles with **See costs, prices and amounts**. Without it, the cost fields don't appear and the server never sends them to the device, so the crew can see an order exists without seeing what it cost.

**Who can do this:** roles with Parts orders → edit raise and update orders (the built-in Mechanic, Car Chief, Tire Specialist and Crew Chief can). Approving needs **Approve or decline parts orders** (Crew Chief).
