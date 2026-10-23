-- Recently deleted: when and by whom a record was deleted, how long deleted records are kept for each team,
-- and a team's request to keep them for a different time (decided by a platform admin).
ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL;
UPDATE records SET deleted_at = updated_at, deleted_by = updated_by WHERE deleted AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS records_deleted ON records(tenant_id, deleted_at) WHERE deleted;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_retention_days integer;   -- NULL = the platform's default
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS retention_request jsonb;          -- { days, note, by, by_name, at }

-- the new admin right: owners have everything; give it to roles that can edit team settings
UPDATE roles SET permissions = permissions || '["trash.manage"]'::jsonb
 WHERE permissions ? 'team.manage' AND NOT permissions ? 'trash.manage';

-- every way a record gets deleted (sync, merges, server jobs) stamps the time; undeleting clears it
CREATE OR REPLACE FUNCTION records_deleted_stamp() RETURNS trigger AS $$
BEGIN
  IF NEW.deleted AND (TG_OP = 'INSERT' OR NOT OLD.deleted) THEN
    NEW.deleted_at := COALESCE(NEW.deleted_at, now());
  ELSIF NOT NEW.deleted THEN
    NEW.deleted_at := NULL;
    NEW.deleted_by := NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS records_deleted_stamp ON records;
CREATE TRIGGER records_deleted_stamp BEFORE INSERT OR UPDATE OF deleted ON records
  FOR EACH ROW EXECUTE FUNCTION records_deleted_stamp();
