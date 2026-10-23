---
id: backups-team
title: Team backups and export
section: team
order: 40
summary: Back up your team's data, where to keep it, a schedule, putting the team back as it was, and exporting the data as CSV, XML or JSON.
for: perm:backup.manage
pages: /team/backups
covers: perm:backup.manage, option:backups-team, option:restore-team, option:export, setting:backup_team
related: backups-platform, recently-deleted, team-settings, offline-sync
---
**Team Management → Backups & export** keeps a copy of your team's data where you choose, and puts the team back as it was if something goes wrong, such as records deleted by mistake.

A team backup holds the team's records, setup sheets, parts, attached files, forms, roles and settings. It doesn't hold the team's members, its licence or other teams' data.

## Back up now

1. Choose where it goes:
   - **Platform storage**, looked after by your platform admin (if they've set it up);
   - one of your team's own destinations;
   - **Download to this computer**.
2. Press **Back up now**.

It runs in the background. When it's done, it's in the list of **Backups**.

## Your own destinations

Keep backups somewhere your team controls, such as the team's Google Drive, Dropbox or OneDrive, or S3-compatible storage (AWS, Backblaze B2, Wasabi, Cloudflare R2).

1. Press **+ Add destination**.
2. Give it a name and choose the kind.
3. For Google Drive, Dropbox or OneDrive, press **Save and connect**, sign in, and allow RaceOps. RaceOps can only see the files it makes. For S3 storage, enter the bucket and an access key.

Each destination shows **Working** or **Not working**. **Test** checks it again; **Files** lists the backups there.

The kinds you can choose depend on what your platform admin has set up on the server.

## A schedule

Your platform admin may back up every team on a schedule. The **Schedule** card says so.

To choose your own:

1. Choose how often (every day, week or month), the time, and the day where needed.
2. Choose the destination and how many to keep.
3. Press **Save schedule**.

Your schedule replaces the platform's for your team. Set it back to **Off** to go back to the platform's.

## Put the team back as it was

1. In **Backups**, press **Restore…** on the backup you want. To use a backup file on your computer, press **Restore from a file**.
2. Read what happens, tick **I understand the team's data will be replaced**, and press **Restore the team**.

What happens:

- Records, setup sheets, parts, files, forms, roles and team settings go back to how they were in the backup. Anything added or changed since is lost.
- Members stay as they are now, so nobody loses access.
- A safety backup of the team as it is now is taken first. It's in the list, so you can undo the restore.
- Everyone's devices download the team again the next time they sync. Changes still waiting to sync on a device are sent afterwards.

To put back just one or two things deleted by mistake, use [Recently deleted](/help/recently-deleted) instead.

Only backups of your own team can be restored here. A platform admin can also bring a team back from a full backup of the server.

## Export your data

An export is a copy of the team's records to use somewhere else: in a spreadsheet, another program, or your own archive. Unlike a backup, an export can't be restored into RaceOps.

1. Under **Export your data**, choose the format:
   - **CSV**: a spreadsheet for each kind of record (cars, setup sheets, parts, tyres…), in a ZIP. Opens in Excel, Numbers or Google Sheets. The column headings are your forms' field names, and links to other records show the linked record's name (a setup sheet's **Car** shows *#17 Car 17*).
   - **XML**: one structured file, for importing into other programs.
   - **JSON**: one structured file, for developers and data tools.
2. Tick **Include attached photos and files** to add them (the export becomes a ZIP).
3. Choose where it goes: **Download to this computer**, platform storage or one of your destinations.
4. Press **Export**. When it's done, press **Download**.

Exports are listed with your backups. Deleted records aren't exported.

**Who can do this:** the owner, or a role with **Back up, restore & export team data**.
