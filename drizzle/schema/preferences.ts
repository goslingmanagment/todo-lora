import { sql } from 'drizzle-orm';
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { taskTypeEnum } from './enums';
import { topics } from './topics';
import { users } from './auth';

export const userPreferences = pgTable(
  'user_preferences',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskType: taskTypeEnum('task_type').notNull(),
    lastTopicId: uuid('last_topic_id').references(() => topics.id, { onDelete: 'set null' }),
    lastPlatform: text('last_platform'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`date_trunc('milliseconds', now())`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.taskType] }),
  }),
);

export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
