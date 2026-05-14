import { describe, expect, it } from 'vitest';
import {
  composeCustomDescription,
  parseDurationRange,
  parsePhotoCountRange,
  payPresetSummary,
  presetCollected,
} from '@/lib/domain/customTaskInput';

describe('custom task input helpers', () => {
  it('parses optional video duration ranges', () => {
    expect(parseDurationRange('')).toEqual({ ok: true, min: null, max: null });
    expect(parseDurationRange('5 мин')).toEqual({ ok: true, min: 5, max: 5 });
    expect(parseDurationRange('7–8')).toEqual({ ok: true, min: 7, max: 8 });
    expect(parseDurationRange('8-7')).toEqual({ ok: false, error: 'Минимум больше максимума' });
  });

  it('parses required photo count ranges', () => {
    expect(parsePhotoCountRange('5 фото')).toEqual({ ok: true, min: 5, max: 5 });
    expect(parsePhotoCountRange('5-10 шт')).toEqual({ ok: true, min: 5, max: 10 });
    expect(parsePhotoCountRange('')).toEqual({ ok: false, error: 'Укажите фото: 5 или 5-10' });
    expect(parsePhotoCountRange('0')).toEqual({ ok: false, error: 'Укажите фото: 5 или 5-10' });
  });

  it('composes the custom description sections in form order', () => {
    expect(composeCustomDescription('video', '', ' ', '')).toBeNull();
    expect(composeCustomDescription('photo', 'brief', 'dress', 'notes')).toBe(
      '📸 Описание задания:\nbrief\n\n👗 Одежда:\ndress\n\n📝 Заметки:\nnotes',
    );
  });

  it('derives collected amounts and payment summaries from presets', () => {
    expect(presetCollected('full', 101, null)).toBe(101);
    expect(presetCollected('half', 101, null)).toBe(50);
    expect(presetCollected('partial75', 101, null)).toBe(75);
    expect(presetCollected('custom', 101, -10)).toBe(0);

    expect(payPresetSummary('full', 100, 100)).toEqual({
      text: 'Полная предоплата $100',
      warn: false,
    });
    expect(payPresetSummary('half', 100, 50)).toEqual({
      text: 'Получено $50 из $100',
      warn: true,
    });
  });
});
