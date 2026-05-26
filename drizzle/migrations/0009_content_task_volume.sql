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
      agreement_state IS NULL
    )
  );
