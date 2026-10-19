-- The team decides, per linked engine, whether its laps count on the engine shop's service tracker.
ALTER TABLE engine_links ADD COLUMN IF NOT EXISTS feed_lifecycle boolean NOT NULL DEFAULT false;
