-- Backups: where they go (targets), when they run (plans), and every backup made (runs).
-- tenant_id NULL = the platform's own (full backups, and the default for team backups).

CREATE TABLE IF NOT EXISTS backup_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL,                          -- local | s3 | gdrive | dropbox | onedrive
  config jsonb NOT NULL DEFAULT '{}'::jsonb,   -- folder, bucket, endpoint… (nothing secret)
  secret text,                                 -- access keys / refresh token, encrypted (backupFile.js seal)
  connected_as text,                           -- shown only: which account it's connected to
  last_ok_at timestamptz,
  last_error text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backup_targets_tenant ON backup_targets(tenant_id);

-- scope: full (the whole platform) | teams (the default for every team without its own) | team (one team's own)
CREATE TABLE IF NOT EXISTS backup_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  target_id uuid REFERENCES backup_targets(id) ON DELETE SET NULL,
  frequency text NOT NULL DEFAULT 'off',       -- off | daily | weekly | monthly
  at_hour integer NOT NULL DEFAULT 2,           -- server local time (TZ)
  weekday integer NOT NULL DEFAULT 0,           -- 0 = Sunday (weekly)
  monthday integer NOT NULL DEFAULT 1,          -- 1–28 (monthly)
  keep integer NOT NULL DEFAULT 7,              -- scheduled backups kept per team / platform
  next_run_at timestamptz,
  last_run_at timestamptz,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS backup_plans_one ON backup_plans(scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,                          -- full | team
  kind text NOT NULL DEFAULT 'backup',          -- backup | export
  trigger text NOT NULL,                        -- manual | scheduled | pre-restore | download
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  tenant_name text,
  target_id uuid REFERENCES backup_targets(id) ON DELETE SET NULL,
  target_name text,
  status text NOT NULL DEFAULT 'running',       -- running | ok | failed | removed
  file_name text,
  remote_ref text,
  size bigint,
  encrypted boolean NOT NULL DEFAULT false,
  format text,
  counts jsonb,
  error text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS backup_runs_scope ON backup_runs(scope, tenant_id, started_at DESC);

-- the new admin right: owners have everything; give it to roles that can edit team settings
UPDATE roles SET permissions = permissions || '["backup.manage"]'::jsonb
 WHERE permissions ? 'team.manage' AND NOT permissions ? 'backup.manage';
