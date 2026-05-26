CREATE TYPE content_production_status AS ENUM ('planned', 'shot', 'editing', 'ready', 'posted');

ALTER TABLE tasks
  ADD COLUMN content_production_status content_production_status;

UPDATE tasks
SET content_production_status = 'planned'
WHERE type = 'content_task';

ALTER TABLE tasks
  ADD CONSTRAINT tasks_content_fields_ck CHECK (
    (
      type = 'content_task'
      AND content_production_status IS NOT NULL
    ) OR (
      type <> 'content_task'
      AND content_production_status IS NULL
    )
  );
