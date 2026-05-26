CREATE TYPE content_destination AS ENUM (
  'of_wall',
  'of_ppv',
  'reddit',
  'tiktok',
  'twitter',
  'instagram',
  'chat',
  'other'
);

ALTER TABLE tasks
  ADD COLUMN content_destination content_destination;

UPDATE tasks
SET content_destination = CASE topics.slug
  WHEN 'ppv' THEN 'of_ppv'::content_destination
  WHEN 'sets' THEN 'of_wall'::content_destination
  WHEN 'reddit' THEN 'reddit'::content_destination
  WHEN 'fyp' THEN 'tiktok'::content_destination
  WHEN 'instagram' THEN 'instagram'::content_destination
  WHEN 'life' THEN 'chat'::content_destination
  WHEN 'sextings' THEN 'chat'::content_destination
  ELSE 'other'::content_destination
END
FROM topics
WHERE tasks.topic_id = topics.id
  AND tasks.type = 'content_task';

ALTER TABLE tasks
  DROP CONSTRAINT tasks_content_fields_ck;

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
