-- Global (cross-team) records such as the track directory and shared contacts have no tenant.
ALTER TABLE records ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE record_history ALTER COLUMN tenant_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS records_global_seq ON records (seq) WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS records_global_track_ext ON records ((data->'values'->>'ext_id')) WHERE tenant_id IS NULL AND type = 'track';

-- Tracks, series and contacts for existing roles.
UPDATE roles SET permissions = permissions || '["tracks.view"]'::jsonb
 WHERE NOT is_owner AND NOT permissions ? 'tracks.view' AND permissions ? 'events.view';
UPDATE roles SET permissions = permissions || '["tracks.edit"]'::jsonb
 WHERE NOT is_owner AND NOT permissions ? 'tracks.edit' AND permissions ? 'events.edit';
UPDATE roles SET permissions = permissions || '["contacts.view"]'::jsonb
 WHERE NOT is_owner AND NOT permissions ? 'contacts.view' AND permissions ? 'events.view';
UPDATE roles SET permissions = permissions || '["contacts.edit","contacts.delete","tracks.delete"]'::jsonb
 WHERE NOT is_owner AND name = 'Crew Chief';
