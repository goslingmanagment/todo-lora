export type IntegerInputResult = { ok: true; value: number | null } | { ok: false; error: string };

export const INTEGER_INPUT_ERROR = 'Должно быть целым числом';
export const INTEGER_RANGE_ERROR = 'Слишком большое число';

const INTEGER_RE = /^-?\d+$/;

export function parseDollarInput(value: unknown): IntegerInputResult {
  return parseIntegerInput(value, { allowDollarPrefix: true });
}

export function parseMinuteInput(value: unknown): IntegerInputResult {
  return parseIntegerInput(value, { allowDollarPrefix: false });
}

export function parseCountInput(value: unknown): IntegerInputResult {
  return parseIntegerInput(value, { allowDollarPrefix: false });
}

export function dollarsToCents(value: number | null | undefined): number | null {
  return value == null ? null : value * 100;
}

export function minutesToSeconds(value: number | null | undefined): number | null {
  return value == null ? null : value * 60;
}

function parseIntegerInput(
  value: unknown,
  options: { allowDollarPrefix: boolean },
): IntegerInputResult {
  if (value == null) return { ok: true, value: null };

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return { ok: false, error: INTEGER_INPUT_ERROR };
    }
    if (!Number.isSafeInteger(value)) return { ok: false, error: INTEGER_RANGE_ERROR };
    return { ok: true, value };
  }

  if (typeof value !== 'string') return { ok: false, error: INTEGER_INPUT_ERROR };
  let normalized = value.trim();
  if (normalized.length === 0) return { ok: true, value: null };
  if (options.allowDollarPrefix) {
    const prefixed = normalized.match(/^\$\s*(-?\d+)$/);
    const suffixed = normalized.match(/^(-?\d+)\s*\$$/);
    if (prefixed) {
      normalized = prefixed[1]!;
    } else if (suffixed) {
      normalized = suffixed[1]!;
    }
  }
  if (!INTEGER_RE.test(normalized)) return { ok: false, error: INTEGER_INPUT_ERROR };

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) return { ok: false, error: INTEGER_RANGE_ERROR };
  return { ok: true, value: parsed };
}
