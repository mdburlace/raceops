# RaceOps — notes for anyone changing the code

Self-hosted, multi-tenant race team PWA. `server/` (Node 22 + Express 5 + Postgres), `web/` (React + Dexie,
local-first with sync), `shared/` (code used by both, including the standard forms), `docs/guide/` (the user
guide, bundled into the app), `tools/` (guide check and screenshots). Secrets and API keys only ever go in
environment variables (Portainer stack), never in the repo.

## User guide — every change must keep it current

The in-app guide (Help & guide, `/help`) is part of the product. **A feature isn't finished until the guide
explains it.** For every enhancement or change:

1. **Update or add the article** in `docs/guide/<id>.md` that explains it — written for the people who'll use it:
   what it's for, where it is, step by step, who can do it. Keep the front matter right:
   - `pages:` every route the article explains (gives the page its **?** link);
   - `for:` who sees it (`everyone`, `owner`, `admin`, `platform`, `module:<key>`, `edit:<key>`, `perm:<key>`);
   - `team:` `race` or `shop` if it only applies to one team type;
   - `covers:` what it documents (`type:`, `module:`, `feature:`, `perm:`, `role:`, `teamtype:`, `setting:`, `option:`).
2. **New setting or switch?** Add it to `SETTINGS` in `shared/guideData.js` (where / who / what / article) and put
   `setting:<id>` in that article's `covers:`.
3. **New form field?** Give it an ⓘ description in `shared/fieldInfo.js` (`FIELD_INFO`).
4. **New role-relevant task?** Add it to the role guide(s) (`docs/guide/role-*.md`), usually under *Common jobs*.
5. **New first-run step for a team?** Add it to `CHECKLIST` in `shared/guideChecklist.js`.
6. **Add a line to `docs/guide/whats-new.md`** (newest first) linking to the article.
7. **Screen changed and the guide pictures it?** Retake: `python3 tools/guide_shots.py --email … --password …`
   against a test server (see the script's header), and commit the images in `docs/guide/img/`. Add new shots to
   the script rather than hand-made screenshots.
8. Run `node tools/check-guide.mjs` (it also runs in `npm run build`, so a Docker build fails if the guide is
   behind). It checks pages, record types, modules, licence features, admin rights, team types, built-in roles,
   settings read in the code, links, images and field descriptions.

Tables of roles, permissions, plans, settings, calculators, themes and shock adjusters are generated from the code
(`{{name}}` embeds, see `EMBEDS` in `shared/guideData.js`) — change the code, not a copy in Markdown.

Writing style: plain Australian English, short sentences, bold for things on screen, "you" for the reader.

## Release notes — every release adds them

Each release adds `docs/releases/<version>.md` (shown in Help & guide → Release notes). The version is the release date,
`YYYY.MM.DD`, or `YYYY.MM.DD.2` for a second release that day. Front matter: `version`, `date`, `title`, `summary` (one or
two sentences), and once known `pr` (pull request numbers) and `commits` (`<from>...<to>`). Then these sections, each a
bullet list, leaving out any with nothing in it: `## New features`, `## Improvements`, `## Bug fixes`, `## Notes` (anything
admins or teams must know or do: new environment variables, settings, closing and reopening the app, known limits).
Write for the people who use the app, in the same style as the guide. The newest What's new line must be in the newest
release's notes; `node tools/check-guide.mjs` checks this and the file format.

## Training pack — every release must keep it current

The training pack (`docs/guide/training*.md`, Help & guide → Training) is reviewed **in the same change** as every
enhancement, so the exercises always match the app:

1. **Exercises, cards and quick start:** update every step, label and "When it's right" that the change affects
   (`training-<role>.md`, `training-cards.md`, `training-quick-start.md`). A new feature a role will use gets an
   exercise in that role's article, with a **Check yourself** question if it's easy to get wrong.
2. **Practice data** (`shared/practiceData.js`): add demo records the new exercise needs. Keep the names the articles
   list in their `demo:` front matter — the guide check fails if one disappears.
3. **Videos:** if a screen shown in a video changed, re-record it: `python3 tools/training_videos.py --email … --password …`
   against a test server (`--only <name>` for one), and change the script in that file to match. Keep the voice-over
   right too: each `say()` line is spoken (`speak=` for more than the caption), so check the words still match what's
   on screen. Record with the same voice as the other videos: Amazon Polly's Matthew (`--tts polly`, the default voice; AWS keys in the
   environment).
4. **Tests:** keep `tests/e2e/e2e34.py` (practice team and the crew chief exercise) passing; extend it for new exercises.
5. **Sign the review:** set `reviewed:` in `docs/guide/training.md` to the title of the newest `whats-new.md` line
   (without the bold or full stop). `node tools/check-guide.mjs` fails until it matches, so every release gets a review —
   even when the answer is "nothing in the training changes".

## Design document — every release must keep it current

`docs/design/DESIGN.md` describes the system well enough to rebuild it if the repo or server is lost;
`docs/design/ROLLOUT.md` covers environments, releases and deployment. Update them **in the same change**:
new migrations, environment variables, server modules, routes, record types, in-memory state, integrations,
build/deploy or backup changes (the checklist is DESIGN.md §20). Set *Last updated* in its header.
`node tools/check-design.mjs` runs in `npm run build` and fails if a migration, environment variable, server
module or record type isn't documented. New environment variables also go in `docker-compose.yml` and `README.md`.

## Also update

- `README.md` for deployment or admin-facing changes.
- Tests: Playwright end-to-end suites are in `tests/e2e/` (see its README). Add one per feature (`e2eNN.py`, next
  number, a row in the README's table) and run `tests/e2e/run.sh` before pushing; all suites must pass.
