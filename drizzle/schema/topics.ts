import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    tgTopicId: integer('tg_topic_id'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sortOrderActiveUq: uniqueIndex('topics_sort_order_active_uq')
      .on(t.sortOrder)
      .where(sql`${t.archivedAt} IS NULL`),
  }),
);

export type Topic = typeof topics.$inferSelect;
