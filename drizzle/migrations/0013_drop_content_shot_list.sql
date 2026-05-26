ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_content_fields_ck;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_content_fields_ck CHECK (
    (
      type = 'content_task'
      AND content_destination IS NOT NULL
      AND content_production_status IS NOT NULL
    ) OR (
      type <> 'content_task'
      AND content_destination IS NULL
      AND content_production_status IS NULL
    )
  );

ALTER TABLE tasks
  DROP COLUMN IF EXISTS shot_list;
