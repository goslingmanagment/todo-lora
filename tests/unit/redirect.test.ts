import { describe, expect, it } from 'vitest';
import { sanitizeLoginNext } from '@/lib/auth/redirect';

describe('sanitizeLoginNext', () => {
  it('keeps safe app-relative paths', () => {
    expect(sanitizeLoginNext('/')).toBe('/');
    expect(sanitizeLoginNext('/task/00000000-0000-0000-0000-000000000001')).toBe(
      '/task/00000000-0000-0000-0000-000000000001',
    );
    expect(sanitizeLoginNext('/?filter=today#top')).toBe('/?filter=today#top');
  });

  it('defaults absolute, protocol-relative, and script-like values', () => {
    expect(sanitizeLoginNext('https://evil.example/x')).toBe('/');
    expect(sanitizeLoginNext('//evil.example/x')).toBe('/');
    expect(sanitizeLoginNext('javascript:alert(1)')).toBe('/');
    expect(sanitizeLoginNext('data:text/html,<x>')).toBe('/');
  });

  it('defaults encoded bypasses and malformed paths', () => {
    expect(sanitizeLoginNext('%2F%2Fevil.example')).toBe('/');
    expect(sanitizeLoginNext('/%2F%2Fevil.example')).toBe('/');
    expect(sanitizeLoginNext('/%255Cevil.example')).toBe('/');
    expect(sanitizeLoginNext('/%E0%A4%A')).toBe('/');
  });
});
