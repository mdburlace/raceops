-- Member photos: { path (under UPLOAD_DIR/users), at, by }. The team photo is kept in tenants.settings.photo.
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo jsonb;
