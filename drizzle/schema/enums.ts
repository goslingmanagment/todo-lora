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
export const contentProductionStatusEnum = pgEnum('content_production_status', [
  'planned',
  'shot',
  'editing',
  'ready',
  'posted',
]);
export const contentDestinationEnum = pgEnum('content_destination', [
  'of_wall',
  'of_ppv',
  'reddit',
  'tiktok',
  'twitter',
  'instagram',
  'chat',
  'other',
]);
export const agreementStateEnum = pgEnum('agreement_state', ['pending', 'confirmed', 'rejected']);
export const attachmentKindEnum = pgEnum('attachment_kind', ['image', 'url']);

export type TaskType = (typeof taskTypeEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskPriority = (typeof taskPriorityEnum.enumValues)[number];
export type PaymentModel = (typeof paymentModelEnum.enumValues)[number];
export type CustomContentKind = (typeof customContentKindEnum.enumValues)[number];
export type ContentProductionStatus = (typeof contentProductionStatusEnum.enumValues)[number];
export type ContentDestination = (typeof contentDestinationEnum.enumValues)[number];
export type AgreementState = (typeof agreementStateEnum.enumValues)[number];
export type AttachmentKind = (typeof attachmentKindEnum.enumValues)[number];
