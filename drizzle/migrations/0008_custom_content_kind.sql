CREATE TYPE custom_content_kind AS ENUM ('video', 'photo');

ALTER TABLE tasks
  ADD COLUMN content_kind custom_content_kind,
  ADD COLUMN photo_count_min integer,
  ADD COLUMN photo_count_max integer;

UPDATE tasks
SET content_kind = 'video'
WHERE type = 'custom' AND content_kind IS NULL;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_custom_columns_ck;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_custom_columns_ck CHECK (
    (type = 'custom') OR (
      buyer_handle IS NULL AND
      buyer_display_name IS NULL AND
      platform IS NULL AND
      content_kind IS NULL AND
      payment_model IS NULL AND
      amount_cents IS NULL AND
      amount_collected_cents IS NULL AND
      duration_min_seconds IS NULL AND
      duration_max_seconds IS NULL AND
      photo_count_min IS NULL AND
      photo_count_max IS NULL AND
      agreement_state IS NULL
    )
  );

ALTER TABLE tasks
  ADD CONSTRAINT tasks_custom_content_kind_required_ck CHECK (
    type <> 'custom' OR content_kind IS NOT NULL
  );

ALTER TABLE tasks
  ADD CONSTRAINT tasks_custom_content_shape_ck CHECK (
    content_kind IS NULL
    OR (
      content_kind = 'video'
      AND photo_count_min IS NULL
      AND photo_count_max IS NULL
    )
    OR (
      content_kind = 'photo'
      AND duration_min_seconds IS NULL
      AND duration_max_seconds IS NULL
      AND photo_count_min IS NOT NULL
      AND photo_count_max IS NOT NULL
    )
  );

ALTER TABLE tasks
  ADD CONSTRAINT tasks_photo_count_positive_ck CHECK (
    (photo_count_min IS NULL OR photo_count_min > 0)
    AND (photo_count_max IS NULL OR photo_count_max > 0)
  );

ALTER TABLE tasks
  ADD CONSTRAINT tasks_photo_count_order_ck CHECK (
    photo_count_min IS NULL OR photo_count_max IS NULL OR photo_count_min <= photo_count_max
  );
