// Long requests (reading a 10-page dyno PDF or a season calendar with the AI can take a minute or
// more) run in the background so a reverse proxy's timeout (pfSense HAProxy: 30 s by default,
// Cloudflare: 100 s) can't cut them off. The app sends { async: true }, gets { job } straight
// back, and polls GET /t/:tid/jobs/:id until the answer is ready.
import crypto from 'node:crypto';
import { HttpError } from './auth.js';

const jobs = new Map();
const KEEP_MS = 30 * 60_000;
setInterval(() => { const old = Date.now() - KEEP_MS; for (const [id, j] of jobs) if (j.at < old) jobs.delete(id); }, 60_000).unref();

const errorBody = (err) => {
  const status = err.status || 500;
  if (!(err instanceof HttpError)) console.error(err);
  return { code: status, body: { error: err instanceof HttpError ? err.message : 'Server error' } };
};

/** Wrap a route handler (already wrapped with h()) so it can run as a background job. */
export function backgroundable(handler) {
  return (req, res, next) => {
    if (req.body?.async !== true) return handler(req, res, next);
    const id = crypto.randomUUID();
    const job = { tid: req.tid, user: req.user.id, at: Date.now(), done: false };
    jobs.set(id, job);
    const fake = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      set() { return this; },
      json(body) { Object.assign(job, { done: true, code: this.statusCode, body }); return this; },
    };
    const fail = (err) => { if (err) Object.assign(job, { done: true, ...errorBody(err) }); };
    Promise.resolve(handler(req, fake, fail)).catch(fail);
    res.status(202).json({ job: id, running: true });
  };
}

export function mountJobs(T) {
  T.get('/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || job.tid !== req.tid || job.user !== req.user.id) {
      return res.status(404).json({ error: 'That request was lost (the server may have restarted). Please try again.' });
    }
    if (!job.done) return res.json({ job: req.params.id, running: true });
    jobs.delete(req.params.id);
    res.status(job.code).json(job.body);
  });
}
