'use client';

import { useEffect, useState } from 'react';
import { formatRelativeTimeRu } from '@/lib/format/dates';
import { tokenizeLinkified } from '@/lib/format/text';

export function Fact({
  label,
  children,
  tabular,
}: {
  label: string;
  children: React.ReactNode;
  tabular?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
      <dt className="eyebrow" style={{ margin: 0 }}>
        {label}
      </dt>
      <dd
        className={tabular ? 'tabular' : undefined}
        style={{ margin: 0, color: 'var(--color-ink)', fontSize: '0.95rem' }}
      >
        {children}
      </dd>
    </div>
  );
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="field-error">
      {error}
    </p>
  );
}

export function LinkifiedText({ value }: { value: string }) {
  const segs = tokenizeLinkified(value);
  return (
    <>
      {segs.map((s, i) =>
        s.kind === 'url' ? (
          <a
            key={i}
            href={s.value}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{ color: 'var(--color-accent)', wordBreak: 'break-word' }}
          >
            {s.value}
          </a>
        ) : (
          <span key={i}>{s.value}</span>
        ),
      )}
    </>
  );
}

export function UpdatedMeta({
  updatedAtIso,
  lastEditedByName,
}: {
  updatedAtIso: string;
  lastEditedByName: string | null;
}) {
  // Re-render once a minute so «4 минуты назад» does not freeze on a tab the
  // operator leaves open. Cheap: one tick per minute per detail page.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const updatedAt = new Date(updatedAtIso);
  const relative = formatRelativeTimeRu(updatedAt);
  return (
    <p
      className="muted-2"
      style={{ margin: 0, fontSize: '0.8rem' }}
      title={updatedAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
    >
      Обновлено {relative}
      {lastEditedByName ? <> · {lastEditedByName}</> : null}
    </p>
  );
}

export function HardDeleteDialog({
  taskTitle,
  onCancel,
  onConfirm,
  isPending,
}: {
  taskTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  // Close on Escape so keyboard users have an easy out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hard-delete-title"
      aria-describedby="hard-delete-body"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'color-mix(in srgb, var(--color-ink) 28%, transparent)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
      onClick={(e) => {
        // Click on backdrop dismisses; clicks on the dialog itself don't.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: '28rem',
          width: '100%',
          background: 'var(--color-paper)',
          padding: '1.25rem',
          display: 'grid',
          gap: '0.75rem',
        }}
      >
        <h2 id="hard-delete-title" className="section-title" style={{ margin: 0, fontSize: '1.15rem' }}>
          Удалить задачу безвозвратно?
        </h2>
        <p id="hard-delete-body" style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>
          «{taskTitle}» исчезнет из ленты, поиска и истории, а вложения будут стёрты из хранилища. Это действие нельзя отменить.
        </p>
        <div className="toolbar" style={{ marginTop: '0.5rem', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel} disabled={isPending}>
            Отмена
          </button>
          <button
            type="button"
            className="btn"
            onClick={onConfirm}
            disabled={isPending}
            style={{
              background: 'var(--color-state-red)',
              color: 'var(--color-paper)',
              borderColor: 'var(--color-state-red)',
            }}
            autoFocus
          >
            {isPending ? 'Удаляем…' : 'Удалить навсегда'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function agreementChipClass(s: 'pending' | 'confirmed' | 'rejected'): string {
  if (s === 'confirmed') return 'chip chip-green chip-outline';
  if (s === 'rejected') return 'chip chip-red chip-outline';
  return 'chip chip-amber chip-outline';
}

export function translateEventType(t: string): string {
  switch (t) {
    case 'created': return 'создал';
    case 'edited': return 'редактировал';
    case 'status_changed': return 'сменил статус';
    case 'cancelled': return 'отменил';
    case 'reopened': return 'переоткрыл';
    case 'attachment_added': return 'добавил вложение';
    case 'attachment_removed': return 'убрал вложение';
    default: return t;
  }
}

export function summarizePayload(p: Record<string, unknown>): string {
  if ('to' in p && 'from' in p) return `(${String(p.from)} → ${String(p.to)})`;
  if ('fields' in p && Array.isArray(p.fields)) return `(${p.fields.join(', ')})`;
  if ('kind' in p) return `(${String(p.kind)})`;
  return '';
}
