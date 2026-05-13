import { desc, eq } from 'drizzle-orm';
import { attachments, taskEvents, tasks, topics, users } from '@/drizzle/schema';
import { db } from '@/lib/db/client';
import { presignDownload } from '@/lib/storage/presign';
import { listActiveTopics, listActiveUserOptions, listAllUserOptions } from './lookups';

export async function getTaskDetailData(id: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) return null;

  const [topic, atts, events, allTopics, allUsers, activeUsers] = await Promise.all([
    db.query.topics.findFirst({ where: eq(topics.id, task.topicId) }),
    db.select().from(attachments).where(eq(attachments.taskId, id)).orderBy(attachments.sortOrder),
    db.select({
      id: taskEvents.id,
      eventType: taskEvents.eventType,
      payload: taskEvents.payload,
      createdAt: taskEvents.createdAt,
      actorId: taskEvents.actorId,
      actorName: users.displayName,
    })
      .from(taskEvents)
      .leftJoin(users, eq(taskEvents.actorId, users.id))
      .where(eq(taskEvents.taskId, id))
      .orderBy(desc(taskEvents.createdAt))
      .limit(50),
    listActiveTopics(),
    listAllUserOptions(),
    listActiveUserOptions(),
  ]);

  const attachmentsWithPreview = await Promise.all(
    atts.map(async (a) => ({
      ...a,
      previewUrl: a.kind === 'image' && a.objectKey ? await presignDownload(a.objectKey) : null,
    })),
  );

  return {
    task,
    topic: topic ? { id: topic.id, name: topic.name, slug: topic.slug } : null,
    allTopics,
    allUsers,
    activeUsers,
    attachments: attachmentsWithPreview,
    events,
  };
}
