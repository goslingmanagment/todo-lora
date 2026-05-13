/**
 * Server-side realtime fanout helper. Mutations call
 * `emitTaskInvalidationInTransaction` before commit (§9.1). PostgreSQL
 * delivers NOTIFY only when that transaction commits, so action results no
 * longer depend on a second post-commit notification write.
 */
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export type TaskInvalidation = {
  taskId: string;
  topicId: string | null;
  reason: string;
  at: number;
};

type NotifyExecutor = {
  execute(query: SQL): Promise<unknown>;
};

export async function emitTaskInvalidation(payload: TaskInvalidation): Promise<void> {
  await emitTaskInvalidationInTransaction(db, payload);
}

export async function emitTaskInvalidationInTransaction(
  executor: NotifyExecutor,
  payload: TaskInvalidation,
): Promise<void> {
  const json = JSON.stringify(payload);
  await executor.execute(sql`SELECT pg_notify('task_changes', ${json})`);
}
