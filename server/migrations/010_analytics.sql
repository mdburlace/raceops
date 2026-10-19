-- Analytics: give existing roles that can read setups or assets the new "Analytics → view" right.
UPDATE roles SET permissions = permissions || '["analytics.view"]'::jsonb
 WHERE NOT is_owner AND (permissions ? 'setups.view' OR permissions ? 'assets.view') AND NOT permissions ? 'analytics.view';
