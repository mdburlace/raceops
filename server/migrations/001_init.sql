CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  is_platform_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  racing_type text NOT NULL DEFAULT 'winged_sprint',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every syncable business object (cars, events, setups, maintenance logs, assets,
-- schedules, measurements, form definitions, and future dyno/gear/tire/engine data)
-- lives here. `seq` increases on every write and drives incremental sync.
CREATE SEQUENCE IF NOT EXISTS record_seq;

CREATE TABLE IF NOT EXISTS records (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  client_updated_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL DEFAULT nextval('record_seq')
);
CREATE INDEX IF NOT EXISTS records_tenant_seq ON records (tenant_id, seq);
CREATE INDEX IF NOT EXISTS records_tenant_type ON records (tenant_id, type);

CREATE TABLE IF NOT EXISTS record_history (
  id bigserial PRIMARY KEY,
  record_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL,
  op text NOT NULL,             -- create | update | delete
  outcome text NOT NULL,        -- applied | superseded
  data jsonb NOT NULL,
  user_id uuid REFERENCES users(id),
  client_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS record_history_record ON record_history (record_id, id);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id uuid NOT NULL,
  filename text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  storage_path text NOT NULL,
  caption text NOT NULL DEFAULT '',
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_record ON attachments (tenant_id, record_id);

CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now());
