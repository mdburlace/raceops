-- Engine shops sharing an engine with its owner: a no-login link, and/or a link to the owner's RaceOps team.
CREATE TABLE IF NOT EXISTS engine_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,   -- the shop
  engine_id uuid NOT NULL,                                           -- the shop's engine asset record
  customer_id uuid,                                                  -- owner when the link was made
  token text NOT NULL UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text,
  last_viewed_at timestamptz,
  views int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS engine_shares_engine ON engine_shares(tenant_id, engine_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS engine_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  engine_id uuid NOT NULL,
  customer_id uuid,
  code text NOT NULL UNIQUE,                      -- invite code the team uses to accept
  status text NOT NULL DEFAULT 'pending',         -- pending | active | ended
  team_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  team_asset_id uuid,                             -- the team's own engine asset whose laps are shared
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  snapshot jsonb                                  -- the team's copy of the build history when the link ended
);
CREATE INDEX IF NOT EXISTS engine_links_engine ON engine_links(shop_tenant_id, engine_id);
CREATE INDEX IF NOT EXISTS engine_links_team ON engine_links(team_tenant_id);
