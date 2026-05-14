'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  attachments,
  taskEvents,
  tasks,
  userPreferences,
  users,
  type Task,
  type TaskEvent,
} from '@/drizzle/schema';
import { requireAuth } from '@/lib/auth/session';
import {
  changeStatusSchema,
  createTaskSchema,
  deleteTaskSchema,
  recentEventsSchema,
  setAgreementSchema,
  type UpdateTaskOutput,
  updateTaskSchema,
} from '@/lib/validation/schemas';
import { emitTaskInvalidationInTransaction } from '@/lib/realtime/notify';
import { allowedTargets, planTransition } from '@/lib/fsm/taskStatus';
import { deleteObject } from '@/lib/storage/presign';
import { dollarsToCents, minutesToSeconds } from '@/lib/domain/inputs';
import { inferCustomTaskTitle } from '@/lib/domain/taskTitle';
import { isActiveTopicId } from '@/lib/server/lookups';
import { flattenZodErrors, type ActionResult } from './_shared';

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Проверьте поля формы',
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }

  const data = parsed.data;
  const topicErrors = await validateWritableTopic(data.topicId);
  if (topicErrors) {
    return { ok: false, error: 'Проверьте поля формы', fieldErrors: topicErrors };
  }
  if (data.type === 'content_task') {
    const userErrors = await validateActiveContentUsers({
      requesterId: data.requesterId,
      assigneeId: data.assigneeId ?? null,
    });
    if (userErrors) {
      return { ok: false, error: 'Проверьте поля формы', fieldErrors: userErrors };
    }
  }

  const id = await db.transaction(async (tx) => {
    let inserted: { id: string; topicId: string } | undefined;
    let createdTitle = '';

    if (data.type === 'custom') {
      const title =
        data.title && data.title.length > 0
          ? data.title
          : inferCustomTaskTitle({
              buyerHandle: data.buyerHandle,
              buyerDisplayName: data.buyerDisplayName,
              contentKind: data.contentKind,
              description: data.description,
              durationMinMinutes: data.durationMinMinutes,
              durationMaxMinutes: data.durationMaxMinutes,
              photoCountMin: data.photoCountMin,
              photoCountMax: data.photoCountMax,
            });
      createdTitle = title;
      const [row] = await tx
        .insert(tasks)
        .values({
          type: 'custom',
          topicId: data.topicId,
          title,
          description: data.description,
          priority: data.priority,
          deadlineOn: data.deadlineOn,
          createdBy: auth.user.id,
          lastEditedBy: auth.user.id,
          buyerHandle: data.buyerHandle,
          buyerDisplayName: data.buyerDisplayName,
          platform: data.platform,
          contentKind: data.contentKind,
          paymentModel: data.paymentModel,
          amountCents: dollarsToCents(data.amountDollars),
          amountCollectedCents: dollarsToCents(data.amountCollectedDollars ?? 0),
          durationMinSeconds: minutesToSeconds(data.durationMinMinutes),
          durationMaxSeconds: minutesToSeconds(data.durationMaxMinutes),
          photoCountMin: data.photoCountMin ?? null,
          photoCountMax: data.photoCountMax ?? null,
          agreementState: data.agreementState ?? 'pending',
        })
        .returning({ id: tasks.id, topicId: tasks.topicId });
      inserted = row;
    } else {
      const [row] = await tx
        .insert(tasks)
        .values({
          type: 'content_task',
          topicId: data.topicId,
          title: data.title,
          description: data.description,
          priority: data.priority,
          deadlineOn: data.deadlineOn,
          requesterId: data.requesterId,
          assigneeId: data.assigneeId ?? null,
          createdBy: auth.user.id,
          lastEditedBy: auth.user.id,
        })
        .returning({ id: tasks.id, topicId: tasks.topicId });
      createdTitle = data.title;
      inserted = row;
    }

    if (!inserted) throw new Error('Insert returned no row');

    await tx.insert(taskEvents).values({
      taskId: inserted.id,
      actorId: auth.user.id,
      eventType: 'created',
      payload: { type: data.type, title: createdTitle },
    });

    await tx
      .insert(userPreferences)
      .values({
        userId: auth.user.id,
        taskType: data.type,
        lastTopicId: data.topicId,
        lastPlatform: data.type === 'custom' ? data.platform : null,
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.taskType],
        set: {
          lastTopicId: data.topicId,
          lastPlatform: data.type === 'custom' ? data.platform : null,
          updatedAt: sql`date_trunc('milliseconds', now())`,
        },
      });
    await emitTaskInvalidationInTransaction(tx, {
      taskId: inserted.id,
      topicId: inserted.topicId,
      reason: 'created',
      at: Date.now(),
    });
    return inserted.id;
  });

  revalidatePath('/');
  return { ok: true, data: { id } };
}

export async function updateTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Проверьте поля формы',
      fieldErrors: flattenZodErrors(parsed.error),
    };
  }
  const v = parsed.data;
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, v.id) });
  if (!existing) return { ok: false, error: 'Задачи нет', code: 'not_found' };
  const semanticErrors = validateUpdateAgainstExisting(v, existing);
  if (semanticErrors) {
    return { ok: false, error: 'Проверьте поля формы', fieldErrors: semanticErrors };
  }
  if (v.topicId !== undefined) {
    const topicErrors = await validateWritableTopic(v.topicId, existing);
    if (topicErrors) {
      return { ok: false, error: 'Проверьте поля формы', fieldErrors: topicErrors };
    }
  }
  if (existing.type === 'content_task') {
    const userErrors = await validateActiveContentUsers(
      {
        requesterId: v.requesterId ?? undefined,
        assigneeId: v.assigneeId ?? undefined,
      },
      existing,
    );
    if (userErrors) {
      return { ok: false, error: 'Проверьте поля формы', fieldErrors: userErrors };
    }
  }

  const patch: Partial<typeof tasks.$inferInsert> = {
    lastEditedBy: auth.user.id,
  };
  if (v.description !== undefined) patch.description = v.description;
  if (v.priority !== undefined) patch.priority = v.priority;
  if (v.deadlineOn !== undefined) patch.deadlineOn = v.deadlineOn;
  if (v.topicId !== undefined) patch.topicId = v.topicId;

  if (existing.type === 'custom') {
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
    const resolvedContentKind =
      v.contentKind ?? existingContentKind;
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
  }
  if (existing.type === 'content_task') {
    if (v.title !== undefined) patch.title = v.title;
    if (v.requesterId !== undefined) patch.requesterId = v.requesterId;
    if (v.assigneeId !== undefined) patch.assigneeId = v.assigneeId;
  }

  // OCC gate (§9.3, same pattern as changeStatusAction).
  const updated = await db.transaction(async (tx) => {
    const result = await tx
      .update(tasks)
      .set(patch)
      .where(and(eq(tasks.id, v.id), eq(tasks.version, v.expectedVersion)))
      .returning({ id: tasks.id });

    if (result.length === 0) return null;

    await tx.insert(taskEvents).values({
      taskId: v.id,
      actorId: auth.user.id,
      eventType: 'edited',
      payload: { fields: Object.keys(patch).filter((k) => k !== 'lastEditedBy') },
    });

    await emitTaskInvalidationInTransaction(tx, {
      taskId: v.id,
      topicId: v.topicId ?? existing.topicId,
      reason: 'edited',
      at: Date.now(),
    });
    return result[0] ?? null;
  });

  if (!updated) {
    return { ok: false, error: 'Задачу только что изменили', code: 'stale' };
  }

  revalidatePath('/');
  revalidatePath(`/task/${v.id}`);
  return { ok: true, data: { id: v.id } };
}

export async function changeStatusAction(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const parsed = changeStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Неверный запрос' };
  const { id, newStatus, expectedVersion } = parsed.data;

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!existing) return { ok: false, error: 'Задачи нет', code: 'not_found' };

  const plan = planTransition(existing.type, existing.status, newStatus);
  if (!plan.ok) {
    if (plan.code === 'noop') return { ok: false, error: 'Статус не изменился' };
    return {
      ok: false,
      error: 'Этот переход недоступен',
      code: plan.code,
    };
  }
  if (
    existing.type === 'custom' &&
    newStatus === 'delivered' &&
    existing.agreementState !== 'confirmed'
  ) {
    return {
      ok: false,
      error: 'Перед доставкой подтвердите договорённость',
      code: 'agreement_pending',
    };
  }

  // OCC gate (§9.3)
  const updated = await db.transaction(async (tx) => {
    const result = await tx
      .update(tasks)
      .set({ status: newStatus, lastEditedBy: auth.user.id })
      .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
      .returning({ id: tasks.id, status: tasks.status, updatedAt: tasks.updatedAt });

    if (result.length === 0) return null;

    await tx.insert(taskEvents).values({
      taskId: id,
      actorId: auth.user.id,
      eventType:
        plan.rule.kind === 'cancel'
          ? 'cancelled'
          : plan.rule.kind === 'reopen'
            ? 'reopened'
            : 'status_changed',
      payload: { from: existing.status, to: newStatus, kind: plan.rule.kind },
    });

    await emitTaskInvalidationInTransaction(tx, {
      taskId: id,
      topicId: existing.topicId,
      reason: 'status_changed',
      at: Date.now(),
    });
    return result[0] ?? null;
  });

  if (!updated) {
    return { ok: false, error: 'Задачу только что изменили', code: 'stale' };
  }

  revalidatePath('/');
  revalidatePath(`/task/${id}`);
  return { ok: true, data: { id, status: newStatus } };
}

export async function setAgreementStateAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const parsed = setAgreementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Неверный запрос' };
  const { id, agreementState, expectedVersion } = parsed.data;

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!existing) return { ok: false, error: 'Задачи нет' };
  if (existing.type !== 'custom') {
    return { ok: false, error: 'Только для Custom' };
  }

  const updated = await db.transaction(async (tx) => {
    const result = await tx
      .update(tasks)
      .set({ agreementState, lastEditedBy: auth.user.id })
      .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
      .returning({ id: tasks.id });

    if (result.length === 0) return null;

    await tx.insert(taskEvents).values({
      taskId: id,
      actorId: auth.user.id,
      eventType: 'edited',
      payload: { fields: ['agreementState'], to: agreementState },
    });

    await emitTaskInvalidationInTransaction(tx, {
      taskId: id,
      topicId: existing.topicId,
      reason: 'agreement_changed',
      at: Date.now(),
    });
    return result[0] ?? null;
  });

  if (!updated) {
    return { ok: false, error: 'Задачу только что изменили', code: 'stale' };
  }

  revalidatePath('/');
  revalidatePath(`/task/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const parsed = deleteTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Неверный запрос' };
  const { id, expectedVersion } = parsed.data;

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!existing) return { ok: false, error: 'Задачи нет', code: 'not_found' };

  // Snapshot the MinIO object keys before CASCADE removes their rows. We
  // need these to clean up storage; the DB cascade would otherwise drop the
  // rows but leave the objects orphaned in the bucket.
  const imageKeys = await db
    .select({ key: attachments.objectKey })
    .from(attachments)
    .where(and(eq(attachments.taskId, id), isNotNull(attachments.objectKey)));

  // OCC gate (§9.3): refuse if another client mutated since the form loaded.
  const deleted = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
      .returning({ id: tasks.id, topicId: tasks.topicId });
    const row = rows[0] ?? null;
    if (!row) return null;
    await emitTaskInvalidationInTransaction(tx, {
      taskId: id,
      topicId: existing.topicId,
      reason: 'deleted',
      at: Date.now(),
    });
    return row;
  });

  if (!deleted) {
    return { ok: false, error: 'Задачу только что изменили', code: 'stale' };
  }

  // CASCADE has now removed task_events and attachment rows. Best-effort
  // cleanup of the actual MinIO bytes — failures here don't affect the
  // task delete result (the row is already gone).
  for (const { key } of imageKeys) {
    if (key) void deleteObject(key);
  }

  revalidatePath('/');
  return { ok: true, data: { id } };
}

export async function listAllowedTransitionsAction(
  taskId: string,
): Promise<ActionResult<{ status: string; targets: string[] }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };
  const t = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!t) return { ok: false, error: 'Задачи нет' };
  return { ok: true, data: { status: t.status, targets: allowedTargets(t.type, t.status) } };
}

export async function getRecentEventsAction(
  input: unknown,
): Promise<ActionResult<{ events: TaskEvent[] }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };
  const parsed = recentEventsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Неверный запрос' };
  const { taskId, limit } = parsed.data;
  const events = await db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(desc(taskEvents.createdAt))
    .limit(limit);
  return { ok: true, data: { events } };
}

// `validateUpdateAgainstExisting` is a sync helper, not a server action.
// 'use server' files only allow async function exports, so this stays
// module-private. If a peer needs it, lift it into _shared.ts instead.
function validateUpdateAgainstExisting(
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

  // Custom create requires amount > 0 (createCustomSchema). Don't let an edit
  // wipe it back to null/0 — that would silently break "outstanding" totals
  // and the unlock-payment CHECK constraint at the DB level.
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

async function validateWritableTopic(
  topicId: string,
  existing?: Task,
): Promise<Record<string, string> | null> {
  if (existing && topicId === existing.topicId) return null;
  if (await isActiveTopicId(topicId)) return null;
  return { topicId: 'Выберите активную тему' };
}

async function validateActiveContentUsers(
  input: { requesterId?: string | null; assigneeId?: string | null },
  existing?: Task,
): Promise<Record<string, string> | null> {
  const requested = [
    ['requesterId', input.requesterId, existing?.requesterId] as const,
    ['assigneeId', input.assigneeId, existing?.assigneeId] as const,
  ].filter(
    (
      entry,
    ): entry is readonly ['requesterId' | 'assigneeId', string, string | null | undefined] => {
      const [, next, current] = entry;
      return Boolean(next && next !== current);
    },
  );

  if (requested.length === 0) return null;

  const ids = Array.from(new Set(requested.map(([, id]) => id)));
  const activeRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), isNull(users.disabledAt)));
  const active = new Set(activeRows.map((row) => row.id));

  const errors: Record<string, string> = {};
  for (const [field, id] of requested) {
    if (!active.has(id)) {
      errors[field] = 'Выберите активного пользователя';
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
