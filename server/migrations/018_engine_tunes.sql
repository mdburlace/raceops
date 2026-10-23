-- Engine tune sheets (record type engine_tune, module enginetunes) and workshop engine checks (engine_check,
-- module enginechecks): rights for existing roles.
-- Tunes: roles that can delete engine builds or setup sheets get full rights; roles that edit builds, setups or
-- car maintenance can view and edit; roles that read setups or builds can read tunes (the jetting at the track).
UPDATE roles SET permissions = permissions || '["enginetunes.view","enginetunes.edit","enginetunes.delete"]'::jsonb
 WHERE (permissions ? 'engines.delete' OR permissions ? 'setups.delete') AND NOT permissions ? 'enginetunes.view';
UPDATE roles SET permissions = permissions || '["enginetunes.view","enginetunes.edit"]'::jsonb
 WHERE (permissions ? 'engines.edit' OR permissions ? 'setups.edit' OR permissions ? 'maintenance.edit') AND NOT permissions ? 'enginetunes.view';
UPDATE roles SET permissions = permissions || '["enginetunes.view"]'::jsonb
 WHERE (permissions ? 'setups.view' OR permissions ? 'engines.view') AND NOT permissions ? 'enginetunes.view';
-- Engine checks: like car maintenance and engine builds.
UPDATE roles SET permissions = permissions || '["enginechecks.view","enginechecks.edit","enginechecks.delete"]'::jsonb
 WHERE (permissions ? 'maintenance.delete' OR permissions ? 'engines.delete') AND NOT permissions ? 'enginechecks.view';
UPDATE roles SET permissions = permissions || '["enginechecks.view","enginechecks.edit"]'::jsonb
 WHERE (permissions ? 'maintenance.edit' OR permissions ? 'engines.edit') AND NOT permissions ? 'enginechecks.view';
UPDATE roles SET permissions = permissions || '["enginechecks.view"]'::jsonb
 WHERE (permissions ? 'maintenance.view' OR permissions ? 'engines.view') AND NOT permissions ? 'enginechecks.view';
