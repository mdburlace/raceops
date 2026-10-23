-- Team roles and business modules (phase 5).
-- A member can hold more than one role: role_id stays the main role (owners are always a main role),
-- extra_role_ids adds others, and the member gets everything any of them allows.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS extra_role_ids uuid[] NOT NULL DEFAULT '{}';

-- Sponsor portal: a no-login, read-only page for one sponsor (their deal, what was delivered, photos).
CREATE TABLE IF NOT EXISTS sponsor_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sponsor_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  views int NOT NULL DEFAULT 0,
  last_viewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS sponsor_portals_sponsor ON sponsor_portals(tenant_id, sponsor_id) WHERE revoked_at IS NULL;

-- Parts orders for existing roles (as new teams get them): roles that run setups (crew chiefs) get them in
-- full with the right to approve and to see costs; roles that edit maintenance or assets can raise them.
UPDATE roles SET permissions = permissions || '["purchases.view","purchases.edit","purchases.delete","purchases.approve","money.view"]'::jsonb
 WHERE NOT is_owner AND permissions ? 'setups.delete' AND NOT permissions ? 'purchases.view';
UPDATE roles SET permissions = permissions || '["purchases.view","purchases.edit"]'::jsonb
 WHERE NOT is_owner AND (permissions ? 'maintenance.edit' OR permissions ? 'assets.edit') AND NOT permissions ? 'purchases.view';
