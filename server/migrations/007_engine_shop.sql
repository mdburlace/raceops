-- Engine shop: give existing roles access to jobs and customers in line with their engine access.
UPDATE roles SET permissions = permissions || '["jobs.view","jobs.edit","jobs.delete","customers.view","customers.edit","customers.delete"]'::jsonb
 WHERE NOT is_owner AND permissions ? 'engines.delete' AND NOT permissions ? 'jobs.view';
UPDATE roles SET permissions = permissions || '["jobs.view","jobs.edit","customers.view"]'::jsonb
 WHERE NOT is_owner AND permissions ? 'engines.edit' AND NOT permissions ? 'jobs.view';
UPDATE roles SET permissions = permissions || '["jobs.view","customers.view"]'::jsonb
 WHERE NOT is_owner AND permissions ? 'engines.view' AND NOT permissions ? 'jobs.view';
