'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { loginAction } from '@/lib/server/actions';
import { sanitizeLoginNext } from '@/lib/auth/redirect';

const LOGIN_TIMEOUT_MS = 10_000;

export function LoginForm({ next }: { next: string }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData();
        fd.set('code', code);
        startTransition(async () => {
          // Hard timeout so a hung server action (e.g. dev-server HMR thrash,
          // Postgres unreachable, network blip) doesn't leave the only escape
          // as "reload the page". Without this the button shows "Проверяем…"
          // forever.
          let timer: ReturnType<typeof setTimeout> | null = null;
          const timeout = new Promise<{ ok: false; error: string; code: 'timeout' }>(
            (resolve) => {
              timer = setTimeout(
                () =>
                  resolve({
                    ok: false,
                    error: 'Сервер не ответил. Попробуйте ещё раз.',
                    code: 'timeout',
                  }),
                LOGIN_TIMEOUT_MS,
              );
            },
          );
          let res;
          try {
            res = await Promise.race([loginAction(undefined, fd), timeout]);
          } catch {
            res = { ok: false as const, error: 'Не удалось войти. Попробуйте ещё раз.' };
          } finally {
            if (timer) clearTimeout(timer);
          }
          if (res.ok) {
            router.replace(sanitizeLoginNext(next));
          } else {
            setError(res.error);
          }
        });
      }}
      noValidate
      style={{ display: 'grid', gap: '1rem' }}
    >
      <div>
        <label htmlFor="code" className="label">
          Код
        </label>
        <input
          id="code"
          name="code"
          autoComplete="one-time-code"
          autoFocus
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="input tabular"
          style={{
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.18em',
            fontSize: '1rem',
            padding: '0.7rem 0.85rem',
          }}
          inputMode="text"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'code-error' : undefined}
          spellCheck={false}
          disabled={isPending}
          placeholder="XXXXXXXX"
        />
        {error ? (
          <p id="code-error" role="alert" className="field-error">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: '100%', padding: '0.7rem 1rem' }}
        disabled={isPending || code.trim().length === 0}
      >
        {isPending ? 'Проверяем…' : 'Войти'}
      </button>
    </form>
  );
}
