import { pgEnum } from 'drizzle-orm/pg-core';

export const taskTypeEnum = pgEnum('task_type', ['custom', 'content_task']);
export const taskStatusEnum = pgEnum('task_status', [
  'draft',
  'in_progress',
  'done',
  'delivered',
  'cancelled',
]);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high']);
export const paymentModelEnum = pgEnum('payment_model', ['full', 'unlock']);
export const customContentKindEnum = pgEnum('custom_content_kind', ['video', 'photo']);
export const agreementStateEnum = pgEnum('agreement_state', ['pending', 'confirmed', 'rejected']);
export const attachmentKindEnum = pgEnum('attachment_kind', ['image', 'url']);

export type TaskType = (typeof taskTypeEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number];
export type PaymentModel = (typeof paymentModelEnum.enumValues)[number];
export type CustomContentKind = (typeof customContentKindEnum.enumValues)[number];
export type AgreementState = (typeof agreementStateEnum.enumValues)[number];
export type AttachmentKind = (typeof attachmentKindEnum.enumValues)[number];
