import type { Task, tasks } from '@/drizzle/schema';
import { dollarsToCents, minutesToSeconds } from '@/lib/domain/inputs';
import { inferCustomTaskTitle } from '@/lib/domain/taskTitle';
import type { UpdateTaskOutput } from '@/lib/validation/schemas';

export type TaskUpdatePatch = Partial<typeof tasks.$inferInsert>;

export function buildCustomTaskUpdatePatch(
  v: UpdateTaskOutput,
  existing: Task,
): TaskUpdatePatch {
  if (existing.type !== 'custom') return {};

  const patch: TaskUpdatePatch = {};
  if (v.buyerHandle !== undefined) patch.buyerHandle = v.buyerHandle;
  if (v.buyerDisplayName !== undefined) patch.buyerDisplayName = v.buyerDisplayName;
  if (v.platform !== undefined) patch.platform = v.platform;
  if (v.contentKind !== undefined) patch.contentKind = v.contentKind;
  if (v.paymentModel !== undefined) patch.paymentModel = v.paymentModel;
  if (v.amountDollars !== undefined) patch.amountCents = dollarsToCents(v.amountDollars);
  if (v.amountCollectedDollars !== undefined) {
    patch.amountCollectedCents = dollarsToCents(v.amountCollectedDollars);
  }
  if (v.durationMinMinutes !== undefined) {
    patch.durationMinSeconds = minutesToSeconds(v.durationMinMinutes);
  }
  if (v.durationMaxMinutes !== undefined) {
    patch.durationMaxSeconds = minutesToSeconds(v.durationMaxMinutes);
  }
  if (v.photoCountMin !== undefined) patch.photoCountMin = v.photoCountMin;
  if (v.photoCountMax !== undefined) patch.photoCountMax = v.photoCountMax;
  if (v.agreementState !== undefined) patch.agreementState = v.agreementState;

  const existingDurationMin =
    existing.durationMinSeconds == null ? null : Math.round(existing.durationMinSeconds / 60);
  const existingDurationMax =
    existing.durationMaxSeconds == null ? null : Math.round(existing.durationMaxSeconds / 60);
  const existingContentKind =
    existing.contentKind ??
    (existing.photoCountMin != null || existing.photoCountMax != null ? 'photo' : 'video');
  const resolvedContentKind = v.contentKind ?? existingContentKind;
  const existingGeneratedTitle = inferCustomTaskTitle({
    buyerHandle: existing.buyerHandle,
    buyerDisplayName: existing.buyerDisplayName,
    contentKind: existingContentKind,
    description: existing.description,
    durationMinMinutes: existingDurationMin,
    durationMaxMinutes: existingDurationMax,
    photoCountMin: existing.photoCountMin,
    photoCountMax: existing.photoCountMax,
  });
  const updatedGeneratedTitle = inferCustomTaskTitle({
    buyerHandle: v.buyerHandle !== undefined ? v.buyerHandle : existing.buyerHandle,
    buyerDisplayName:
      v.buyerDisplayName !== undefined ? v.buyerDisplayName : existing.buyerDisplayName,
    contentKind: resolvedContentKind,
    description: v.description !== undefined ? v.description : existing.description,
    durationMinMinutes:
      v.durationMinMinutes !== undefined ? v.durationMinMinutes : existingDurationMin,
    durationMaxMinutes:
      v.durationMaxMinutes !== undefined ? v.durationMaxMinutes : existingDurationMax,
    photoCountMin: v.photoCountMin !== undefined ? v.photoCountMin : existing.photoCountMin,
    photoCountMax: v.photoCountMax !== undefined ? v.photoCountMax : existing.photoCountMax,
  });
  if (v.title !== undefined) {
    patch.title = v.title && v.title.length > 0 ? v.title : updatedGeneratedTitle;
  } else if (existing.title === existingGeneratedTitle) {
    patch.title = updatedGeneratedTitle;
  }

  return patch;
}

export function validateCustomTaskUpdate(
  v: UpdateTaskOutput,
  existing: Task,
): Record<string, string> | null {
  if (existing.type !== 'custom') return null;

  const errors: Record<string, string> = {};
  const existingAmount =
    existing.amountCents == null ? null : Math.round(existing.amountCents / 100);
  const existingCollected =
    existing.amountCollectedCents == null ? null : Math.round(existing.amountCollectedCents / 100);
  const existingDurationMin =
    existing.durationMinSeconds == null ? null : Math.round(existing.durationMinSeconds / 60);
  const existingDurationMax =
    existing.durationMaxSeconds == null ? null : Math.round(existing.durationMaxSeconds / 60);
  const existingContentKind =
    existing.contentKind ??
    (existing.photoCountMin != null || existing.photoCountMax != null ? 'photo' : 'video');

  const amount = v.amountDollars !== undefined ? v.amountDollars : existingAmount;
  const collected =
    v.amountCollectedDollars !== undefined ? v.amountCollectedDollars : existingCollected;
  const durationMin =
    v.durationMinMinutes !== undefined ? v.durationMinMinutes : existingDurationMin;
  const durationMax =
    v.durationMaxMinutes !== undefined ? v.durationMaxMinutes : existingDurationMax;
  const contentKind = v.contentKind !== undefined ? v.contentKind : existingContentKind;
  const photoCountMin = v.photoCountMin !== undefined ? v.photoCountMin : existing.photoCountMin;
  const photoCountMax = v.photoCountMax !== undefined ? v.photoCountMax : existing.photoCountMax;

  // Custom create requires amount > 0. Don't let an edit wipe it back to
  // null/0 because that breaks outstanding totals and the unlock-payment check.
  if (v.amountDollars !== undefined) {
    if (v.amountDollars == null) {
      errors.amountDollars = 'Сумма обязательна для Custom';
    } else if (v.amountDollars <= 0) {
      errors.amountDollars = 'Сумма должна быть больше 0';
    }
  } else if (amount != null && amount < 0) {
    errors.amountDollars = 'Не может быть отрицательной';
  }
  if (collected != null && collected < 0) {
    errors.amountCollectedDollars = 'Не может быть отрицательной';
  } else if (amount != null && collected != null && collected > amount) {
    errors.amountCollectedDollars = 'Получено больше суммы';
  }
  if (durationMin != null && durationMax != null && durationMin > durationMax) {
    errors.durationMaxMinutes = 'Максимум должен быть ≥ минимума';
  }
  if (contentKind === 'video') {
    if (photoCountMin != null || photoCountMax != null) {
      errors.photoCountMin = 'Для видео укажите длительность';
    }
  } else {
    if (durationMin != null || durationMax != null) {
      errors.durationMinMinutes = 'Для фото укажите количество фото';
    }
    if (photoCountMin == null || photoCountMax == null) {
      errors.photoCountMin = 'Укажите количество фото';
    } else if (photoCountMin <= 0) {
      errors.photoCountMin = 'Должно быть больше 0';
    } else if (photoCountMax <= 0) {
      errors.photoCountMax = 'Должно быть больше 0';
    } else if (photoCountMin > photoCountMax) {
      errors.photoCountMax = 'Максимум должен быть ≥ минимума';
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
