---
id: roles-permissions
title: Roles and permissions
section: team
order: 20
summary: What the built-in roles can do, and how to make your own.
for: admin, perm:roles.manage
pages: /roles
covers: perm:roles.manage, setting:roles, perm:team.manage, option:part-rights, option:add-standard-roles
related: members-invites, role-owner
---
Access is checked in three layers:

1. **Licence.** Is the team licensed for the area or feature? Your platform admin sets this. Owners are limited by the licence too.
2. **Area.** Can the role *Enter* that area (At the Track, In the Workshop, Engine Builds, Team Management)?
3. **Module.** **View**, **Edit** and **Delete** for each module inside the area.

## Built-in roles

{{roles}}

## Add standard roles

Teams made before a built-in role was added don't have it yet. Press **Add standard roles** to add every built-in role the team doesn't have (by name — a role you renamed counts as missing). Roles you already have aren't changed.

## Make or change a role

1. Go to **Team → Roles & permissions**.
2. Press **New role**, or open an existing one.
3. Tick the areas it can enter, then View / Edit / Delete for each module.
4. Tick any **Other rights** it needs (below), and any team admin rights.
5. Press **Save role**.

Changes reach each person's device at their next sync. Anything they can no longer see is removed from their device.

## Other rights

- **Part rights** let a role that can only *view* setup sheets change just some sections:
    - **Track conditions & car feedback** — the driver's debrief (built-in Driver role);
    - **the change list** — the car chief ticks off each change (built-in Car Chief);
    - **the tyre and wheel sections** — the tyre specialist (built-in Tire Specialist).
  The server only accepts changes in those sections; the rest of the sheet stays as it was.
- **Unlock locked setup sheets** — usually the crew chief (the built-in Crew Chief role has it for new teams). The team owner can always unlock. For an existing team, tick it on the roles that should have it. See [Lock a finished sheet](/help/setup-sheets#lock-a-finished-sheet).
- **Approve or decline parts orders** — usually the crew chief. See [Parts orders](/help/parts-orders).
- **See costs, prices and amounts** — costs on parts orders, amounts in Finance, sponsor deal values, rebuild costs and merchandise costs. Without it those fields are hidden and the server never sends them to the device.

## More than one role

A person can hold more than one role — for example the car chief who also does the tyres, or the owner who is also the business manager. They get everything any of their roles allows. See [Invite your crew](/help/members-invites#more-than-one-role).

## Everything you can grant

{{permissions}}

- **Edit forms & fields:** change forms and field descriptions.
- **Invite & manage members:** invite people and change roles.
- **Create & edit roles:** this page.
- **Edit team settings:** team name, team type and shop settings, weather units, AI on or off, and classes we race.

**Who can do this:** the owner, or a role with **Create & edit roles**.
