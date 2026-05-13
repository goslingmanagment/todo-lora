import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  deadlineState,
  diffDaysIso,
  formatDateRu,
  formatRelativeTimeRu,
  isOverdueActive,
  russianPluralDays,
  russianPluralOf,
  toMskDateString,
} from '@/lib/format/dates';

describe('russianPluralDays', () => {
  it('handles 1, 2-4, 5+ correctly', () => {
    expect(russianPluralDays(1)).toBe('день');
    expect(russianPluralDays(21)).toBe('день');
    expect(russianPluralDays(2)).toBe('дня');
    expect(russianPluralDays(3)).toBe('дня');
    expect(russianPluralDays(4)).toBe('дня');
    expect(russianPluralDays(5)).toBe('дней');
    expect(russianPluralDays(11)).toBe('дней');
    expect(russianPluralDays(12)).toBe('дней');
    expect(russianPluralDays(14)).toBe('дней');
    expect(russianPluralDays(22)).toBe('дня');
  });
});

describe('addDaysIso / diffDaysIso', () => {
  it('adds and subtracts calendar days correctly across months', () => {
    expect(addDaysIso('2026-01-30', 5)).toBe('2026-02-04');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDaysIso('2026-02-04', '2026-01-30')).toBe(5);
  });

  it('handles year boundaries', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('deadlineState', () => {
  it('flags overdue with Russian plural', () => {
    const r = deadlineState('2026-05-04', '2026-05-07');
    expect(r.kind).toBe('overdue');
    if (r.kind === 'overdue') {
      expect(r.daysOverdue).toBe(3);
      expect(r.label).toBe('просрочено 3 дня');
    }
  });

  it('flags imminent within today..today+3', () => {
    const today = deadlineState('2026-05-07', '2026-05-07');
    const tomorrow = deadlineState('2026-05-08', '2026-05-07');
    const inThree = deadlineState('2026-05-10', '2026-05-07');
    if (today.kind === 'none' || tomorrow.kind === 'none' || inThree.kind === 'none') {
      throw new Error('expected imminent state');
    }
    expect(today.label).toBe('сегодня');
    expect(tomorrow.label).toBe('завтра');
    expect(inThree.label).toBe('через 3 дня');
  });

  it('flags comfortable when > 3 days away', () => {
    const r = deadlineState('2026-05-15', '2026-05-07');
    expect(r.kind).toBe('comfortable');
    if (r.kind === 'comfortable') expect(r.label).toBe('через 8 дней');
  });

  it('returns "none" when no deadline', () => {
    expect(deadlineState(null).kind).toBe('none');
  });
});

describe('formatDateRu', () => {
  it('renders ISO calendar dates as Russian absolute dates', () => {
    expect(formatDateRu('2026-05-07')).toBe('07.05.2026');
    expect(formatDateRu(null)).toBeNull();
  });
});

describe('isOverdueActive', () => {
  it('only returns true when deadline is strictly before today', () => {
    expect(isOverdueActive('2026-05-06', '2026-05-07')).toBe(true);
    expect(isOverdueActive('2026-05-07', '2026-05-07')).toBe(false);
    expect(isOverdueActive('2026-05-08', '2026-05-07')).toBe(false);
    expect(isOverdueActive(null, '2026-05-07')).toBe(false);
  });
});

describe('toMskDateString', () => {
  it('returns ISO YYYY-MM-DD in MSK regardless of process tz', () => {
    // 23:30 UTC on 2026-05-06 = 02:30 MSK on 2026-05-07
    const date = new Date(Date.UTC(2026, 4, 6, 23, 30));
    expect(toMskDateString(date)).toBe('2026-05-07');
  });
});

describe('russianPluralOf', () => {
  it('picks the right form for minutes', () => {
    expect(russianPluralOf(1, 'минуту', 'минуты', 'минут')).toBe('минуту');
    expect(russianPluralOf(2, 'минуту', 'минуты', 'минут')).toBe('минуты');
    expect(russianPluralOf(5, 'минуту', 'минуты', 'минут')).toBe('минут');
    expect(russianPluralOf(11, 'минуту', 'минуты', 'минут')).toBe('минут');
    expect(russianPluralOf(21, 'минуту', 'минуты', 'минут')).toBe('минуту');
  });
});

describe('formatRelativeTimeRu', () => {
  const now = new Date('2026-05-11T12:00:00Z');

  it('returns "только что" within 30 seconds', () => {
    expect(formatRelativeTimeRu(new Date(now.getTime() - 0), now)).toBe('только что');
    expect(formatRelativeTimeRu(new Date(now.getTime() - 29_000), now)).toBe('только что');
  });

  it('renders minutes with Russian plural at 1, 4, 5, and 21', () => {
    expect(formatRelativeTimeRu(new Date(now.getTime() - 60_000), now)).toBe('1 минуту назад');
    expect(formatRelativeTimeRu(new Date(now.getTime() - 4 * 60_000), now)).toBe('4 минуты назад');
    expect(formatRelativeTimeRu(new Date(now.getTime() - 5 * 60_000), now)).toBe('5 минут назад');
    expect(formatRelativeTimeRu(new Date(now.getTime() - 21 * 60_000), now)).toBe('21 минуту назад');
  });

  it('renders hours when at least one hour ago', () => {
    expect(formatRelativeTimeRu(new Date(now.getTime() - 3_600_000), now)).toBe('1 час назад');
    expect(formatRelativeTimeRu(new Date(now.getTime() - 3 * 3_600_000), now)).toBe('3 часа назад');
    expect(formatRelativeTimeRu(new Date(now.getTime() - 11 * 3_600_000), now)).toBe('11 часов назад');
  });

  it('renders days when at least one day ago and < 7d', () => {
    expect(formatRelativeTimeRu(new Date(now.getTime() - 86_400_000), now)).toBe('1 день назад');
    expect(formatRelativeTimeRu(new Date(now.getTime() - 3 * 86_400_000), now)).toBe('3 дня назад');
  });

  it('falls back to absolute DD.MM.YYYY for 7+ days ago', () => {
    const eightDaysAgo = new Date(now.getTime() - 8 * 86_400_000);
    expect(formatRelativeTimeRu(eightDaysAgo, now)).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it('clamps small future skew to "только что"', () => {
    expect(formatRelativeTimeRu(new Date(now.getTime() + 5_000), now)).toBe('только что');
  });
});
