'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { clearDemoTasks, seedDemoTasks } from '@/lib/server/demo-data';
import type { ActionResult } from './_shared';

export async function seedDemoDataAction(): Promise<
  ActionResult<{ inserted: number; existing: number }>
> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const result = await seedDemoTasks(auth.user.id);
  revalidatePath('/');
  return { ok: true, data: { inserted: result.inserted, existing: result.existing } };
}

export async function clearDemoDataAction(): Promise<ActionResult<{ deleted: number }>> {
  const auth = await requireAuth().catch(() => null);
  if (!auth) return { ok: false, error: 'Сессия не найдена', code: 'unauthenticated' };

  const result = await clearDemoTasks();
  revalidatePath('/');
  return { ok: true, data: { deleted: result.deleted } };
}
