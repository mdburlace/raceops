---
id: training-owner
title: "Training: team owner"
section: training
order: 14
summary: Hands-on exercises in the practice team — invite people with the right role, make a role, plan the racing year, read the reports, and reset the practice team.
for: owner, admin
covers: option:training-owner
related: training, role-owner, members-invites, roles-permissions, calendar, reports, training-trainers
demo: Car 17, Car 71, Lakeside Raceway
---
**Time:** about 40 minutes. **You need:** the practice team, signed in as its owner.

![Video: Invite a crew member and plan the next round](video/training-owner.webm)

## Exercise 1: Invite a crew member (5 min)

1. Go to **Team Management → Members & invites**.
2. Under **Invite someone**, enter an email and pick the **Mechanic** role. Press **Create invite link**.

**When it's right:** the link is copied and the invite shows as pending, with its expiry. In real life, send it by text or email. Here, press **Revoke** when you're done.

## Exercise 2: Make a role (10 min)

1. Go to **Team Management → Roles & permissions** and press **New role**.
2. Name it *Tyre person*. Tick **At the Track**, then View for **Setup sheets & advisor** and View / Edit for **Gears & tires**.
3. Press **Save role**.

**When it's right:** the role is listed. Anyone given it sees setup sheets read-only and can manage tyres. Roles aren't removed when the practice team is reset, so delete it afterwards if you don't want it.

## Exercise 3: Plan the next round (10 min)

1. Go to **Team Management → Calendar → Our calendar**.
2. Find *Rd 9 · Lakeside Raceway* and set **Going?** to **Tentative**.
3. Press **Edit** on it. In the quick edit, add a **Sanctioning body** and press **Save** at the top.
4. Press **Print** to see the year on paper.

**When it's right:** the round shows as tentative with the sanctioning body, and the printout lists the season.

## Exercise 4: Read the season (5 min)

1. Go to **Team Management → Reports**. Look at **Results by car** for this year.
2. Go to **Team Management → Crew Chief stats**.

**When it's right:** you can say how many features Car 17 started this season and its average finish. The **CSV** button downloads the table.

## Exercise 5: What's due and what it costs (5 min)

1. On **Home**, look at **Needs attention** and the next event.
2. In **Reports**, look at **Spend by category**.

**When it's right:** you know what the crew has to do this week, and where the money's gone.

## Exercise 6: Back up the team and put it back (10 min)

1. Go to **Team Management → Backups & export**.
2. Under **Back up now**, choose **Download to this computer** and press **Back up now**. Wait for **Backed up**.
3. Now make a mistake on purpose: go to **Team Management → Cars** and delete *Car 71*.
4. Back on **Backups**, press **Restore…** on the backup you just made. Tick **I understand the team's data will be replaced** and press **Restore the team**.
5. Go to **Cars**.

**When it's right:** *Car 71* is back, and the list of backups also has a **Safety backup before a restore**. See [Team backups and export](/help/backups-team).

For a single item, there's a quicker way: delete *Car 71* again, then open **Recently deleted** in the sidebar and press **Recover** on it.

## Exercise 7: Reset the practice team (5 min)

When a training group has finished, put the demo data back for the next group:

1. Go to **Team Management → Members & invites** and find **Practice team**.
2. Press **Reset practice data** and confirm.

**When it's right:** tonight's meeting has only its Heat 1 sheet again, and job J-1001 is back where it started.

## Check yourself

<details><summary>Someone leaves the team. What do you do?</summary>
On <b>Team Management → Members &amp; invites</b>, remove them. Their records stay; they can no longer sign in to this team.
</details>
<details><summary>A whole night's setup sheets were deleted by mistake. Can you get them back?</summary>
Yes. For a few items, open <b>Recently deleted</b> and recover them. For a whole night at once, restore the team from a backup made before the mistake (<b>Team Management → Backups &amp; export → Restore…</b>). Anything added since that backup is lost, so check its date first. A safety backup of the team as it is now is taken before the restore.
</details>
<details><summary>A crew member can't see the dyno. Why?</summary>
Their role doesn't include <b>In the Workshop</b> or <b>Shock &amp; bar dyno</b>, or your plan doesn't include the dyno. Check <b>Roles &amp; permissions</b>, then ask your platform admin about the plan.
</details>

## Sign-off

Set up the real team's people: invite each crew member with the role that matches their job, and check with each of them that they can see what they need. Then make sure the team is backed up: either your platform admin's schedule, or your own to a place the team controls.
