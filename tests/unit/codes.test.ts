import { describe, expect, it } from 'vitest';
import {
  constantTimeEquals,
  generateLoginCode,
  hashLoginCode,
  verifyLoginCode,
} from '@/lib/auth/codes';

describe('login codes', () => {
  it('generated codes are url-safe and unique', () => {
    const a = generateLoginCode(10);
    const b = generateLoginCode(10);
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(a).not.toBe(b);
  });

  it('hashes verify correctly', async () => {
    const code = generateLoginCode();
    const h = await hashLoginCode(code);
    expect(h.length).toBeGreaterThan(40);
    expect(await verifyLoginCode(code, h)).toBe(true);
    expect(await verifyLoginCode('NOT-IT', h)).toBe(false);
  });

  it('constant-time string comparison rejects mismatched lengths', () => {
    expect(constantTimeEquals('abcd', 'abcd')).toBe(true);
    expect(constantTimeEquals('abcd', 'abce')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
  });
});
