import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  agreementStateEnum,
  attachmentKindEnum,
  customContentKindEnum,
  paymentModelEnum,
  taskPriorityEnum,
  taskStatusEnum,
  taskTypeEnum,
} from './enums';
import { users } from './auth';
import { topics } from './topics';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    type: taskTypeEnum('type').notNull(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('draft'),
    priority: taskPriorityEnum('priority'),
    deadlineOn: date('deadline_on', { mode: 'string' }),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    requesterId: text('requester_id').references(() => users.id, { onDelete: 'set null' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    lastEditedBy: text('last_edited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(0),

    // Custom-only columns
    buyerHandle: text('buyer_handle'),
    buyerDisplayName: text('buyer_display_name'),
    platform: text('platform'),
    contentKind: customContentKindEnum('content_kind'),
    paymentModel: paymentModelEnum('payment_model'),
    amountCents: integer('amount_cents'),
    amountCollectedCents: integer('amount_collected_cents'),
    durationMinSeconds: integer('duration_min_seconds'),
    durationMaxSeconds: integer('duration_max_seconds'),
    photoCountMin: integer('photo_count_min'),
    photoCountMax: integer('photo_count_max'),
    agreementState: agreementStateEnum('agreement_state'),
  },
  (t) => ({
    feedIdx: index('tasks_topic_status_idx').on(t.topicId, t.status),
    deadlineActiveIdx: index('tasks_active_deadline_idx')
      .on(t.deadlineOn)
      .where(
        sql`${t.status} NOT IN ('delivered', 'cancelled') AND NOT (${t.type} <> 'custom' AND ${t.status} = 'done')`,
      ),
    customColumnsCk: check(
      'tasks_custom_columns_ck',
      sql`(${t.type} = 'custom') OR (
        ${t.buyerHandle} IS NULL AND
        ${t.buyerDisplayName} IS NULL AND
        ${t.platform} IS NULL AND
        ${t.contentKind} IS NULL AND
        ${t.paymentModel} IS NULL AND
        ${t.amountCents} IS NULL AND
        ${t.amountCollectedCents} IS NULL AND
        ${t.durationMinSeconds} IS NULL AND
        ${t.durationMaxSeconds} IS NULL AND
        ${t.photoCountMin} IS NULL AND
        ${t.photoCountMax} IS NULL AND
        ${t.agreementState} IS NULL
      )`,
    ),
    customContentKindRequiredCk: check(
      'tasks_custom_content_kind_required_ck',
      sql`${t.type} <> 'custom' OR ${t.contentKind} IS NOT NULL`,
    ),
    customContentShapeCk: check(
      'tasks_custom_content_shape_ck',
      sql`${t.contentKind} IS NULL
        OR (
          ${t.contentKind} = 'video'
          AND ${t.photoCountMin} IS NULL
          AND ${t.photoCountMax} IS NULL
        )
        OR (
          ${t.contentKind} = 'photo'
          AND ${t.durationMinSeconds} IS NULL
          AND ${t.durationMaxSeconds} IS NULL
          AND ${t.photoCountMin} IS NOT NULL
          AND ${t.photoCountMax} IS NOT NULL
        )`,
    ),
    deliveredOnlyCustomCk: check(
      'tasks_delivered_only_custom_ck',
      sql`${t.status} <> 'delivered' OR ${t.type} = 'custom'`,
    ),
    collectedLeqAmountCk: check(
      'tasks_collected_leq_amount_ck',
      sql`${t.amountCollectedCents} IS NULL OR ${t.amountCents} IS NULL OR ${t.amountCollectedCents} <= ${t.amountCents}`,
    ),
    amountNonnegativeCk: check(
      'tasks_amount_nonnegative_check',
      sql`${t.amountCents} IS NULL OR ${t.amountCents} >= 0`,
    ),
    collectedNonnegativeCk: check(
      'tasks_collected_nonnegative_check',
      sql`${t.amountCollectedCents} IS NULL OR ${t.amountCollectedCents} >= 0`,
    ),
    unlockHasAmountCk: check(
      'tasks_unlock_amount_ck',
      sql`${t.paymentModel} <> 'unlock' OR ${t.amountCents} IS NOT NULL`,
    ),
    durationOrderCk: check(
      'tasks_duration_order_ck',
      sql`${t.durationMinSeconds} IS NULL OR ${t.durationMaxSeconds} IS NULL OR ${t.durationMinSeconds} <= ${t.durationMaxSeconds}`,
    ),
    photoCountPositiveCk: check(
      'tasks_photo_count_positive_ck',
      sql`(${t.photoCountMin} IS NULL OR ${t.photoCountMin} > 0)
        AND (${t.photoCountMax} IS NULL OR ${t.photoCountMax} > 0)`,
    ),
    photoCountOrderCk: check(
      'tasks_photo_count_order_ck',
      sql`${t.photoCountMin} IS NULL OR ${t.photoCountMax} IS NULL OR ${t.photoCountMin} <= ${t.photoCountMax}`,
    ),
  }),
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    kind: attachmentKindEnum('kind').notNull(),
    objectKey: text('object_key'),
    url: text('url'),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    originalName: text('original_name'),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdIdx: index('attachments_task_idx').on(t.taskId, t.sortOrder),
    kindShapeCk: check(
      'attachments_kind_shape_ck',
      sql`(${t.kind} = 'image' AND ${t.objectKey} IS NOT NULL AND ${t.url} IS NULL)
       OR (${t.kind} = 'url'   AND ${t.url} IS NOT NULL AND ${t.objectKey} IS NULL)`,
    ),
  }),
);

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;

export const taskEvents = pgTable(
  'task_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskCreatedIdx: index('task_events_task_created_idx').on(t.taskId, t.createdAt),
  }),
);

export type TaskEvent = typeof taskEvents.$inferSelect;
export type NewTaskEvent = typeof taskEvents.$inferInsert;
