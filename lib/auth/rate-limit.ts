/**
 * In-memory token bucket rate limiter for the login route (§8.1).
 *
 * Single Next.js dev process = single bucket → adequate for MVP.
 * Resets on server restart. Lockout window doubles on repeated violations.
 */

type Bucket = {
  attempts: number[];
  blockedUntil: number;
  failuresInWindow: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitConfig = {
  /** attempts allowed within the rolling window */
  limit: number;
  /** rolling window in ms */
  windowMs: number;
  /** initial lockout duration when limit is exceeded */
  baseLockoutMs: number;
  /** maximum lockout duration */
  maxLockoutMs: number;
};

export const LOGIN_LIMIT: RateLimitConfig = {
  limit: 5,
  windowMs: 60_000,
  baseLockoutMs: 60_000,
  maxLockoutMs: 30 * 60_000,
};

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; retryAfterMs: number; reason: 'locked' };

export function checkRateLimit(key: string, _cfg: RateLimitConfig = LOGIN_LIMIT): RateLimitDecision {
  const now = Date.now();
  const b = buckets.get(key);
  if (b && b.blockedUntil > now) {
    return { ok: false, retryAfterMs: b.blockedUntil - now, reason: 'locked' };
  }
  return { ok: true };
}

export function recordSuccess(key: string): void {
  buckets.delete(key);
}

export function recordFailure(key: string, cfg: RateLimitConfig = LOGIN_LIMIT): void {
  const now = Date.now();
  const cutoff = now - cfg.windowMs;
  let b = buckets.get(key);
  if (!b) {
    b = { attempts: [], blockedUntil: 0, failuresInWindow: 0 };
    buckets.set(key, b);
  }
  b.attempts = b.attempts.filter((t) => t >= cutoff);
  b.attempts.push(now);

  if (b.attempts.length > cfg.limit) {
    b.failuresInWindow += 1;
    const factor = Math.min(2 ** Math.max(0, b.failuresInWindow - 1), 30);
    const lock = Math.min(cfg.baseLockoutMs * factor, cfg.maxLockoutMs);
    b.blockedUntil = now + lock;
  }
}

/** Test helper. Not exported by name elsewhere. */
export function __resetRateLimits(): void {
  buckets.clear();
}
