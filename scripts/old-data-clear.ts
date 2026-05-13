/**
 * Clear known stale local task data from earlier fixture/review runs.
 *
 * This intentionally avoids a broad `DELETE FROM tasks`. It removes only rows
 * with old seed markers or titles created by previous local review/e2e passes.
 */
import { and, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { attachments, taskEvents, tasks } from '@/drizzle/schema';
import { db } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { deleteObject } from '@/lib/storage/presign';
import { DEMO_DATASET } from '@/lib/server/demo-data';

loadEnv();

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Refusing cleanup without --yes. Use pnpm db:old-data:clear for the guarded local cleanup.');
    process.exit(1);
  }

  const markedRows = await db
    .selectDistinct({ id: taskEvents.taskId })
    .from(taskEvents)
    .where(
      and(
        eq(taskEvents.eventType, 'created'),
        or(
          sql`${taskEvents.payload}->>'demoSet' = ${DEMO_DATASET}`,
          and(
            sql`${taskEvents.payload}->>'seed' = 'true'`,
            sql`${taskEvents.payload}->>'demoSet' IS NULL`,
          ),
        ),
      ),
    );

  const titleRows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      or(
        ilike(tasks.title, 'Review Note%'),
        ilike(tasks.title, 'Review note %'),
        ilike(tasks.title, 'Review custom playwright %'),
        ilike(tasks.title, 'Review note playwright %'),
        ilike(tasks.title, 'Review content playwright %'),
        ilike(tasks.title, 'Realtime manual %'),
        ilike(tasks.title, 'Realtime mcp %'),
        ilike(tasks.title, 'Realtime review note %'),
      ),
    );

  const taskIds = Array.from(new Set([...markedRows, ...titleRows].map((row) => row.id)));
  if (taskIds.length === 0) {
    console.log('No old local task data found.');
    return;
  }

  const imageKeys = await db
    .select({ key: attachments.objectKey })
    .from(attachments)
    .where(and(inArray(attachments.taskId, taskIds), isNotNull(attachments.objectKey)));

  for (const { key } of imageKeys) {
    if (!key) continue;
    try {
      await deleteObject(key);
    } catch (err) {
      console.warn(`Could not delete object ${key}:`, err);
    }
  }

  const deleted = await db
    .delete(tasks)
    .where(inArray(tasks.id, taskIds))
    .returning({ id: tasks.id });

  console.log(`Deleted ${deleted.length} old local tasks and ${imageKeys.length} image objects.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
