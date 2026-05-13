CREATE TABLE IF NOT EXISTS user_preferences (
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_type      task_type NOT NULL,
  last_topic_id  uuid REFERENCES topics(id) ON DELETE SET NULL,
  last_platform  text,
  updated_at     timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  PRIMARY KEY (user_id, task_type)
);
