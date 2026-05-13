import { describe, expect, it } from 'vitest';
import { inferCustomTaskTitle } from '@/lib/domain/taskTitle';

describe('inferCustomTaskTitle', () => {
  it('uses buyer URL, first useful task line, and duration', () => {
    expect(
      inferCustomTaskTitle({
        buyerHandle: 'https://fansly.com/vloppers2/posts',
        briefDescription: '\nЧерные колготки, фокус на этом\nразные углы',
        durationText: '7-8 минут',
      }),
    ).toBe('Custom для @vloppers2 - Черные колготки, фокус на этом, 7-8 мин');
  });

  it('prefers display name over handle', () => {
    expect(
      inferCustomTaskTitle({
        buyerHandle: 'https://onlyfans.com/u545288581',
        buyerDisplayName: 'Marvel',
        briefDescription: 'Домашний фотосет с надписью',
        durationText: '',
      }),
    ).toBe('Custom для Marvel - Домашний фотосет с надписью');
  });

  it('falls back to clothing when the brief has only section headings', () => {
    expect(
      inferCustomTaskTitle({
        buyerHandle: '@sam',
        briefDescription: 'Фразы которые необходимо сказать:',
        clothingDescription: 'лук со скрина',
        durationText: '5',
      }),
    ).toBe('Custom для @sam - лук со скрина, 5 мин');
  });

  it('uses photo count for photo customs', () => {
    expect(
      inferCustomTaskTitle({
        buyerHandle: '@photo_buyer',
        contentKind: 'photo',
        briefDescription: 'нижний ракурс и образ со скрина',
        photoCountText: '5-10 фото',
      }),
    ).toBe('Custom для @photo_buyer - нижний ракурс и образ со скрина, 5-10 фото');
  });
});
