-- Drop the `note` task type. Existing note rows (and their attachments,
-- events, and per-user preference rows) are deleted; the enum value is
-- removed by renaming the old enum, casting the column, and dropping the
-- old type. Postgres has no direct `ALTER TYPE ... DROP VALUE`.
--
-- Constraints and partial indexes that reference the column's old enum type
-- via literal comparisons (`type = 'custom'`, `type <> 'custom'`) have to be
-- dropped before the column-type swap and recreated after, because the
-- literals are bound to the old enum type at constraint-definition time.
--
-- The migrate.ts runner wraps each file in BEGIN/COMMIT, so no transaction
-- markers here.

-- 1. Wipe rows that reference the value.
DELETE FROM tasks WHERE type = 'note';
DELETE FROM user_preferences WHERE task_type = 'note';

-- 2. Drop constraints/indexes that compare `type` against a literal.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_custom_columns_ck;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_delivered_only_custom_ck;
DROP INDEX IF EXISTS tasks_active_deadline_idx;

-- 3. Re-create the enum without 'note'.
ALTER TYPE task_type RENAME TO task_type__old;
CREATE TYPE task_type AS ENUM ('custom', 'content_task');

-- 4. Switch columns that use the enum to the new type.
ALTER TABLE tasks
  ALTER COLUMN type TYPE task_type
  USING type::text::task_type;

ALTER TABLE user_preferences
  ALTER COLUMN task_type TYPE task_type
  USING task_type::text::task_type;

-- 5. Drop the orphan enum.
DROP TYPE task_type__old;

-- 6. Re-add the constraints and the partial index against the new enum.
ALTER TABLE tasks
  ADD CONSTRAINT tasks_custom_columns_ck CHECK (
    (type = 'custom') OR (
      buyer_handle IS NULL AND
      buyer_display_name IS NULL AND
      platform IS NULL AND
      payment_model IS NULL AND
      amount_cents IS NULL AND
      amount_collected_cents IS NULL AND
      duration_min_seconds IS NULL AND
      duration_max_seconds IS NULL AND
      agreement_state IS NULL
    )
  );

ALTER TABLE tasks
  ADD CONSTRAINT tasks_delivered_only_custom_ck CHECK (
    status <> 'delivered' OR type = 'custom'
  );

CREATE INDEX tasks_active_deadline_idx ON tasks (deadline_on)
  WHERE status NOT IN ('delivered', 'cancelled')
    AND NOT (type <> 'custom' AND status = 'done');
