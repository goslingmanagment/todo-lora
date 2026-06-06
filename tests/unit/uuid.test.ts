import { describe, expect, it } from 'vitest';
import { isCanonicalUuid } from '@/lib/validation/uuid';

describe('isCanonicalUuid', () => {
  it('accepts canonical UUID strings', () => {
    expect(isCanonicalUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isCanonicalUuid('A0B1C2D3-E4F5-6789-abcd-0123456789ef')).toBe(true);
  });

  it('rejects dash-only and malformed UUID-shaped values', () => {
    expect(isCanonicalUuid('------------------------------------')).toBe(false);
    expect(isCanonicalUuid('00000000000000000000000000000000')).toBe(false);
    expect(isCanonicalUuid('00000000-0000-0000-0000-00000000000x')).toBe(false);
  });
});
