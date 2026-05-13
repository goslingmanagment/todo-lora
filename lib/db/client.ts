import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from '@/drizzle/schema';
import { getConfig } from '@/lib/env';

declare global {
  var __todoLoraPool: Pool | undefined;
  var __todoLoraDb: NodePgDatabase<typeof schema> | undefined;
}

function buildPool(): Pool {
  const cfg = getConfig();
  const opts: PoolConfig = {
    connectionString: cfg.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
  return new Pool(opts);
}

export function getPool(): Pool {
  if (!globalThis.__todoLoraPool) {
    globalThis.__todoLoraPool = buildPool();
  }
  return globalThis.__todoLoraPool;
}

function buildDb(): NodePgDatabase<typeof schema> {
  return drizzle({ client: getPool(), schema, casing: 'snake_case' });
}

/**
 * Lazy proxy: the underlying Drizzle instance is constructed on first use, not
 * at module-import time, so the build-time "collect page data" phase doesn't
 * need DATABASE_URL to be set.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_t, prop: string | symbol) {
    if (!globalThis.__todoLoraDb) {
      globalThis.__todoLoraDb = buildDb();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = globalThis.__todoLoraDb as any;
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export { schema };
export type Database = NodePgDatabase<typeof schema>;

export async function withTransaction<T>(
  fn: (tx: Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(fn);
}
