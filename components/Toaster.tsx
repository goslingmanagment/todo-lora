'use client';

import { useEffect, useState } from 'react';

type Toast = { id: number; tone: 'info' | 'error'; message: string; action?: { label: string; href?: string } };

let counter = 1;
let dispatch: ((t: Toast) => void) | null = null;

export function showToast(message: string, opts: { tone?: 'info' | 'error'; action?: Toast['action'] } = {}) {
  if (!dispatch) return;
  dispatch({ id: counter++, message, tone: opts.tone ?? 'info', action: opts.action });
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    dispatch = (t) => setToasts((prev) => [...prev, t]);
    return () => {
      dispatch = null;
    };
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const t = toasts[0]!;
    const handle = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 4500);
    return () => clearTimeout(handle);
  }, [toasts]);

  if (toasts.length === 0) return null;
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className={t.tone === 'error' ? 'toast toast-error' : 'toast'} role="status">
          <span>{t.message}</span>
          {t.action ? (
            t.action.href ? (
              <a className="btn" href={t.action.href}>
                {t.action.label}
              </a>
            ) : null
          ) : null}
        </div>
      ))}
    </div>
  );
}
