import { describe, expect, it } from 'vitest';
import { deriveRequestIp } from '@/lib/auth/session';

function headers(values: Record<string, string | null>) {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  };
}

describe('deriveRequestIp', () => {
  it('uses a valid proxy-normalized x-real-ip', () => {
    expect(deriveRequestIp(headers({ 'x-real-ip': ' 203.0.113.10 ' }))).toBe('203.0.113.10');
  });

  it('does not let x-forwarded-for choose the limiter key', () => {
    expect(
      deriveRequestIp(
        headers({
          'x-forwarded-for': '198.51.100.1, 203.0.113.10',
        }),
      ),
    ).toBe('local');
  });

  it('falls back to local when x-real-ip is invalid', () => {
    expect(
      deriveRequestIp(
        headers({
          'x-real-ip': 'not-an-ip',
          'x-forwarded-for': '198.51.100.1',
        }),
      ),
    ).toBe('local');
  });
});
