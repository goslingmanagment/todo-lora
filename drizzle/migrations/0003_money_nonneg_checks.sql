DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'tasks'::regclass
      AND conname = 'tasks_amount_nonnegative_check'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_amount_nonnegative_check
      CHECK (amount_cents IS NULL OR amount_cents >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'tasks'::regclass
      AND conname = 'tasks_collected_nonnegative_check'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_collected_nonnegative_check
      CHECK (amount_collected_cents IS NULL OR amount_collected_cents >= 0);
  END IF;
END $$;
