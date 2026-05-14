import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { topics, users } from '@/drizzle/schema';

export type TopicOption = { id: string; name: string; slug: string };
export type UserOption = { id: string; displayName: string };

export async function listActiveTopics(): Promise<TopicOption[]> {
  return db
    .select({ id: topics.id, name: topics.name, slug: topics.slug })
    .from(topics)
    .where(isNull(topics.archivedAt))
    .orderBy(topics.sortOrder);
}

export async function isActiveTopicId(topicId: string): Promise<boolean> {
  const rows = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.id, topicId), isNull(topics.archivedAt)))
    .limit(1);
  return rows.length > 0;
}

export async function listEditableTopics(currentTopicId: string): Promise<TopicOption[]> {
  const active = await listActiveTopics();
  if (active.some((t) => t.id === currentTopicId)) return active;

  const current = await db
    .select({ id: topics.id, name: topics.name, slug: topics.slug })
    .from(topics)
    .where(eq(topics.id, currentTopicId))
    .limit(1);
  return current[0] ? [current[0], ...active] : active;
}

export async function listActiveUserOptions(): Promise<UserOption[]> {
  return db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(isNull(users.disabledAt));
}

export async function listAllUserOptions(): Promise<UserOption[]> {
  return db.select({ id: users.id, displayName: users.displayName }).from(users);
}
