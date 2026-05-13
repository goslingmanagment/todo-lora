import { isNull } from 'drizzle-orm';
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

export async function listActiveUserOptions(): Promise<UserOption[]> {
  return db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(isNull(users.disabledAt));
}

export async function listAllUserOptions(): Promise<UserOption[]> {
  return db.select({ id: users.id, displayName: users.displayName }).from(users);
}
