-- Requests from teams to the platform admin for the shared calendars: send a team's own series,
-- track or dates (with the events behind them) to the shared calendars, or change a shared series,
-- track or date. Moderated by a platform admin; the team sees the outcome.
CREATE TABLE IF NOT EXISTS calendar_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,              -- 'share' | 'change'
  subject_type text NOT NULL,      -- share: 'series' | 'track' | 'dates'; change: 'series' | 'track' | 'fixture'
  subject_id uuid,                 -- share: the team's series / track; change: the shared record
  title text NOT NULL,
  payload jsonb NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',   -- pending | approved | partly_approved | rejected | withdrawn
  decision jsonb,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  seen boolean NOT NULL DEFAULT true,       -- false until the team has seen the decision
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_requests_status ON calendar_requests(status);
CREATE INDEX IF NOT EXISTS calendar_requests_team ON calendar_requests(tenant_id, created_at DESC);
