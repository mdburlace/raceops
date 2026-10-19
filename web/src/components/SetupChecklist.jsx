// "Set up your team" — the getting-started checklist on Home, also shown in Help → Getting started.
// Steps tick themselves from the team's data; each links to where to do it and to its guide article.
import { Link } from 'react-router-dom';
import { checklistFor } from '@shared/guideChecklist.js';
import { teamType } from '@shared/shop.js';
import { membersList, useTeamData } from '../lib/data.js';
import { useSession } from '../lib/session.jsx';

export function useChecklist() {
  const { membership, can } = useSession();
  const data = useTeamData();
  if (!data || !membership) return null;
  const admin = membership.role?.is_owner || ['members.manage', 'roles.manage', 'forms.manage', 'team.manage'].some((p) => can(p));
  const steps = checklistFor({ list: data.list, settings: membership.settings || {}, members: membersList().length, teamType: teamType(membership) });
  return { admin, steps, done: steps.filter((s) => s.done).length };
}

/** inHelp: shown inside the Getting started article — always visible, with a way to bring it back to Home. */
export function SetupChecklist({ inHelp = false }) {
  const { prefs, setPrefs, tid } = useSession();
  const c = useChecklist();
  if (!c) return null;
  const hidden = (prefs.hidden_checklists || []).includes(tid);
  if (!inHelp && (!c.admin || hidden || c.done === c.steps.length)) return null;
  const toggle = (hide) => setPrefs({ hidden_checklists: hide ? [...new Set([...(prefs.hidden_checklists || []), tid])] : (prefs.hidden_checklists || []).filter((x) => x !== tid) });
  const pct = Math.round((c.done / c.steps.length) * 100);
  return (
    <section className="card onboarding setup-checklist" data-testid="setup-checklist">
      <div className="card-head">
        <h3>Set up your team</h3>
        <span className="muted small">{c.done} of {c.steps.length} done</span>
        {!inHelp && <button type="button" className="btn small ghost" onClick={() => toggle(true)}>Hide</button>}
      </div>
      <div className="sc-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress"><span style={{ width: `${pct}%` }} /></div>
      <ol className="sc-list">
        {c.steps.map((s) => (
          <li key={s.id} className={s.done ? 'done' : ''}>
            <span className="sc-tick" aria-hidden="true">{s.done ? '✓' : ''}</span>
            {s.done ? <span className="sc-label">{s.label}</span> : <Link className="sc-label" to={s.link}>{s.label}</Link>}
            <Link className="sc-how small" to={`/help/${s.article}`}>How?</Link>
          </li>
        ))}
      </ol>
      {inHelp && hidden && <button type="button" className="btn small" onClick={() => toggle(false)}>Show the setup checklist on Home again</button>}
      {inHelp && !hidden && <p className="muted small">{c.admin ? 'This checklist shows on Home until every step is done.' : 'Owners and team admins see this checklist on Home.'}</p>}
    </section>
  );
}
