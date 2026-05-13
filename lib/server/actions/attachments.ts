'use server';

import { revalidatePath } from 'next/cache';
import { count, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { attachments, taskEvents, tasks } from '@/drizzle/schema';
import { requireAuth } from '@/lib/auth/session';
import {
  deleteAttachmentSchema,
  finalizeImageSchema,
  imageUploadIntentSchema,
  urlAttachmentSchema,
} from '@/lib/validation/schemas';
import { emitTaskInvalidationInTransaction } from '@/lib/realtime/notify';
import { createUploadPresign, deleteObject } from '@/lib/storage/presign';
import { sanitizeStagedImage } from '@/lib/storage/sanitize';
import { ATTACHMENT_LIMIT, flattenZodErrors, type ActionResult } from './_shared';

export async function createUrlAttachmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const parsed = urlAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Проверьте ссылку', fieldErrors: flattenZodErrors(parsed.error) };
  }
  const v = parsed.data;
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, v.taskId) });
  if (!task) return { ok: false, error: 'Задачи нет' };

  const id = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${v.taskId}, 0))`);
    const limitRows = await tx
      .select({ value: count() })
      .from(attachments)
      .where(eq(attachments.taskId, v.taskId));
    if ((limitRows[0]?.value ?? 0) >= ATTACHMENT_LIMIT) return null;

    const [row] = await tx
      .insert(attachments)
      .values({
        taskId: v.taskId,
        kind: 'url',
        url: v.url,
        caption: v.caption ?? null,
        uploadedBy: auth.user.id,
      })
      .returning({ id: attachments.id });
    if (!row) throw new Error('Insert returned no row');
    await tx.insert(taskEvents).values({
      taskId: v.taskId,
      actorId: auth.user.id,
      eventType: 'attachment_added',
      payload: { kind: 'url' },
    });
    await tx.update(tasks).set({ lastEditedBy: auth.user.id }).where(eq(tasks.id, v.taskId));
    await emitTaskInvalidationInTransaction(tx, {
      taskId: v.taskId,
      topicId: task.topicId,
      reason: 'attachment_added',
      at: Date.now(),
    });
    return row.id;
  });
  if (!id) return { ok: false, error: 'Достигнут предел в 10 вложений' };

  revalidatePath(`/task/${v.taskId}`);
  return { ok: true, data: { id } };
}

export async function createImageUploadIntentAction(input: unknown): Promise<ActionResult<{
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  stagingKey: string;
  expiresAt: number;
}>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const parsed = imageUploadIntentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Файл не подходит', fieldErrors: flattenZodErrors(parsed.error) };
  }
  const { taskId, filename, mimeType } = parsed.data;
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) return { ok: false, error: 'Задачи нет' };
  const rows = await db
    .select({ value: count() })
    .from(attachments)
    .where(eq(attachments.taskId, taskId));
  if ((rows[0]?.value ?? 0) >= ATTACHMENT_LIMIT) {
    return { ok: false, error: 'Достигнут предел в 10 вложений' };
  }

  try {
    const intent = await createUploadPresign(taskId, filename, mimeType);
    return { ok: true, data: intent };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function finalizeImageAttachmentAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const parsed = finalizeImageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Неверный запрос', fieldErrors: flattenZodErrors(parsed.error) };
  }
  const { taskId, stagingKey, filename, caption } = parsed.data;
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) {
    // Don't let an upload to a task that no longer exists leave the staged
    // (still-with-EXIF) bytes sitting in MinIO.
    void deleteObject(stagingKey);
    return { ok: false, error: 'Задачи нет' };
  }

  const precheckRows = await db
    .select({ value: count() })
    .from(attachments)
    .where(eq(attachments.taskId, taskId));
  if ((precheckRows[0]?.value ?? 0) >= ATTACHMENT_LIMIT) {
    void deleteObject(stagingKey);
    return { ok: false, error: 'Достигнут предел в 10 вложений' };
  }

  let canonical: Awaited<ReturnType<typeof sanitizeStagedImage>> | null = null;
  try {
    try {
      canonical = await sanitizeStagedImage(taskId, stagingKey);
    } catch {
      // sanitizeStagedImage already best-effort deletes the staging key on
      // its own failure paths; we still bubble up so the caller sees the
      // SANITIZE_FAILED response.
      throw new Error('SANITIZE_FAILED');
    }
    const sanitized = canonical;

    const id = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${taskId}, 0))`);
      const limitRows = await tx
        .select({ value: count() })
        .from(attachments)
        .where(eq(attachments.taskId, taskId));
      if ((limitRows[0]?.value ?? 0) >= ATTACHMENT_LIMIT) return null;

      const [row] = await tx
        .insert(attachments)
        .values({
          taskId,
          kind: 'image',
          objectKey: sanitized.objectKey,
          mimeType: sanitized.mimeType,
          sizeBytes: sanitized.sizeBytes,
          originalName: filename,
          caption: caption ?? null,
          uploadedBy: auth.user.id,
        })
        .returning({ id: attachments.id });
      if (!row) throw new Error('Insert returned no row');
      await tx.insert(taskEvents).values({
        taskId,
        actorId: auth.user.id,
        eventType: 'attachment_added',
        payload: { kind: 'image', mimeType: sanitized.mimeType, sizeBytes: sanitized.sizeBytes },
      });
      await tx.update(tasks).set({ lastEditedBy: auth.user.id }).where(eq(tasks.id, taskId));
      await emitTaskInvalidationInTransaction(tx, {
        taskId,
        topicId: task.topicId,
        reason: 'attachment_added',
        at: Date.now(),
      });
      return row.id;
    });

    if (!id) {
      await deleteObject(sanitized.objectKey);
      return { ok: false, error: 'Достигнут предел в 10 вложений' };
    }

    revalidatePath(`/task/${taskId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    if ((err as Error).message === 'SANITIZE_FAILED') {
      await deleteObject(stagingKey);
      return { ok: false, error: 'Не удалось обработать изображение', code: 'sanitize_failed' };
    }
    if (canonical) {
      await deleteObject(canonical.objectKey);
    } else {
      // The canonical object was never written; the staged upload is still
      // safe to clean up before surfacing the unexpected error.
      void deleteObject(stagingKey);
    }
    throw err;
  }
}

export async function deleteAttachmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const parsed = deleteAttachmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Неверный запрос' };
  const { id } = parsed.data;

  const deleted = await db.transaction(async (tx) => {
    const [found] = await tx
      .delete(attachments)
      .where(eq(attachments.id, id))
      .returning({
        id: attachments.id,
        taskId: attachments.taskId,
        kind: attachments.kind,
        objectKey: attachments.objectKey,
      });
    if (!found) return null;

    await tx.insert(taskEvents).values({
      taskId: found.taskId,
      actorId: auth.user.id,
      eventType: 'attachment_removed',
      payload: { kind: found.kind },
    });
    await tx.update(tasks).set({ lastEditedBy: auth.user.id }).where(eq(tasks.id, found.taskId));
    const [task] = await tx
      .select({ topicId: tasks.topicId })
      .from(tasks)
      .where(eq(tasks.id, found.taskId))
      .limit(1);
    await emitTaskInvalidationInTransaction(tx, {
      taskId: found.taskId,
      topicId: task?.topicId ?? null,
      reason: 'attachment_removed',
      at: Date.now(),
    });
    return found;
  });

  if (!deleted) return { ok: false, error: 'Вложения нет', code: 'not_found' };

  if (deleted.objectKey) {
    // Storage cleanup is intentionally best-effort after commit: the DB row is
    // already gone, and a transient MinIO delete failure should not resurrect it.
    void deleteObject(deleted.objectKey);
  }

  revalidatePath(`/task/${deleted.taskId}`);
  return { ok: true, data: { id } };
}
