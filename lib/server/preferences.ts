import { eq } from 'drizzle-orm';
import { userPreferences, type TaskType } from '@/drizzle/schema';
import { db } from '@/lib/db/client';

export type NewTaskPreferences = Partial<
  Record<TaskType, { topicId: string | null; platform: string | null }>
>;

export async function getNewTaskPreferences(userId: string): Promise<NewTaskPreferences> {
  const rows = await db
    .select({
      taskType: userPreferences.taskType,
      lastTopicId: userPreferences.lastTopicId,
      lastPlatform: userPreferences.lastPlatform,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  const preferences: NewTaskPreferences = {};
  for (const row of rows) {
    preferences[row.taskType] = {
      topicId: row.lastTopicId,
      platform: row.lastPlatform,
    };
  }
  return preferences;
}
