-- Calendars: roles that can see / edit / delete events get the same rights on the new Calendars module.
UPDATE roles SET permissions = permissions || '["calendar.view"]'::jsonb
 WHERE NOT is_owner AND permissions ? 'events.view' AND NOT permissions ? 'calendar.view';
UPDATE roles SET permissions = permissions || '["calendar.edit"]'::jsonb
 WHERE NOT is_owner AND permissions ? 'events.edit' AND NOT permissions ? 'calendar.edit';
UPDATE roles SET permissions = permissions || '["calendar.delete"]'::jsonb
 WHERE NOT is_owner AND permissions ? 'events.delete' AND NOT permissions ? 'calendar.delete';
