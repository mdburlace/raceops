-- Shared calendars, round two: feed updates (requests from the server, not a team), questions on
-- requests, official teams for a series or track, team notices (followed series/tracks changing),
-- and official iCal feeds for a shared series or track.
ALTER TABLE calendar_requests ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE calendar_requests ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'team';   -- team | feed | official

CREATE TABLE IF NOT EXISTS calendar_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES calendar_requests(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  from_admin boolean NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_request_messages_req ON calendar_request_messages(request_id, created_at);

CREATE TABLE IF NOT EXISTS calendar_officials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,              -- series | track
  entity_id uuid NOT NULL,
  auto_approve boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity_id)
);

CREATE TABLE IF NOT EXISTS team_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,                     -- follow | official
  title text NOT NULL,
  body text,
  link text,
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_notices_team ON team_notices(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS calendar_feeds (
  entity_id uuid PRIMARY KEY,             -- the shared series or track
  entity_type text NOT NULL,
  url text NOT NULL,
  last_checked timestamptz,
  last_status text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
