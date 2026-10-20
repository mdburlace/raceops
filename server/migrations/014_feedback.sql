-- Feedback & ideas: bug reports and requests from users, ideas captured by platform admins, one pipeline
-- (review → Now / Next / Later → in progress → done), a public roadmap with votes, and sending an item to
-- Claude (a GitHub issue for the Claude Code GitHub Action, plus a copyable brief).
CREATE TABLE IF NOT EXISTS feedback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref serial,                                 -- short number people can quote (#42)
  source text NOT NULL,                       -- user | admin
  kind text NOT NULL,                         -- bug | enhancement | feature | change
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  steps text,                                 -- bugs: what you did
  expected text,                              -- bugs: what you expected / what happened instead
  acceptance text,                            -- admin: what "done" looks like
  areas jsonb NOT NULL DEFAULT '[]'::jsonb,   -- functionality areas, e.g. ["module:setups", "system:sync"]
  page text,                                  -- the screen it was reported from
  context jsonb NOT NULL DEFAULT '{}'::jsonb, -- device, browser, sync state, app version
  priority text NOT NULL DEFAULT 'normal',    -- low | normal | high | critical
  status text NOT NULL DEFAULT 'new',         -- draft | new | approved | in_progress | done | declined | duplicate | withdrawn
  lane text,                                  -- when approved: now | next | later
  public boolean NOT NULL DEFAULT false,      -- shown on the roadmap
  public_summary text,                        -- what the roadmap shows (never the private details)
  duplicate_of uuid REFERENCES feedback_items(id) ON DELETE SET NULL,
  decision_note text,                         -- shown to the submitter
  release text,                               -- version it shipped in
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  sent_at timestamptz,                        -- sent to Claude
  sent_by uuid REFERENCES users(id) ON DELETE SET NULL,
  github_issue integer,
  github_url text,
  github_state text,
  seen boolean NOT NULL DEFAULT true,         -- false until the submitter has seen the latest change
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_items_status ON feedback_items(status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_items_user ON feedback_items(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback_votes (
  item_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

CREATE TABLE IF NOT EXISTS feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  from_admin boolean NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_comments_item ON feedback_comments(item_id, created_at);

CREATE TABLE IF NOT EXISTS feedback_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  storage_path text NOT NULL,                 -- relative to UPLOAD_DIR (feedback/<uuid>)
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
