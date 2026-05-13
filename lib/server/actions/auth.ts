'use server';

import { redirect } from 'next/navigation';
import { destroyCurrentSession } from '@/lib/auth/session';
import { attemptLogin } from '@/lib/auth/login';
import { loginCodeSchema } from '@/lib/validation/schemas';
import type { ActionResult } from './_shared';

export async function loginAction(_prev: unknown, formData: FormData): Promise<ActionResult<{ ok: true }>> {
  const code = String(formData.get('code') ?? '');
  const parsed = loginCodeSchema.safeParse({ code });
  if (!parsed.success) {
    return { ok: false, error: 'Введите ваш код' };
  }
  const result = await attemptLogin(parsed.data.code);
  if (result.ok) return { ok: true, data: { ok: true } };
  if (result.reason === 'rate_limited') {
    const seconds = Math.ceil((result.retryAfterMs ?? 0) / 1000);
    return { ok: false, error: `Слишком много попыток. Подождите ${seconds} сек.` };
  }
  return { ok: false, error: 'Неверный код' };
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect('/login');
}
