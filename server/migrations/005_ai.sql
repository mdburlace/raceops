-- AI assistant: usage/cost log, per-team allowance, and the new permission for existing roles.
CREATE TABLE IF NOT EXISTS ai_usage (
  id bigserial PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text NOT NULL,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cache_read_tokens int NOT NULL DEFAULT 0,
  cache_write_tokens int NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  error text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_tenant_at ON ai_usage (tenant_id, at);
CREATE INDEX IF NOT EXISTS ai_usage_at ON ai_usage (at DESC);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_budget_usd numeric(10,2);

UPDATE roles SET permissions = permissions || '["ai.view"]'::jsonb
 WHERE NOT is_owner AND NOT permissions ? 'ai.view';
