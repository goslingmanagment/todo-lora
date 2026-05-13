-- todo-lora initial schema (MVP).
-- Forward-only. Authored by hand to keep SQL committed alongside Drizzle types.

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- enums ----------
CREATE TYPE task_type AS ENUM ('custom', 'content_task', 'note');
CREATE TYPE task_status AS ENUM ('draft', 'in_progress', 'done', 'delivered', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE payment_model AS ENUM ('full', 'unlock');
CREATE TYPE agreement_state AS ENUM ('pending', 'confirmed', 'rejected');
CREATE TYPE attachment_kind AS ENUM ('image', 'url');

-- ---------- Better-Auth tables ----------
CREATE TABLE users (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  email_verified  boolean NOT NULL DEFAULT true,
  image           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  display_name    text NOT NULL,
  login_code_hash text,
  disabled_at     timestamptz
);

CREATE TABLE sessions (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  token       text NOT NULL UNIQUE,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE accounts (
  id                          text PRIMARY KEY,
  user_id                     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id                  text NOT NULL,
  provider_id                 text NOT NULL,
  access_token                text,
  refresh_token               text,
  access_token_expires_at     timestamptz,
  refresh_token_expires_at    timestamptz,
  scope                       text,
  id_token                    text,
  password                    text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE verifications (
  id          text PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- topics ----------
CREATE TABLE topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  sort_order  integer NOT NULL,
  tg_topic_id integer,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX topics_sort_order_active_uq
  ON topics(sort_order)
  WHERE archived_at IS NULL;

-- ---------- tasks ----------
CREATE TABLE tasks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                     task_type NOT NULL,
  topic_id                 uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  title                    text NOT NULL,
  description              text,
  status                   task_status NOT NULL DEFAULT 'draft',
  priority                 task_priority,
  deadline_on              date,
  assignee_id              text REFERENCES users(id) ON DELETE SET NULL,
  requester_id             text REFERENCES users(id) ON DELETE SET NULL,
  created_by               text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  last_edited_by           text REFERENCES users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
  updated_at               timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),

  buyer_handle             text,
  buyer_display_name       text,
  platform                 text,
  payment_model            payment_model,
  amount_cents             integer,
  amount_collected_cents   integer,
  duration_min_seconds     integer,
  duration_max_seconds     integer,
  agreement_state          agreement_state,

  CONSTRAINT tasks_custom_columns_ck CHECK (
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
  ),
  CONSTRAINT tasks_delivered_only_custom_ck CHECK (
    status <> 'delivered' OR type = 'custom'
  ),
  CONSTRAINT tasks_collected_leq_amount_ck CHECK (
    amount_collected_cents IS NULL OR amount_cents IS NULL OR amount_collected_cents <= amount_cents
  ),
  CONSTRAINT tasks_unlock_amount_ck CHECK (
    payment_model <> 'unlock' OR amount_cents IS NOT NULL
  ),
  CONSTRAINT tasks_duration_order_ck CHECK (
    duration_min_seconds IS NULL OR duration_max_seconds IS NULL OR duration_min_seconds <= duration_max_seconds
  )
);

CREATE INDEX tasks_topic_status_idx ON tasks(topic_id, status);
CREATE INDEX tasks_active_deadline_idx ON tasks(deadline_on)
  WHERE status NOT IN ('delivered', 'cancelled')
    AND NOT (type <> 'custom' AND status = 'done');
CREATE INDEX tasks_updated_at_idx ON tasks(updated_at DESC);

-- Bump updated_at on every UPDATE.
-- Truncate to millisecond precision so JS Date roundtrips don't lose precision
-- and break OCC comparisons (§9.3 / lib/server/actions.ts changeStatusAction).
CREATE OR REPLACE FUNCTION tasks_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := date_trunc('milliseconds', clock_timestamp());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_set_updated_at_trg
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION tasks_set_updated_at();

-- ---------- attachments ----------
CREATE TABLE attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind          attachment_kind NOT NULL,
  object_key    text,
  url           text,
  mime_type     text,
  size_bytes    bigint,
  original_name text,
  caption       text,
  sort_order    integer NOT NULL DEFAULT 0,
  uploaded_by   text REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attachments_kind_shape_ck CHECK (
    (kind = 'image' AND object_key IS NOT NULL AND url IS NULL)
    OR (kind = 'url' AND url IS NOT NULL AND object_key IS NULL)
  )
);
CREATE INDEX attachments_task_idx ON attachments(task_id, sort_order);

-- ---------- task_events ----------
CREATE TABLE task_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id    text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type  text NOT NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_events_task_created_idx ON task_events(task_id, created_at DESC);

-- Realtime fanout: NOTIFY 'task_changes' on every meaningful write.
CREATE OR REPLACE FUNCTION notify_task_change() RETURNS trigger AS $$
DECLARE
  payload jsonb;
  task_row tasks%rowtype;
  task_id_val uuid;
BEGIN
  IF TG_TABLE_NAME = 'tasks' THEN
    IF TG_OP = 'DELETE' THEN
      task_id_val := OLD.id;
    ELSE
      task_id_val := NEW.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'attachments' THEN
    IF TG_OP = 'DELETE' THEN
      task_id_val := OLD.task_id;
    ELSE
      task_id_val := NEW.task_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'task_events' THEN
    task_id_val := NEW.task_id;
  ELSE
    RETURN NULL;
  END IF;

  SELECT * INTO task_row FROM tasks WHERE id = task_id_val;
  payload := jsonb_build_object(
    'taskId', task_id_val,
    'topicId', task_row.topic_id,
    'reason', TG_TABLE_NAME || ':' || lower(TG_OP),
    'at', extract(epoch from now())
  );
  PERFORM pg_notify('task_changes', payload::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_notify_trg
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION notify_task_change();

CREATE TRIGGER attachments_notify_trg
AFTER INSERT OR UPDATE OR DELETE ON attachments
FOR EACH ROW EXECUTE FUNCTION notify_task_change();

CREATE TRIGGER task_events_notify_trg
AFTER INSERT ON task_events
FOR EACH ROW EXECUTE FUNCTION notify_task_change();
