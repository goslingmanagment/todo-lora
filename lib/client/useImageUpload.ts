'use client';

import { useCallback, useState } from 'react';
import {
  createImageUploadIntentAction,
  finalizeImageAttachmentAction,
} from '@/lib/server/actions';

export type UploadPhase = 'idle' | 'uploading' | 'processing';

export const ACCEPTED_IMAGE_MIMES = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function normalizeImageMime(file: File): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

export function useImageUpload() {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);

  const uploadImage = useCallback(
    async ({
      taskId,
      file,
      caption = null,
    }: {
      taskId: string;
      file: File;
      caption?: string | null;
    }) => {
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error('Изображение больше 20 МБ');
      }

      setPhase('uploading');
      setProgress(0);
      try {
        const mimeType = normalizeImageMime(file);
        const intent = await createImageUploadIntentAction({
          taskId,
          filename: file.name,
          mimeType,
          sizeBytes: file.size,
        });
        if (!intent.ok) throw new Error(intent.error);

        try {
          await uploadWithProgress(
            intent.data.url,
            intent.data.method,
            intent.data.headers,
            file,
            (p) => setProgress(p),
          );
        } catch {
          throw new Error('Не удалось загрузить файл');
        }

        setPhase('processing');
        setProgress(1);
        const final = await finalizeImageAttachmentAction({
          taskId,
          stagingKey: intent.data.stagingKey,
          filename: file.name,
          caption,
        });
        if (!final.ok) throw new Error(final.error);
        return final.data;
      } finally {
        setPhase('idle');
        setProgress(0);
      }
    },
    [],
  );

  return { phase, progress, uploadImage };
}

function uploadWithProgress(
  url: string,
  method: string,
  headers: Record<string, string>,
  file: File,
  onPercent: (p: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPercent(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`PUT failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during PUT'));
    xhr.send(file);
  });
}
