import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import * as schema from '@/drizzle/schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIG_DIR = join(__dirname, '..', '..', 'drizzle', 'migrations');

export type IntegrationDB = ReturnType<typeof drizzle<typeof schema>> & { _close: () => Promise<void> };

let container: StartedTestContainer | null = null;
let pool: Pool | null = null;

export async function startTestDb(): Promise<IntegrationDB> {
  if (!container) {
    container = await new GenericContainer('postgres:18-alpine')
      .withEnvironment({
        POSTGRES_DB: 'todo_lora_test',
        POSTGRES_USER: 'todo_lora_test',
        POSTGRES_PASSWORD: 'todo_lora_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(120_000)
      .start();
  }
  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const url = `postgres://todo_lora_test:todo_lora_test@${host}:${port}/todo_lora_test`;

  if (!pool) {
    pool = new Pool({ connectionString: url });
    await applyMigrations(pool);
  }
  const dbInstance = drizzle({ client: pool, schema, casing: 'snake_case' }) as IntegrationDB;
  dbInstance._close = async () => {
    await pool?.end().catch(() => {});
    pool = null;
    await container?.stop().catch(() => {});
    container = null;
  };
  return dbInstance;
}

async function applyMigrations(pool: Pool) {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIG_DIR, file), 'utf8');
    await pool.query(sql);
  }
}

export async function truncateAll(pool: Pool) {
  await pool.query(`
    TRUNCATE
      task_events,
      attachments,
      tasks,
      user_preferences,
      sessions,
      accounts,
      verifications,
      users
    RESTART IDENTITY CASCADE;
  `);
  // Re-seed topics (truncated by FK chain)
  await pool.query(`
    INSERT INTO topics (slug, name, sort_order) VALUES
      ('customs', 'Customs', 10),
      ('sets', 'Sets', 20),
      ('life', 'Life', 30),
      ('fyp', 'FYP', 40),
      ('ppv', 'PPV', 50),
      ('sextings', 'Sextings', 60),
      ('reddit', 'Reddit', 70),
      ('instagram', 'Instagram', 80),
      ('pictures', 'Pictures', 90)
    ON CONFLICT (slug) DO NOTHING;
  `);
}

export async function ensureUser(pool: Pool, name: string, id: string): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, name, email, display_name, email_verified)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (id) DO NOTHING`,
    [id, name, `${name.toLowerCase()}@local.test`, name],
  );
}

export function getPool(): Pool {
  if (!pool) throw new Error('Test pool not initialized; call startTestDb() first.');
  return pool;
}
