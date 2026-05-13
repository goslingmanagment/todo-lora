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

  const { rows } = await client.query<{ ready: boolean }>(`
    SELECT
      to_regclass('public.users') IS NOT NULL
      AND to_regclass('public.topics') IS NOT NULL
      AND to_regclass('public.tasks') IS NOT NULL
      AND to_regclass('public.attachments') IS NOT NULL
      AND to_regclass('public.task_events') IS NOT NULL
      AND to_regtype('public.task_type') IS NOT NULL
      AND to_regtype('public.task_status') IS NOT NULL
      AS ready
  `);

  if (!rows[0]?.ready) return;

  await client.query(
    `INSERT INTO __drizzle_migrations(tag) VALUES ('0001_init') ON CONFLICT DO NOTHING`,
  );
  applied.add('0001_init');
  console.log('✓ 0001_init  (adopted existing schema)');
}

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
