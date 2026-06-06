'use client';

import { useEffect, useState } from 'react';

const TOAST_TTL_MS = 4500;

type Toast = {
  id: number;
  tone: 'info' | 'error';
  message: string;
  expiresAt: number;
  action?: { label: string; href?: string };
};

let counter = 1;
let dispatch: ((t: Toast) => void) | null = null;

export function showToast(
  message: string,
  opts: { tone?: 'info' | 'error'; action?: Toast['action'] } = {},
) {
  if (!dispatch) return;
  dispatch({
    id: counter++,
    message,
    tone: opts.tone ?? 'info',
    expiresAt: Date.now() + TOAST_TTL_MS,
    action: opts.action,
  });
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
    const nextExpiresAt = Math.min(...toasts.map((t) => t.expiresAt));
    const handle = setTimeout(
      () => {
        const now = Date.now();
        setToasts((prev) => prev.filter((t) => t.expiresAt > now));
      },
      Math.max(0, nextExpiresAt - Date.now()),
    );
    return () => clearTimeout(handle);
  }, [toasts]);

  if (toasts.length === 0) return null;
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={t.tone === 'error' ? 'toast toast-error' : 'toast'}
          role="status"
        >
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
