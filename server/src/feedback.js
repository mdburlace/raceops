// Feedback & ideas: users report bugs and ask for enhancements or new features; platform admins capture
// their own ideas, review everything into one pipeline (Now / Next / Later → in progress → done), publish a
// roadmap people can vote on, and send items to Claude as GitHub issues for the Claude Code GitHub Action.
//
// GitHub (optional): GITHUB_TOKEN (fine-grained token with Issues: read & write on the repo), GITHUB_REPO
// (owner/name), GITHUB_ISSUE_LABELS (default "raceops-feedback"), CLAUDE_MENTION (default "@claude").
// GITHUB_PROVIDER=mock is for automated tests only.
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from './db.js';
import { HttpError } from './auth.js';
import { audit } from './settings.js';
import { mailAdmins, mailUser } from './mail.js';
import {
  KIND, USER_KINDS, PRIORITIES, LANE, OPEN_STATUSES, cleanAreas, areaForPage, similarity,
} from '../../shared/feedback.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const text = (x, max) => (x === undefined || x === null ? null : String(x).trim().slice(0, max) || null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PER_DAY = 20; // submissions per person per day
const MAX_FILES = 3;
const MAX_FILE_MB = 8;
const IMAGE = /^image\/(png|jpeg|webp|gif)$/;

// ---------------------------------------------------------------- GitHub
const GH_API = process.env.GITHUB_API_URL || 'https://api.github.com';
const ghMock = () => process.env.GITHUB_PROVIDER === 'mock';
export const githubConfigured = () => ghMock() || !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
const mockIssues = new Map();

async function github(method, p, body) {
  if (ghMock()) {
    const repo = process.env.GITHUB_REPO || 'example/raceops';
    if (method === 'POST') {
      const number = mockIssues.size + 1;
      const issue = { number, html_url: `https://github.com/${repo}/issues/${number}`, state: 'open', ...body };
      mockIssues.set(number, issue);
      return issue;
    }
    const n = Number(p.split('/').pop());
    return mockIssues.get(n) || { number: n, state: 'open' };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  let res;
  try {
    res = await fetch(`${GH_API}${p}`, {
      method, signal: ctl.signal,
      headers: {
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28', 'user-agent': 'RaceOps', ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new HttpError(502, e.name === 'AbortError' ? 'GitHub took too long to answer. Try again.' : 'Could not reach GitHub.');
  } finally { clearTimeout(timer); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = res.status === 401 ? 'the GitHub token was refused (GITHUB_TOKEN)' : res.status === 404 ? `the repository ${process.env.GITHUB_REPO} wasn’t found, or the token can’t see it`
      : res.status === 403 ? 'the token isn’t allowed to create issues on that repository' : json.message || `error ${res.status}`;
    throw new HttpError(502, `GitHub said no: ${why}.`);
  }
  return json;
}

// ---------------------------------------------------------------- reading items
const ITEM_SQL = `
  SELECT f.*, u.name AS user_name, u.email AS user_email, t.name AS team_name, d.name AS decided_by_name, s.name AS sent_by_name,
         (SELECT count(*)::int FROM feedback_votes v WHERE v.item_id=f.id) AS votes,
         (SELECT count(*)::int FROM feedback_comments c WHERE c.item_id=f.id) AS comment_count,
         (SELECT count(*)::int FROM feedback_items x WHERE x.duplicate_of=f.id) AS duplicates,
         dup.ref AS duplicate_ref, dup.title AS duplicate_title
    FROM feedback_items f
    LEFT JOIN users u ON u.id=f.user_id LEFT JOIN tenants t ON t.id=f.tenant_id
    LEFT JOIN users d ON d.id=f.decided_by LEFT JOIN users s ON s.id=f.sent_by
    LEFT JOIN feedback_items dup ON dup.id=f.duplicate_of`;

async function extras(items, { admin = false } = {}) {
  if (!items.length) return items;
  const ids = items.map((i) => i.id);
  const { rows: comments } = await q(
    `SELECT c.id, c.item_id, c.from_admin, c.body, c.created_at, u.name AS user_name
       FROM feedback_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.item_id = ANY($1) ORDER BY c.created_at`, [ids]);
  const { rows: files } = await q(`SELECT id, item_id, filename, mime, size, created_at FROM feedback_files WHERE item_id = ANY($1) ORDER BY created_at`, [ids]);
  return items.map((i) => {
    const out = { ...i, comments: comments.filter((c) => c.item_id === i.id), files: files.filter((f) => f.item_id === i.id) };
    if (!admin) {
      // people see the admin side of the conversation as "RaceOps", not by name
      out.comments = out.comments.map((c) => ({ ...c, user_name: c.from_admin ? 'RaceOps' : c.user_name }));
      for (const k of ['user_email', 'decided_by_name', 'sent_by_name', 'github_url', 'github_issue', 'github_state', 'acceptance', 'context']) delete out[k];
    }
    return out;
  });
}

const one = async (id) => {
  need(UUID.test(id || ''), 404, 'Not found');
  const { rows: [i] } = await q(`${ITEM_SQL} WHERE f.id=$1`, [id]);
  need(i, 404, 'Not found');
  return i;
};

/** Tell the person who submitted it (in the app, and by email). */
async function tellSubmitter(item, subject, body) {
  if (item.source !== 'user' || !item.user_id) return;
  await q('UPDATE feedback_items SET seen=false WHERE id=$1', [item.id]);
  mailUser(item.user_id, `#${item.ref} ${item.title} — ${subject}`, body, '/feedback?tab=mine').catch(() => {});
}

// ---------------------------------------------------------------- uploads
function uploader(UPLOAD_DIR) {
  const dir = path.join(UPLOAD_DIR, 'feedback');
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({ destination: (_r, _f, cb) => cb(null, dir), filename: (_r, _f, cb) => cb(null, crypto.randomUUID()) }),
    limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
    fileFilter: (_r, f, cb) => cb(IMAGE.test(f.mimetype) ? null : new HttpError(400, 'Add a picture (PNG, JPEG, WebP or GIF), such as a screenshot.'), IMAGE.test(f.mimetype)),
  });
}

async function addFile(req, item, UPLOAD_DIR) {
  try {
    need(req.file, 400, 'No file uploaded');
    const { rows: [n] } = await q('SELECT count(*)::int AS n FROM feedback_files WHERE item_id=$1', [item.id]);
    need(n.n < MAX_FILES, 400, `Up to ${MAX_FILES} pictures per item.`);
  } catch (e) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    throw e;
  }
  const { rows: [f] } = await q(
    `INSERT INTO feedback_files(item_id,filename,mime,size,storage_path,uploaded_by) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, filename, mime, size, created_at`,
    [item.id, req.file.originalname, req.file.mimetype, req.file.size, path.relative(UPLOAD_DIR, req.file.path), req.user.id]);
  return f;
}

// ---------------------------------------------------------------- everyone (signed in)
export async function feedbackNotices(user) {
  const { rows: [a] } = await q('SELECT count(*)::int AS n FROM feedback_items WHERE user_id=$1 AND source=$2 AND NOT seen', [user.id, 'user']);
  const out = { feedback_updates: a.n };
  if (user.is_platform_admin) {
    const { rows: [b] } = await q(`SELECT count(*)::int AS n FROM feedback_items WHERE status='new'`);
    out.feedback_new = b.n;
  }
  return out;
}

export function mountFeedback(app, { UPLOAD_DIR }) {
  const F = express.Router();
  app.use('/api/feedback', F);
  const upload = uploader(UPLOAD_DIR);

  F.get('/mine', h(async (req, res) => {
    const { rows } = await q(`${ITEM_SQL} WHERE f.user_id=$1 AND f.source='user' ORDER BY f.created_at DESC LIMIT 200`, [req.user.id]);
    res.json({ items: await extras(rows) });
  }));

  F.post('/seen', h(async (req, res) => {
    await q(`UPDATE feedback_items SET seen=true WHERE user_id=$1 AND NOT seen`, [req.user.id]);
    res.json({ ok: true });
  }));

  // the public roadmap: approved items an admin has made public, with votes
  F.get('/roadmap', h(async (req, res) => {
    const { rows } = await q(
      `SELECT f.id, f.ref, f.kind, f.title, f.public_summary, f.lane, f.status, f.release, f.updated_at, f.decided_at,
              (SELECT count(*)::int FROM feedback_votes v WHERE v.item_id=f.id) AS votes,
              EXISTS(SELECT 1 FROM feedback_votes v WHERE v.item_id=f.id AND v.user_id=$1) AS voted,
              (f.user_id=$1 AND f.source='user') AS mine
         FROM feedback_items f
        WHERE f.public AND (f.status IN ('approved','in_progress') OR (f.status='done' AND f.updated_at > now() - interval '120 days'))
        ORDER BY f.updated_at DESC`, [req.user.id]);
    res.json({ items: rows.map(({ mine, ...r }) => ({ ...r, mine })) });
  }));

  // "Already asked for?" while someone types a title
  F.get('/similar', h(async (req, res) => {
    const s = String(req.query.q || '').slice(0, 200);
    if (s.trim().length < 4) return res.json({ items: [] });
    const { rows } = await q(
      `SELECT f.id, f.ref, f.kind, f.title, f.public_summary, f.lane, f.status,
              (SELECT count(*)::int FROM feedback_votes v WHERE v.item_id=f.id) AS votes,
              EXISTS(SELECT 1 FROM feedback_votes v WHERE v.item_id=f.id AND v.user_id=$1) AS voted
         FROM feedback_items f WHERE f.public AND f.status IN ('approved','in_progress')`, [req.user.id]);
    const items = rows.map((r) => ({ ...r, score: Math.max(similarity(s, r.title), similarity(s, r.public_summary) * 0.8) }))
      .filter((r) => r.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 5);
    res.json({ items });
  }));

  F.post('/', h(async (req, res) => {
    const b = req.body || {};
    need(USER_KINDS.includes(b.kind), 400, 'Choose what you’re sending: a problem, an improvement or a new feature.');
    const title = text(b.title, 140);
    need(title && title.length >= 4, 400, 'Give it a short title.');
    const description = text(b.description, 8000) || '';
    need(b.kind === 'bug' ? (description || text(b.steps, 10)) : description, 400, b.kind === 'bug' ? 'Say what went wrong.' : 'Say what you’d like and why.');
    const { rows: [n] } = await q(`SELECT count(*)::int AS n FROM feedback_items WHERE user_id=$1 AND created_at > now() - interval '1 day'`, [req.user.id]);
    need(n.n < PER_DAY, 429, 'You’ve sent a lot today. Please try again tomorrow.');
    let tid = UUID.test(b.tenant_id || '') ? b.tenant_id : null;
    if (tid) {
      const { rows } = await q('SELECT 1 FROM memberships WHERE user_id=$1 AND tenant_id=$2', [req.user.id, tid]);
      if (!rows.length) tid = null;
    }
    const page = text(b.page, 300);
    const area = areaForPage(page);
    const ctx = b.context && typeof b.context === 'object' ? Object.fromEntries(Object.entries(b.context).slice(0, 12).map(([k, v]) => [String(k).slice(0, 30), typeof v === 'boolean' ? v : String(v).slice(0, 300)])) : {};
    const { rows: [item] } = await q(
      `INSERT INTO feedback_items(source,kind,title,description,steps,expected,areas,page,context,priority,status,tenant_id,user_id)
       VALUES ('user',$1,$2,$3,$4,$5,$6,$7,$8,'normal','new',$9,$10) RETURNING id, ref`,
      [b.kind, title, description, b.kind === 'bug' ? text(b.steps, 4000) : null, b.kind === 'bug' ? text(b.expected, 4000) : null,
        JSON.stringify(area ? [area] : []), page, JSON.stringify(ctx), tid, req.user.id]);
    mailAdmins(`New ${KIND[b.kind].short.toLowerCase()} #${item.ref}: ${title}`,
      `${req.user.name} sent ${b.kind === 'bug' ? 'a problem report' : 'a request'}:\n\n${title}\n\n${description}`.slice(0, 4000), '/admin/feedback').catch(() => {});
    res.json({ item: (await extras([await one(item.id)]))[0] });
  }));

  const own = async (req) => {
    const item = await one(req.params.id);
    need(item.user_id === req.user.id && item.source === 'user', 404, 'Not found');
    return item;
  };

  F.post('/:id/files', upload.single('file'), h(async (req, res) => {
    let item;
    try {
      item = await own(req);
      need(['new', 'approved', 'in_progress'].includes(item.status), 400, 'This item is closed.');
    } catch (e) { if (req.file) fs.rmSync(req.file.path, { force: true }); throw e; }
    res.json({ file: await addFile(req, item, UPLOAD_DIR) });
  }));

  F.get('/files/:fid', h(async (req, res) => {
    need(UUID.test(req.params.fid), 404, 'Not found');
    const { rows: [f] } = await q('SELECT f.*, i.user_id FROM feedback_files f JOIN feedback_items i ON i.id=f.item_id WHERE f.id=$1', [req.params.fid]);
    need(f && (req.user.is_platform_admin || f.user_id === req.user.id), 404, 'Not found');
    res.setHeader('Content-Type', f.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
    res.sendFile(path.join(UPLOAD_DIR, f.storage_path));
  }));

  F.post('/:id/reply', h(async (req, res) => {
    const item = await own(req);
    const body = text(req.body?.body, 4000);
    need(body, 400, 'Type your answer.');
    need(OPEN_STATUSES.includes(item.status), 400, 'This item is closed.');
    await q('INSERT INTO feedback_comments(item_id,user_id,from_admin,body) VALUES ($1,$2,false,$3)', [item.id, req.user.id, body]);
    await q('UPDATE feedback_items SET updated_at=now() WHERE id=$1', [item.id]);
    mailAdmins(`Reply on #${item.ref}: ${item.title}`, `${req.user.name} wrote:\n\n${body}`, '/admin/feedback').catch(() => {});
    res.json({ item: (await extras([await one(item.id)]))[0] });
  }));

  F.post('/:id/withdraw', h(async (req, res) => {
    const item = await own(req);
    need(item.status === 'new', 400, 'Only items still waiting for review can be withdrawn.');
    await q(`UPDATE feedback_items SET status='withdrawn', updated_at=now() WHERE id=$1`, [item.id]);
    res.json({ ok: true });
  }));

  F.post('/:id/vote', h(async (req, res) => {
    const item = await one(req.params.id);
    need(item.public && ['approved', 'in_progress'].includes(item.status), 400, 'You can vote on items on the roadmap that aren’t done yet.');
    if (req.body?.on === false) await q('DELETE FROM feedback_votes WHERE item_id=$1 AND user_id=$2', [item.id, req.user.id]);
    else await q('INSERT INTO feedback_votes(item_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [item.id, req.user.id]);
    const { rows: [v] } = await q('SELECT count(*)::int AS n FROM feedback_votes WHERE item_id=$1', [item.id]);
    res.json({ votes: v.n, voted: req.body?.on !== false });
  }));
}

// ---------------------------------------------------------------- platform admins
const VIEWS = {
  inbox: `f.status='new'`,
  ideas: `f.status='draft'`,
  pipeline: `f.status IN ('approved','in_progress')`,
  done: `f.status='done'`,
  closed: `f.status IN ('declined','duplicate','withdrawn')`,
  all: 'true',
};

export function mountFeedbackAdmin(A, { UPLOAD_DIR }) {
  const upload = uploader(UPLOAD_DIR);

  A.get('/feedback', h(async (req, res) => {
    const view = VIEWS[req.query.view] ? req.query.view : 'inbox';
    const { rows } = await q(`${ITEM_SQL} WHERE ${VIEWS[view]} ORDER BY
      CASE f.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, f.created_at DESC LIMIT 500`);
    const { rows: counts } = await q(`SELECT status, count(*)::int AS n FROM feedback_items GROUP BY status`);
    const c = Object.fromEntries(counts.map((r) => [r.status, r.n]));
    res.json({
      view,
      items: await extras(rows, { admin: true }),
      counts: {
        inbox: c.new || 0, ideas: c.draft || 0, pipeline: (c.approved || 0) + (c.in_progress || 0), done: c.done || 0,
        closed: (c.declined || 0) + (c.duplicate || 0) + (c.withdrawn || 0),
      },
      github: { configured: githubConfigured(), repo: process.env.GITHUB_REPO || null, mention: process.env.CLAUDE_MENTION || '@claude' },
    });
  }));

  A.get('/feedback/:id', h(async (req, res) => {
    res.json({ item: (await extras([await one(req.params.id)], { admin: true }))[0] });
  }));

  const fields = (b, item = {}) => {
    const out = {};
    if ('kind' in b) { need(KIND[b.kind], 400, 'Unknown kind'); out.kind = b.kind; }
    if ('title' in b) { out.title = text(b.title, 140); need(out.title, 400, 'Give it a title.'); }
    for (const [k, max] of [['description', 8000], ['steps', 4000], ['expected', 4000], ['acceptance', 8000], ['public_summary', 600], ['release', 40]]) {
      if (k in b) out[k] = k === 'description' ? text(b[k], max) || '' : text(b[k], max);
    }
    if ('areas' in b) out.areas = JSON.stringify(cleanAreas(b.areas));
    if ('priority' in b) { need(PRIORITIES.includes(b.priority), 400, 'Unknown priority'); out.priority = b.priority; }
    if ('public' in b) out.public = !!b.public;
    if ('lane' in b && b.lane !== undefined) { need(b.lane === null || LANE[b.lane], 400, 'Unknown lane'); if (['approved', 'in_progress'].includes(item.status)) out.lane = b.lane; }
    return out;
  };
  const update = async (id, set) => {
    const keys = Object.keys(set);
    if (!keys.length) return;
    await q(`UPDATE feedback_items SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now() WHERE id=$1`, [id, ...keys.map((k) => set[k])]);
  };

  // an idea from a platform admin (starts as a draft)
  A.post('/feedback', h(async (req, res) => {
    const b = req.body || {};
    const set = fields({ kind: 'enhancement', priority: 'normal', ...b });
    need(set.title, 400, 'Give it a title.');
    const { rows: [item] } = await q(
      `INSERT INTO feedback_items(source,kind,title,description,acceptance,areas,priority,status,user_id,public,public_summary)
       VALUES ('admin',$1,$2,$3,$4,$5,$6,'draft',$7,false,$8) RETURNING id`,
      [set.kind, set.title, set.description || '', set.acceptance || null, set.areas || '[]', set.priority, req.user.id, set.public_summary || null]);
    await audit(req.user.id, 'feedback.idea', set.title, { id: item.id });
    res.json({ item: (await extras([await one(item.id)], { admin: true }))[0] });
  }));

  A.patch('/feedback/:id', h(async (req, res) => {
    const item = await one(req.params.id);
    await update(item.id, fields(req.body || {}, item));
    res.json({ item: (await extras([await one(item.id)], { admin: true }))[0] });
  }));

  A.delete('/feedback/:id', h(async (req, res) => {
    const item = await one(req.params.id);
    need(item.source === 'admin' && item.status === 'draft', 400, 'Only draft ideas can be deleted. Decline anything else.');
    const { rows: files } = await q('SELECT storage_path FROM feedback_files WHERE item_id=$1', [item.id]);
    await q('DELETE FROM feedback_items WHERE id=$1', [item.id]);
    for (const f of files) fs.rmSync(path.join(UPLOAD_DIR, f.storage_path), { force: true });
    await audit(req.user.id, 'feedback.delete', item.title, { id: item.id });
    res.json({ ok: true });
  }));

  A.post('/feedback/:id/files', upload.single('file'), h(async (req, res) => {
    let item;
    try { item = await one(req.params.id); } catch (e) { if (req.file) fs.rmSync(req.file.path, { force: true }); throw e; }
    res.json({ file: await addFile(req, item, UPLOAD_DIR) });
  }));

  // decisions and moves through the pipeline
  A.post('/feedback/:id/decide', h(async (req, res) => {
    const item = await one(req.params.id);
    const b = req.body || {};
    const note = text(b.note, 4000);
    const decided = { decided_by: req.user.id, decided_at: new Date() };
    const comment = (body) => q('INSERT INTO feedback_comments(item_id,user_id,from_admin,body) VALUES ($1,$2,true,$3)', [item.id, req.user.id, body]);
    switch (b.action) {
      case 'approve': {
        need(['draft', 'new', 'declined', 'duplicate', 'withdrawn'].includes(item.status), 400, 'Already approved — move it to another lane instead.');
        need(LANE[b.lane], 400, 'Choose Now, Next or Later.');
        // requests for improvements and features go on the public roadmap unless the admin says otherwise; bugs don't
        const pub = 'public' in b ? !!b.public : item.kind !== 'bug';
        await update(item.id, { status: 'approved', lane: b.lane, public: pub, decision_note: note, duplicate_of: null, ...decided });
        if (note) await comment(note);
        await tellSubmitter(item, `approved (${LANE[b.lane].label})`,
          `Your ${KIND[item.kind].short.toLowerCase()} "${item.title}" has been approved and added to the pipeline: ${LANE[b.lane].label} — ${LANE[b.lane].blurb.toLowerCase()}.${note ? `\n\n${note}` : ''}`);
        break;
      }
      case 'move':
        need(['approved', 'in_progress'].includes(item.status), 400, 'Approve it first.');
        need(LANE[b.lane], 400, 'Choose Now, Next or Later.');
        await update(item.id, { lane: b.lane });
        break;
      case 'decline':
        need(note, 400, 'Say why, so the person who sent it knows.');
        await update(item.id, { status: 'declined', lane: null, decision_note: note, ...decided });
        await comment(note);
        await tellSubmitter(item, 'not going ahead', `Thanks for "${item.title}". We won't be going ahead with it:\n\n${note}`);
        break;
      case 'duplicate': {
        need(UUID.test(b.duplicate_of || '') && b.duplicate_of !== item.id, 400, 'Choose the item it duplicates.');
        const target = await one(b.duplicate_of);
        await update(item.id, { status: 'duplicate', lane: null, duplicate_of: target.id, decision_note: note, ...decided });
        // the person's interest counts towards the original
        if (item.user_id && item.source === 'user') await q('INSERT INTO feedback_votes(item_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [target.id, item.user_id]);
        await comment(note || `Already requested as #${target.ref}: ${target.title}.`);
        await tellSubmitter(item, 'already requested', `"${item.title}" has already been requested as #${target.ref} (${target.title}). We've added your vote to it.${note ? `\n\n${note}` : ''}`);
        break;
      }
      case 'start':
        need(['approved', 'in_progress'].includes(item.status), 400, 'Approve it first.');
        await update(item.id, { status: 'in_progress', lane: item.lane || 'now' });
        await tellSubmitter(item, 'in progress', `Work has started on "${item.title}".`);
        break;
      case 'done': {
        need(['approved', 'in_progress'].includes(item.status), 400, 'Only items in the pipeline can be marked done.');
        const release = text(b.release, 40);
        await update(item.id, { status: 'done', release, ...decided });
        if (note) await comment(note);
        await tellSubmitter(item, 'done', `"${item.title}" is done${release ? ` (release ${release})` : ''}. Open the app to get the latest version.${note ? `\n\n${note}` : ''}`);
        break;
      }
      case 'reopen':
        await update(item.id, { status: item.source === 'admin' ? 'draft' : 'new', lane: null, duplicate_of: null });
        break;
      case 'ask':
        need(note, 400, 'Type your question.');
        await comment(note);
        await q('UPDATE feedback_items SET updated_at=now() WHERE id=$1', [item.id]);
        await tellSubmitter(item, 'a question for you', `About "${item.title}":\n\n${note}\n\nAnswer it in the app under Feedback & roadmap → My submissions.`);
        break;
      default:
        throw new HttpError(400, 'Unknown action');
    }
    await audit(req.user.id, `feedback.${b.action}`, item.title, { id: item.id, ref: item.ref, lane: b.lane, note: note?.slice(0, 200) });
    res.json({ item: (await extras([await one(item.id)], { admin: true }))[0] });
  }));

  // send to Claude: a GitHub issue that mentions Claude (the brief is built in the app, so it can be edited first)
  A.post('/feedback/:id/claude', h(async (req, res) => {
    const item = await one(req.params.id);
    need(['approved', 'in_progress'].includes(item.status), 400, 'Approve it into the pipeline before sending it to Claude.');
    const brief = text(req.body?.brief, 60000);
    need(brief, 400, 'The brief is empty.');
    let set = { status: 'in_progress', lane: item.lane || 'now', sent_at: new Date(), sent_by: req.user.id };
    if (req.body?.manual) {
      // copied into a Claude Code session by hand
    } else {
      need(githubConfigured(), 400, 'GitHub isn’t set up on this server (GITHUB_TOKEN and GITHUB_REPO). Copy the brief instead.');
      const repo = process.env.GITHUB_REPO || 'example/raceops';
      const mention = process.env.CLAUDE_MENTION || '@claude';
      const labels = (process.env.GITHUB_ISSUE_LABELS ?? 'raceops-feedback').split(',').map((x) => x.trim()).filter(Boolean);
      const body = `${brief}\n\n---\n${mention} please action this in this repository, following CLAUDE.md, and open a pull request.`;
      const issue = item.github_issue
        ? await github('POST', `/repos/${repo}/issues/${item.github_issue}/comments`, { body: `Updated brief:\n\n${body}` }).then(() => ({ number: item.github_issue, html_url: item.github_url, state: item.github_state }))
        : await github('POST', `/repos/${repo}/issues`, { title: `#${item.ref} ${KIND[item.kind].short}: ${item.title}`, body, labels });
      set = { ...set, github_issue: issue.number, github_url: issue.html_url, github_state: issue.state || 'open' };
    }
    await update(item.id, set);
    if (item.status !== 'in_progress') await tellSubmitter(item, 'in progress', `Work has started on "${item.title}".`);
    await audit(req.user.id, 'feedback.claude', item.title, { id: item.id, ref: item.ref, issue: set.github_url || 'copied' });
    res.json({ item: (await extras([await one(item.id)], { admin: true }))[0] });
  }));

  A.post('/feedback/:id/github', h(async (req, res) => {
    const item = await one(req.params.id);
    need(item.github_issue && githubConfigured(), 400, 'This item has no GitHub issue.');
    const repo = process.env.GITHUB_REPO || 'example/raceops';
    const issue = await github('GET', `/repos/${repo}/issues/${item.github_issue}`);
    await update(item.id, { github_state: issue.state === 'closed' ? (issue.state_reason === 'not_planned' ? 'closed (not planned)' : 'closed') : 'open' });
    res.json({ item: (await extras([await one(item.id)], { admin: true }))[0] });
  }));
}

