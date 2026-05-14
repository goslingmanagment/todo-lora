import { taskEvents } from '@/drizzle/schema';
import type { Database } from '@/lib/db/client';
import {
  emitTaskInvalidationInTransaction,
  type TaskInvalidation,
} from '@/lib/realtime/notify';

type TaskMutationTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type TaskEventInput = Pick<
  typeof taskEvents.$inferInsert,
  'taskId' | 'actorId' | 'eventType' | 'payload'
>;
type TaskInvalidationInput = Omit<TaskInvalidation, 'at'> & { at?: number };

export async function recordTaskEventAndNotify(
  tx: TaskMutationTransaction,
  event: TaskEventInput,
  invalidation: TaskInvalidationInput,
): Promise<void> {
  await tx.insert(taskEvents).values(event);
  await notifyTaskMutation(tx, invalidation);
}

export async function notifyTaskMutation(
  tx: TaskMutationTransaction,
  invalidation: TaskInvalidationInput,
): Promise<void> {
  await emitTaskInvalidationInTransaction(tx, {
    ...invalidation,
    at: invalidation.at ?? Date.now(),
  });
}
