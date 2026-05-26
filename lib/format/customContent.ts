type CustomContentLike = {
  contentKind?: 'video' | 'photo' | null;
  durationMinSeconds?: number | null;
  durationMaxSeconds?: number | null;
  photoCountMin?: number | null;
  photoCountMax?: number | null;
};

export function customContentKindLabel(kind: CustomContentLike['contentKind']): string {
  return kind === 'photo' ? 'Фото' : 'Видео';
}

export function resolvedCustomContentKind(task: CustomContentLike): 'video' | 'photo' {
  return (
    task.contentKind ??
    (task.photoCountMin != null || task.photoCountMax != null ? 'photo' : 'video')
  );
}

export function formatCustomContentMetric(task: CustomContentLike): string | null {
  const kind = resolvedCustomContentKind(task);
  if (kind === 'photo') {
    return formatPhotoCount(task.photoCountMin ?? null, task.photoCountMax ?? null);
  }

  const min = task.durationMinSeconds != null ? Math.round(task.durationMinSeconds / 60) : null;
  const max = task.durationMaxSeconds != null ? Math.round(task.durationMaxSeconds / 60) : null;
  return formatRange(min, max, 'мин');
}

export function formatMediaVolume(task: CustomContentLike): string | null {
  const parts: string[] = [];
  const photos = formatPhotoCount(task.photoCountMin ?? null, task.photoCountMax ?? null);
  if (photos) parts.push(photos);

  const min = task.durationMinSeconds != null ? Math.round(task.durationMinSeconds / 60) : null;
  const max = task.durationMaxSeconds != null ? Math.round(task.durationMaxSeconds / 60) : null;
  const duration = formatRange(min, max, 'мин');
  if (duration) parts.push(duration);

  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatPhotoCount(min: number | null, max: number | null): string | null {
  return formatRange(min, max, 'фото');
}

function formatRange(min: number | null, max: number | null, unit: string): string | null {
  if (min != null && max != null) return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
  if (min != null) return `${min} ${unit}`;
  if (max != null) return `${max} ${unit}`;
  return null;
}
