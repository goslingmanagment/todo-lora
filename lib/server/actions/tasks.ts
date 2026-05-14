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
  updateTaskSchema,
} from '@/lib/validation/schemas';
import { allowedTargets, planTransition } from '@/lib/fsm/taskStatus';
import { deleteObject } from '@/lib/storage/presign';
import { dollarsToCents, minutesToSeconds } from '@/lib/domain/inputs';
import { inferCustomTaskTitle } from '@/lib/domain/taskTitle';
import {
  buildCustomTaskUpdatePatch,
  validateCustomTaskUpdate,
} from '@/lib/server/customTaskUpdate';
import { isActiveTopicId } from '@/lib/server/lookups';
import { notifyTaskMutation, recordTaskEventAndNotify } from '@/lib/server/taskMutation';
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

    await recordTaskEventAndNotify(
      tx,
      {
        taskId: inserted.id,
        actorId: auth.user.id,
        eventType: 'created',
        payload: { type: data.type, title: createdTitle },
      },
      {
        taskId: inserted.id,
        topicId: inserted.topicId,
        reason: 'created',
      },
    );

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
  const semanticErrors = validateCustomTaskUpdate(v, existing);
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
    Object.assign(patch, buildCustomTaskUpdatePatch(v, existing));
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

    await recordTaskEventAndNotify(
      tx,
      {
        taskId: v.id,
        actorId: auth.user.id,
        eventType: 'edited',
        payload: { fields: Object.keys(patch).filter((k) => k !== 'lastEditedBy') },
      },
      {
        taskId: v.id,
        topicId: v.topicId ?? existing.topicId,
        reason: 'edited',
      },
    );
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

    await recordTaskEventAndNotify(
      tx,
      {
        taskId: id,
        actorId: auth.user.id,
        eventType:
          plan.rule.kind === 'cancel'
            ? 'cancelled'
            : plan.rule.kind === 'reopen'
              ? 'reopened'
              : 'status_changed',
        payload: { from: existing.status, to: newStatus, kind: plan.rule.kind },
      },
      {
        taskId: id,
        topicId: existing.topicId,
        reason: 'status_changed',
      },
    );
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

    await recordTaskEventAndNotify(
      tx,
      {
        taskId: id,
        actorId: auth.user.id,
        eventType: 'edited',
        payload: { fields: ['agreementState'], to: agreementState },
      },
      {
        taskId: id,
        topicId: existing.topicId,
        reason: 'agreement_changed',
      },
    );
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
    await notifyTaskMutation(tx, {
      taskId: id,
      topicId: existing.topicId,
      reason: 'deleted',
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
