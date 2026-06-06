/**
 * Apply the committed SQL migrations in `drizzle/migrations`.
 *
 * Forward-only. Skips files whose tag is recorded in the
 * `__drizzle_migrations` table so re-runs are idempotent.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { loadEnv } from '@/lib/env';

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIG_DIR = join(__dirname, '..', 'drizzle', 'migrations');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('Connected to', maskDbUrl(databaseUrl));

  await client.query(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      tag       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.log('No migrations found.');
    await client.end();
    return;
  }

  const { rows } = await client.query<{ tag: string }>(
    'SELECT tag FROM __drizzle_migrations',
  );
  const applied = new Set(rows.map((r) => r.tag));
  await adoptExistingBaseline(client, applied);

  for (const file of files) {
    const tag = file.replace(/\.sql$/, '');
    if (applied.has(tag)) {
      console.log(`✓ ${tag}  (already applied)`);
      continue;
    }
    const sql = readFileSync(join(MIG_DIR, file), 'utf8');
    console.log(`→ ${tag}  applying...`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO __drizzle_migrations(tag) VALUES ($1)', [tag]);
      await client.query('COMMIT');
      console.log(`✓ ${tag}  applied`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ ${tag}  failed:`, err);
      process.exit(1);
    }
  }

  await client.end();
  console.log('Migrations complete.');
}

type MigrationClient = Pick<Client, 'query'>;

export async function adoptExistingBaseline(
  client: MigrationClient,
  applied: Set<string>,
): Promise<void> {
  if (applied.size > 0) return;

  const { rows } = await client.query<BaselineFacts>(`
    WITH facts AS (
      SELECT
        to_regclass('public.users') IS NOT NULL AS users_table,
        to_regclass('public.sessions') IS NOT NULL AS sessions_table,
        to_regclass('public.accounts') IS NOT NULL AS accounts_table,
        to_regclass('public.verifications') IS NOT NULL AS verifications_table,
        to_regclass('public.topics') IS NOT NULL AS topics_table,
        to_regclass('public.tasks') IS NOT NULL AS tasks_table,
        to_regclass('public.attachments') IS NOT NULL AS attachments_table,
        to_regclass('public.task_events') IS NOT NULL AS task_events_table,
        to_regclass('public.user_preferences') IS NOT NULL AS user_preferences_table,
        to_regtype('public.task_type') IS NOT NULL AS task_type_type,
        to_regtype('public.task_status') IS NOT NULL AS task_status_type,
        to_regtype('public.task_priority') IS NOT NULL AS task_priority_type,
        to_regtype('public.payment_model') IS NOT NULL AS payment_model_type,
        to_regtype('public.agreement_state') IS NOT NULL AS agreement_state_type,
        to_regtype('public.attachment_kind') IS NOT NULL AS attachment_kind_type,
        to_regtype('public.custom_content_kind') IS NOT NULL AS custom_content_kind_type,
        to_regtype('public.content_production_status') IS NOT NULL AS content_production_status_type,
        to_regtype('public.content_destination') IS NOT NULL AS content_destination_type,
        EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE n.nspname = 'public'
            AND t.typname = 'task_type'
            AND e.enumlabel = 'note'
        ) AS task_type_has_note,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'assignee_id'
        ) AS tasks_assignee_id_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'requester_id'
        ) AS tasks_requester_id_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'version'
        ) AS tasks_version_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'content_kind'
        ) AS tasks_content_kind_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'content_production_status'
        ) AS tasks_content_production_status_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'content_destination'
        ) AS tasks_content_destination_column,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = to_regclass('public.tasks')
            AND tgname = 'tasks_notify_trg'
            AND NOT tgisinternal
        ) AS tasks_notify_trigger,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = to_regclass('public.attachments')
            AND tgname = 'attachments_notify_trg'
            AND NOT tgisinternal
        ) AS attachments_notify_trigger,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = to_regclass('public.task_events')
            AND tgname = 'task_events_notify_trg'
            AND NOT tgisinternal
        ) AS task_events_notify_trigger
    )
    SELECT
      (
        users_table OR sessions_table OR accounts_table OR verifications_table OR
        topics_table OR tasks_table OR attachments_table OR task_events_table OR
        task_type_type OR task_status_type OR task_priority_type OR payment_model_type OR
        agreement_state_type OR attachment_kind_type
      ) AS has_baseline_artifacts,
      (
        users_table AND sessions_table AND accounts_table AND verifications_table AND
        topics_table AND tasks_table AND attachments_table AND task_events_table AND
        task_type_type AND task_status_type AND task_priority_type AND payment_model_type AND
        agreement_state_type AND attachment_kind_type AND task_type_has_note AND
        tasks_assignee_id_column AND tasks_requester_id_column AND tasks_notify_trigger AND
        attachments_notify_trigger AND task_events_notify_trigger
      ) AS has_0001_baseline,
      (
        user_preferences_table OR tasks_version_column OR custom_content_kind_type OR
        content_production_status_type OR content_destination_type OR tasks_content_kind_column OR
        tasks_content_production_status_column OR tasks_content_destination_column
      ) AS has_post_baseline_artifacts
    FROM facts
  `);

  const facts = rows[0];
  if (!facts?.has_baseline_artifacts) return;
  if (!facts.has_0001_baseline || facts.has_post_baseline_artifacts) {
    throw new Error(
      'Existing public schema has no migration history and is not exactly the 0001 baseline; refusing unsafe baseline adoption.',
    );
  }

  await client.query(
    `INSERT INTO __drizzle_migrations(tag) VALUES ('0001_init') ON CONFLICT DO NOTHING`,
  );
  applied.add('0001_init');
  console.log('✓ 0001_init  (adopted existing schema)');
}

type BaselineFacts = {
  has_baseline_artifacts: boolean;
  has_0001_baseline: boolean;
  has_post_baseline_artifacts: boolean;
};

function maskDbUrl(u: string): string {
  try {
    const url = new URL(u);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '[unparseable DATABASE_URL]';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
