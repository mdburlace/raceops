---
id: backups-platform
title: Backups and restore (platform admin)
section: admin
order: 15
summary: Full backups of the whole server, where they go, schedules, restoring everything or one team as it was, and moving RaceOps to a new server.
for: platform
pages: /admin/backups
covers: option:backups-full, option:backup-destinations, option:restore-full, option:relocate, setting:backup_full, setting:backup_teams
related: backups-team, platform-admin, role-platform-admin
---
**Platform admin → Backups** keeps a copy of everything on the server, so you can put it back after a mistake or a failure, bring back one team as it was, or move RaceOps to new infrastructure.

There are two kinds of backup:

| Backup | What's in it | Who can restore from it |
|---|---|---|
| **Full backup** | Everything: every team, user, role, setting, backup destination and uploaded file | Platform admins: the whole server, or one team |
| **Team backup** | One team: its records, setup sheets, parts, attached files, forms, roles and settings | That team (see [Team backups](/help/backups-team)), and platform admins |

## Encryption

Backups are encrypted with the server's backup passphrase, the **BACKUP_KEY** environment variable in the Portainer stack. Keep a copy of it somewhere safe, away from the server. A backup can only be opened by a server with the same BACKUP_KEY.

If BACKUP_KEY isn't set, the page says backups aren't encrypted. They still work, but anyone with the file can read it.

## Destinations

A destination is where backups are kept. Press **+ Add destination**, give it a name and choose the kind:

| Kind | What you need |
|---|---|
| **Server folder** | A folder name. It's inside the server's backup folder (BACKUP_DIR). A server folder is lost with the server, so keep another destination too. |
| **S3-compatible storage** | AWS S3, Backblaze B2, Wasabi, Cloudflare R2 or MinIO: the endpoint (blank for AWS), region, bucket, an optional folder, and an access key that can read and write the bucket. |
| **Google Drive**, **Dropbox**, **OneDrive** | Press **Save and connect**, sign in, and allow RaceOps. It can only see the files it makes. These need a one-time app registration on the server (see the README). |

Each destination shows **Working** or **Not working**, with the reason. **Test** checks it again, **Files** lists the RaceOps backups there, and **Reconnect** signs in to a cloud account again. **Remove** forgets the destination; backups already there stay.

Keys and sign-ins are stored encrypted and never shown again.

## Back up now

Under **Full backup**, choose a destination (or **Download to this computer**) and press **Back up now**. It runs in the background: you can leave the page. Downloads are kept on the server for a day.

## Schedules

1. Under **Full backup → Schedule**, choose how often: every day, week or month.
2. Choose the time, the day where needed, the destination, and how many to keep.
3. Press **Save schedule**.

Times are the server's time zone. Only scheduled backups are counted for **Keep the last**: older ones are deleted from the destination. Backups made by hand are kept until you remove them.

**Team backups** sets a schedule for every team that hasn't set its own. Its destination is offered to teams as **Platform storage**. Teams with their own schedule are skipped. **Back up one team now** backs up a single team straight away.

If a scheduled backup fails, platform admins are emailed (when the server has email set up).

## Restore

Every backup in the list has **Restore…**. You can also restore from **Restore from a file** (a backup on your computer) or from a destination's **Files**.

RaceOps checks the backup first: when it was made, and what's in it. Then choose what to restore.

**One team, as it was then**

1. Choose **One team** and pick the team.
2. Press **Restore the team**.

The team's records, files, forms, roles and settings go back to how they were. Its members stay as they are now. A safety backup of the team is taken first. Everyone's devices download the team again the next time they sync.

A team that has been deleted since the backup comes back. You're added as an owner, and its members are matched by email.

**Everything**

1. Choose **Everything**.
2. Type **RESTORE** and press **Restore everything**.

Every team, user, setting, destination and file on the server is replaced by the backup. Anything since the backup is lost. A safety backup is taken first, into the server folder **safety**. While it runs, RaceOps answers "being restored" to everyone. Then reload, and sign in again if asked.

## Move RaceOps to a new server

1. On the old server, make a full backup to a cloud destination, or download it.
2. Install RaceOps on the new server with the **same BACKUP_KEY** (and the same cloud app registrations if you use them).
3. Then either:
   - on the new server's first-run screen, open **Moving from another server? Restore a backup** and choose the downloaded file; or
   - set the new server up, add the same cloud destination here, open its **Files** and restore the backup.
4. Point your web address at the new server. Installed apps carry on as normal.

For very large backups, or if the app won't start, use the command line instead: `node server/src/backupCli.js backup|inspect|restore <file>` (see the README).

**Who can do this:** platform admins.
