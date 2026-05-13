-- Version-based optimistic concurrency for task mutations.
--
-- Existing rows start at version 0. The existing updated_at trigger remains
-- the single DB-level mutation hook and now also bumps version on every task
-- UPDATE, so app actions can compare a stable integer instead of timestamp
-- round-trips.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION tasks_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := date_trunc('milliseconds', clock_timestamp());
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
