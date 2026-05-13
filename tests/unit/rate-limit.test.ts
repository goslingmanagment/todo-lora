import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetRateLimits,
  checkRateLimit,
  recordFailure,
  recordSuccess,
} from '@/lib/auth/rate-limit';

const CFG = { limit: 3, windowMs: 60_000, baseLockoutMs: 1000, maxLockoutMs: 5000 };

afterEach(() => __resetRateLimits());

describe('rate limiter', () => {
  it('allows up to limit attempts within the window', () => {
    for (let i = 0; i < CFG.limit; i++) {
      expect(checkRateLimit('1.1.1.1', CFG).ok).toBe(true);
      recordFailure('1.1.1.1', CFG);
    }
  });

  it('locks out after the (limit+1)th failure', () => {
    for (let i = 0; i < CFG.limit + 1; i++) recordFailure('2.2.2.2', CFG);
    const r = checkRateLimit('2.2.2.2', CFG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('locked');
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('successful login resets the bucket', () => {
    for (let i = 0; i < CFG.limit + 1; i++) recordFailure('3.3.3.3', CFG);
    expect(checkRateLimit('3.3.3.3', CFG).ok).toBe(false);
    recordSuccess('3.3.3.3');
    expect(checkRateLimit('3.3.3.3', CFG).ok).toBe(true);
  });

  it('different keys are independent', () => {
    for (let i = 0; i < CFG.limit + 1; i++) recordFailure('4.4.4.4', CFG);
    expect(checkRateLimit('4.4.4.4', CFG).ok).toBe(false);
    expect(checkRateLimit('5.5.5.5', CFG).ok).toBe(true);
  });
});
