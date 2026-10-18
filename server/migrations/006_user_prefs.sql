-- Per-user preferences (theme, custom themes, collapsed sidebar sections). Follows the user across devices.
ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
