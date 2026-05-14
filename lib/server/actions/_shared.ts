/**
 * Non-action helpers shared across the action modules. Plain module — does
 * NOT carry the `'use server'` directive, since only async functions may be
 * exported from a server-action file.
 */

export type ActionErrorCode =
  | 'agreement_pending'
  | 'not_found'
  | 'no_such_rule'
  | 'noop'
  | 'sanitize_failed'
  | 'stale'
  | 'timeout'
  | 'unauthenticated'
  | 'wrong_type';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: ActionErrorCode; fieldErrors?: Record<string, string> };

export function flattenZodErrors(err: unknown): Record<string, string> {
  if (
    err &&
    typeof err === 'object' &&
    'issues' in err &&
    Array.isArray((err as { issues?: unknown[] }).issues)
  ) {
    const out: Record<string, string> = {};
    for (const issue of (err as { issues: { path: (string | number)[]; message: string }[] }).issues) {
      const key = issue.path.join('.');
      if (!out[key]) out[key] = issue.message;
    }
    return out;
  }
  return {};
}
