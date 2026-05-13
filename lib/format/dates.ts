/**
 * Date helpers — server-side computation in Europe/Moscow (§6.5).
 *
 * We deliberately avoid heavy time libraries. The DB stores `deadline_on` as
 * a calendar date (no time). "Today" is the current calendar day in MSK.
 */

const APP_TZ = 'Europe/Moscow';

/**
 * Returns 'YYYY-MM-DD' for the calendar date represented by `instant`
 * in the configured timezone.
 */
export function toMskDateString(instant: Date = new Date(), tz: string = APP_TZ): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(instant);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid ISO date: ${iso}`);
  // Use UTC date math to avoid DST drift.
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function diffDaysIso(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ax = Date.UTC(ay!, am! - 1, ad!);
  const bx = Date.UTC(by!, bm! - 1, bd!);
  return Math.round((ax - bx) / 86_400_000);
}

export type DeadlineState =
  | { kind: 'overdue'; daysOverdue: number; label: string }
  | { kind: 'imminent'; daysUntil: number; label: string }
  | { kind: 'comfortable'; daysUntil: number; label: string }
  | { kind: 'none' };

export function deadlineState(
  deadlineIso: string | null | undefined,
  todayIso: string = toMskDateString(),
): DeadlineState {
  if (!deadlineIso) return { kind: 'none' };

  const diff = diffDaysIso(deadlineIso, todayIso);

  if (diff < 0) {
    const daysOverdue = -diff;
    return {
      kind: 'overdue',
      daysOverdue,
      label: `просрочено ${daysOverdue} ${russianPluralDays(daysOverdue)}`,
    };
  }

  const future =
    diff === 0 ? 'сегодня'
    : diff === 1 ? 'завтра'
    : `через ${diff} ${russianPluralDays(diff)}`;

  if (diff <= 3) return { kind: 'imminent', daysUntil: diff, label: future };
  return { kind: 'comfortable', daysUntil: diff, label: future };
}

export function formatDateRu(
  iso: string | null | undefined,
  tz: string = APP_TZ,
): string | null {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Russian "день/дня/дней" plural agreement.
 */
export function russianPluralDays(n: number): string {
  return russianPluralOf(n, 'день', 'дня', 'дней');
}

/**
 * Generic Russian noun-plural picker (1, 2-4, 5+ forms with the 11-14
 * exception). Use for any countable noun: «минута / минуты / минут»,
 * «час / часа / часов», «день / дня / дней».
 */
export function russianPluralOf(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Relative time in Russian for an instant in the past, with safe fall-throughs
 * for far-future or far-past values. Output is short and operator-readable.
 *
 *   < 30s   → «только что»
 *   < 1h    → «N минут(у|ы) назад»
 *   < 24h   → «N часов назад»
 *   < 7d    → «N дней назад»
 *   else    → absolute «DD.MM.YYYY» in MSK
 *
 * `now` is injectable so tests can pin the clock.
 */
export function formatRelativeTimeRu(
  instant: Date,
  now: Date = new Date(),
  tz: string = APP_TZ,
): string {
  const diffMs = now.getTime() - instant.getTime();
  // Negative diff = instant is in the future. Clamp to 0 so we don't render
  // «-5 минут назад» if a clock skew sneaks in; treat it as «только что».
  if (diffMs < 30_000) return 'только что';

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) {
    return `${diffMin} ${russianPluralOf(diffMin, 'минуту', 'минуты', 'минут')} назад`;
  }

  const diffHrs = Math.floor(diffMs / 3_600_000);
  if (diffHrs < 24) {
    return `${diffHrs} ${russianPluralOf(diffHrs, 'час', 'часа', 'часов')} назад`;
  }

  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) {
    return `${diffDays} ${russianPluralOf(diffDays, 'день', 'дня', 'дней')} назад`;
  }

  // Fallback: absolute date in DD.MM.YYYY (MSK).
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return fmt.format(instant);
}

export function isOverdueActive(
  deadlineIso: string | null,
  todayIso: string = toMskDateString(),
): boolean {
  if (!deadlineIso) return false;
  return diffDaysIso(deadlineIso, todayIso) < 0;
}
