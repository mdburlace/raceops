// Practice teams: a team loaded with demo data (shared/practiceData.js) for training. A platform admin
// creates one (Teams & licences → Practice team); its owner, or anyone who can edit team settings, can
// reset it to the original demo data. Resetting removes the team's records for good and changes its data_epoch,
// so every device downloads the team again.
import crypto from 'node:crypto';
import { HttpError } from './auth.js';
import { tx } from './db.js';
import { can } from '../../shared/catalog.js';
import { practiceData } from '../../shared/practiceData.js';

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Load the demo data into a team (inside a transaction). Returns how many records were added. */
export async function seedPractice(c, tid, userId = null) {
  const { rows: forms } = await c.query(`SELECT id, data FROM records WHERE tenant_id=$1 AND type='form' AND NOT deleted`, [tid]);
  const form = (target) => {
    const list = forms.filter((f) => f.data.target === target);
    return (list.find((f) => f.data.is_default) || list[0])?.id || null;
  };
  const recs = practiceData({ form, today: new Date(), uuid: () => crypto.randomUUID() });
  for (const r of recs) {
    await c.query(`INSERT INTO records(id,tenant_id,type,data,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$5)`, [r.id, tid, r.type, JSON.stringify(r.data), userId]);
    await c.query(`INSERT INTO record_history(record_id,tenant_id,type,op,outcome,data,user_id,client_updated_at) VALUES ($1,$2,$3,'create','applied',$4,$5,now())`,
      [r.id, tid, r.type, JSON.stringify(r.data), userId]);
  }
  return recs.length;
}

/** Mark a new team as a practice team and load the demo data. */
export async function makePractice(c, tid, userId) {
  await c.query(`UPDATE tenants SET settings = COALESCE(settings,'{}'::jsonb) || '{"practice": true}'::jsonb WHERE id=$1`, [tid]);
  return seedPractice(c, tid, userId);
}

export function mountPractice(T) {
  // start again: everything the trainees added or changed goes, and the demo data comes back
  T.post('/practice/reset', h(async (req, res) => {
    if (!(can(req.role, 'team.manage') || req.user.is_platform_admin)) throw new HttpError(403, 'Only the team owner (or someone who can edit team settings) can reset it.');
    const n = await tx(async (c) => {
      const { rows: [t] } = await c.query('SELECT settings FROM tenants WHERE id=$1', [req.tid]);
      if (!t?.settings?.practice) throw new HttpError(400, 'Only a practice team can be reset.');
      // a reset isn't a deletion anyone needs to recover: the demo data goes for good (not to Recently deleted),
      // and a new data_epoch makes every device drop its copy and download the team again
      const gone = `SELECT id FROM records WHERE tenant_id=$1 AND type NOT IN ('form','gear_list')`;
      await c.query(`DELETE FROM attachments WHERE tenant_id=$1 AND record_id IN (${gone})`, [req.tid]);
      await c.query(`DELETE FROM record_history WHERE tenant_id=$1 AND record_id IN (${gone})`, [req.tid]);
      await c.query(`DELETE FROM records WHERE tenant_id=$1 AND type NOT IN ('form','gear_list')`, [req.tid]);
      await c.query(`UPDATE tenants SET settings = COALESCE(settings,'{}'::jsonb) || jsonb_build_object('data_epoch', gen_random_uuid()::text) WHERE id=$1`, [req.tid]);
      await c.query(`DELETE FROM calendar_requests WHERE tenant_id=$1`, [req.tid]);
      await c.query(`DELETE FROM team_notices WHERE tenant_id=$1`, [req.tid]);
      return seedPractice(c, req.tid, req.user.id);
    });
    res.json({ ok: true, records: n });
  }));
}
