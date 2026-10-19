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

## Also update

- `README.md` for deployment or admin-facing changes.
- Tests: Playwright end-to-end scripts are kept outside the repo; add one per feature.
