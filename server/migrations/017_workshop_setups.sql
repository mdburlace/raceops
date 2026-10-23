-- Workshop setup sheets (record type shop_setup, module shopsetups): rights for existing roles.
-- Roles that edit At the Track setup sheets get full rights; roles that work on the cars in the workshop
-- (maintenance or assets) can view and edit; roles that can only read setup sheets can read these too.
UPDATE roles SET permissions = permissions || '["shopsetups.view","shopsetups.edit","shopsetups.delete"]'::jsonb
 WHERE permissions ? 'setups.edit' AND NOT permissions ? 'shopsetups.view';
UPDATE roles SET permissions = permissions || '["shopsetups.view","shopsetups.edit"]'::jsonb
 WHERE (permissions ? 'maintenance.edit' OR permissions ? 'assets.edit') AND NOT permissions ? 'shopsetups.view';
UPDATE roles SET permissions = permissions || '["shopsetups.view"]'::jsonb
 WHERE permissions ? 'setups.view' AND NOT permissions ? 'shopsetups.view';
