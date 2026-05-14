import type { CustomContentKind } from '@/drizzle/schema/enums';

export type CustomPayStatus = 'full' | 'half' | 'partial75' | 'custom';

export type DurationRangeResult =
  | { ok: true; min: number | null; max: number | null }
  | { ok: false; error: string };

export type PhotoCountRangeResult =
  | { ok: true; min: number; max: number }
  | { ok: false; error: string };

// Accepts "5", "5 мин", "7-8", "7 - 8", "7–8", "7—8". Empty -> both nulls.
export function parseDurationRange(text: string): DurationRangeResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, min: null, max: null };
  const minuteSuffix = String.raw`\s*(?:мин\.?|минута|минуты|минут)?`;
  const range = trimmed.match(new RegExp(String.raw`^(\d+)\s*[-–—]\s*(\d+)${minuteSuffix}$`, 'i'));
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { ok: false, error: 'Укажите минуты: 5 или 7-8' };
    }
    if (min > max) return { ok: false, error: 'Минимум больше максимума' };
    return { ok: true, min, max };
  }
  const single = trimmed.match(new RegExp(String.raw`^(\d+)${minuteSuffix}$`, 'i'));
  if (single) {
    const n = Number(single[1]);
    return { ok: true, min: n, max: n };
  }
  return { ok: false, error: 'Укажите минуты: 5 или 7-8' };
}

export function parsePhotoCountRange(text: string): PhotoCountRangeResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Укажите фото: 5 или 5-10' };
  const photoSuffix = String.raw`\s*(?:фото|фотки|фоток|шт\.?|штук)?`;
  const range = trimmed.match(new RegExp(String.raw`^(\d+)\s*[-–—]\s*(\d+)${photoSuffix}$`, 'i'));
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
      return { ok: false, error: 'Укажите фото: 5 или 5-10' };
    }
    if (min > max) return { ok: false, error: 'Минимум больше максимума' };
    return { ok: true, min, max };
  }
  const single = trimmed.match(new RegExp(String.raw`^(\d+)${photoSuffix}$`, 'i'));
  if (single) {
    const n = Number(single[1]);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Укажите фото: 5 или 5-10' };
    return { ok: true, min: n, max: n };
  }
  return { ok: false, error: 'Укажите фото: 5 или 5-10' };
}

export function composeCustomDescription(
  contentKind: CustomContentKind,
  brief: string,
  clothing: string,
  notes: string,
): string | null {
  const b = brief.trim();
  const c = clothing.trim();
  const n = notes.trim();
  const parts: string[] = [];
  if (b) parts.push(`${contentKind === 'photo' ? '📸' : '🎥'} Описание задания:\n${b}`);
  if (c) parts.push(`👗 Одежда:\n${c}`);
  if (n) parts.push(`📝 Заметки:\n${n}`);
  return parts.length === 0 ? null : parts.join('\n\n');
}

export function presetCollected(
  preset: CustomPayStatus,
  amount: number,
  customCollected: number | null,
): number {
  switch (preset) {
    case 'full':
      return amount;
    case 'half':
      return Math.floor(amount * 0.5);
    case 'partial75':
      return Math.floor(amount * 0.75);
    case 'custom':
      return Math.max(0, customCollected ?? 0);
  }
}

export function payPresetSummary(
  preset: CustomPayStatus,
  amount: number,
  collected: number,
): { text: string; warn: boolean } {
  if (preset === 'full') {
    return { text: `Полная предоплата $${amount}`, warn: false };
  }
  return {
    text: `Получено $${collected} из $${amount}`,
    warn: collected < amount,
  };
}
