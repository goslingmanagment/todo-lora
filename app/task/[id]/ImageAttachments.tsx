'use client';

import { useRef, useTransition } from 'react';
import { deleteAttachmentAction } from '@/lib/server/actions';
import { showToast } from '@/components/Toaster';
import { ACCEPTED_IMAGE_MIMES, MAX_IMAGE_BYTES, useImageUpload } from '@/lib/client/useImageUpload';
import type { AttachmentDto } from './_types';

export function ImageAttachments({
  taskId,
  attachments,
  onChanged,
}: {
  taskId: string;
  attachments: AttachmentDto[];
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const { phase, progress, uploadImage } = useImageUpload();

  const upload = (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Изображение больше 20 МБ', { tone: 'error' });
      return;
    }
    void (async () => {
      try {
        await uploadImage({ taskId, file, caption: null });
        if (fileRef.current) fileRef.current.value = '';
        showToast('Картинка добавлена');
        onChanged();
      } catch (err) {
        showToast((err as Error).message, { tone: 'error' });
      }
    })();
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

  const busy = isPending || phase !== 'idle';
  const buttonLabel =
    phase === 'uploading'
      ? `Загружаем ${Math.round(progress * 100)}%…`
      : phase === 'processing'
      ? 'Обрабатываем…'
      : isPending
      ? 'Подождите…'
      : 'Добавить картинку';

  return (
    <>
      <h2 id="images-heading" className="eyebrow" style={{ margin: '0 0 0.55rem' }}>
        Картинки
      </h2>

      {attachments.length === 0 ? (
        <p className="muted-2" style={{ fontSize: '0.85rem', margin: '0 0 0.6rem' }}>
          Пока нет картинок.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: '0 0 0.85rem',
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '0.6rem',
          }}
        >
          {attachments.map((a) => (
            <li
              key={a.id}
              style={{
                position: 'relative',
                borderRadius: 'var(--radius-card)',
                border: '1px solid var(--color-line)',
                overflow: 'hidden',
                background: 'var(--color-card)',
              }}
            >
              {a.previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={a.previewUrl}
                  alt={a.caption ?? a.originalName ?? 'Вложение'}
                  loading="lazy"
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '10rem',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  className="muted-2"
                  style={{
                    height: '10rem',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.8rem',
                  }}
                >
                  {a.originalName ?? 'image'}
                </div>
              )}
              {a.originalName ? (
                <p
                  className="muted-2"
                  style={{
                    fontSize: '0.7rem',
                    margin: 0,
                    padding: '0.35rem 0.55rem',
                    borderTop: '1px solid var(--color-line)',
                    background: 'var(--color-paper-2)',
                    wordBreak: 'break-word',
                    lineHeight: 1.3,
                  }}
                >
                  {a.originalName}
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(a.id)}
                aria-label="Удалить картинку"
                className="chip chip-gray"
                style={{
                  position: 'absolute',
                  top: '0.4rem',
                  right: '0.4rem',
                  cursor: 'pointer',
                  border: '1px solid var(--color-line)',
                  background: 'color-mix(in srgb, var(--color-paper) 88%, transparent)',
                  backdropFilter: 'blur(4px)',
                  fontSize: '0.7rem',
                }}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="toolbar" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <input
          ref={fileRef}
          id="image-attachment-input"
          type="file"
          accept={ACCEPTED_IMAGE_MIMES}
          aria-label="Выбрать картинку для загрузки"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {buttonLabel}
        </button>
        <span className="muted-2" style={{ fontSize: '0.78rem' }}>
          JPEG / PNG / WebP / HEIC · до 20 МБ
        </span>
      </div>

      {phase === 'uploading' ? (
        <div
          role="progressbar"
          aria-label="Загрузка картинки"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            marginTop: '0.55rem',
            height: '0.35rem',
            borderRadius: '999px',
            background: 'var(--color-paper-2)',
            border: '1px solid var(--color-line)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              background: 'var(--color-accent)',
              transition: 'width 120ms linear',
            }}
          />
        </div>
      ) : null}
      {phase === 'processing' ? (
        <p
          className="muted-2"
          style={{ fontSize: '0.78rem', margin: '0.45rem 0 0' }}
          aria-live="polite"
        >
          Обрабатываем — снимаем EXIF и пересохраняем…
        </p>
      ) : null}
    </>
  );
}
