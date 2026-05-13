/**
 * Shared shape definitions used across the task-detail sibling panels.
 * Plain types live here so the panel files don't need to cross-import each
 * other just to spell their props.
 */
import type {
  AgreementState,
  CustomContentKind,
  PaymentModel,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@/drizzle/schema/enums';

export type TaskDto = {
  id: string;
  type: TaskType;
  topicId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  deadlineOn: string | null;
  buyerHandle: string | null;
  buyerDisplayName: string | null;
  platform: string | null;
  contentKind: CustomContentKind | null;
  paymentModel: PaymentModel | null;
  amountCents: number | null;
  amountCollectedCents: number | null;
  durationMinSeconds: number | null;
  durationMaxSeconds: number | null;
  photoCountMin: number | null;
  photoCountMax: number | null;
  agreementState: AgreementState | null;
  requesterId: string | null;
  assigneeId: string | null;
  lastEditedBy: string | null;
  version: number;
  updatedAtIso: string;
  createdAtIso: string;
};

export type Topic = { id: string; name: string; slug: string };
export type UserOption = { id: string; displayName: string };

export type AttachmentDto = {
  id: string;
  kind: 'image' | 'url';
  url: string | null;
  previewUrl: string | null;
  mimeType: string | null;
  originalName: string | null;
  caption: string | null;
};

export type EventDto = {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAtIso: string;
  actorName: string;
};
