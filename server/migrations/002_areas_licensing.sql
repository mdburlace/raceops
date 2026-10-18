-- Phase 2: licensed features per team, and area-level access in roles.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'pro';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Give existing roles entry to the areas their current permissions already imply.
UPDATE roles SET permissions = permissions || '["area.track"]'::jsonb
 WHERE NOT is_owner AND NOT permissions ? 'area.track'
   AND permissions ?| array['events.view','setups.view','gears.view'];
UPDATE roles SET permissions = permissions || '["area.workshop"]'::jsonb
 WHERE NOT is_owner AND NOT permissions ? 'area.workshop'
   AND permissions ?| array['maintenance.view','assets.view','dyno.view'];
UPDATE roles SET permissions = permissions || '["area.engines"]'::jsonb
 WHERE NOT is_owner AND NOT permissions ? 'area.engines'
   AND permissions ? 'engines.view';
UPDATE roles SET permissions = permissions || '["area.team"]'::jsonb
 WHERE NOT is_owner AND NOT permissions ? 'area.team'
   AND permissions ?| array['forms.manage','members.manage','roles.manage','team.manage'];

-- New Phase 2 modules for the built-in roles.
UPDATE roles SET permissions = permissions || '["trackside.view","trackside.edit","trackside.delete","reports.view"]'::jsonb
 WHERE NOT is_owner AND name = 'Crew Chief';
UPDATE roles SET permissions = permissions || '["trackside.view","trackside.edit"]'::jsonb
 WHERE NOT is_owner AND name = 'Mechanic';
