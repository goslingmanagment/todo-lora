'use client';

import { useState, useTransition } from 'react';
import { createUrlAttachmentAction, deleteAttachmentAction } from '@/lib/server/actions';
import { showToast } from '@/components/Toaster';
import type { AttachmentDto } from './_types';

export function UrlAttachments({
  taskId,
  attachments,
  onChanged,
}: {
  taskId: string;
  attachments: AttachmentDto[];
  onChanged: () => void;
}) {
  const [draftUrl, setDraftUrl] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [isPending, startTransition] = useTransition();

  const add = () => {
    const url = draftUrl.trim();
    if (!url) return;
    startTransition(async () => {
      const res = await createUrlAttachmentAction({
        taskId,
        url,
        caption: draftCaption.trim() || null,
      });
      if (res.ok) {
        setDraftUrl('');
        setDraftCaption('');
        showToast('Ссылка добавлена');
        onChanged();
      } else {
        showToast(res.error, { tone: 'error' });
      }
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await deleteAttachmentAction({ id });
      if (res.ok) {
        showToast('Удалено');
        onChanged();
      } else {
        showToast(res.error, { tone: 'error' });
      }
    });
  };

  return (
    <>
      <h2 id="urls-heading" className="eyebrow" style={{ margin: '0 0 0.55rem' }}>
        Ссылки на референсы
      </h2>

      {attachments.length === 0 ? (
        <p className="muted-2" style={{ fontSize: '0.85rem', margin: '0 0 0.6rem' }}>
          Пока нет ссылок.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 0 0.85rem',
            display: 'grid',
            gap: '0.4rem',
          }}
        >
          {attachments.map((a) => (
            <li
              key={a.id}
              style={{
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'baseline',
                fontSize: '0.9rem',
                padding: '0.4rem 0.55rem',
                border: '1px solid color-mix(in srgb, var(--color-line) 70%, transparent)',
                borderRadius: '10px',
                background: 'color-mix(in srgb, var(--color-paper-2) 35%, transparent)',
              }}
            >
              <a
                href={a.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--color-accent)',
                  textDecoration: 'none',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={a.url ?? ''}
              >
                {a.url}
              </a>
              {a.caption ? (
                <span className="muted-2" style={{ fontSize: '0.8rem' }}>
                  {a.caption}
                </span>
              ) : null}
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => remove(a.id)}
                disabled={isPending}
                style={{ padding: '0.2rem 0.55rem', fontSize: '0.78rem' }}
              >
                Убрать
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className="panel-soft"
        style={{ display: 'grid', gap: '0.55rem', padding: '0.7rem 0.75rem' }}
      >
        <div style={{ display: 'grid', gap: '0.55rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div>
            <label htmlFor="new-url" className="label">Ссылка</label>
            <input
              id="new-url"
              className="input"
              placeholder="https://…"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="new-url-caption" className="label">Подпись</label>
            <input
              id="new-url-caption"
              className="input"
              placeholder="Необязательно"
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn"
            onClick={add}
            disabled={isPending || draftUrl.trim().length === 0}
          >
            Добавить ссылку
          </button>
        </div>
      </div>
    </>
  );
}
