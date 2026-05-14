import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_IMAGE_MIMES,
  ATTACHMENT_LIMIT,
  IMAGE_MIME_TYPES,
  IMAGE_MIME_VALUES,
} from '@/lib/domain/attachmentPolicy';
import { imageUploadIntentSchema } from '@/lib/validation/schemas';

describe('attachment policy', () => {
  it('keeps the upload accept string and MIME set derived from the same values', () => {
    expect(ATTACHMENT_LIMIT).toBe(10);
    expect(ACCEPTED_IMAGE_MIMES).toBe(IMAGE_MIME_VALUES.join(','));
    for (const mime of IMAGE_MIME_VALUES) {
      expect(IMAGE_MIME_TYPES.has(mime)).toBe(true);
    }
  });

  it('allows every policy MIME in the upload intent schema', () => {
    for (const mimeType of IMAGE_MIME_VALUES) {
      expect(
        imageUploadIntentSchema.safeParse({
          taskId: '00000000-0000-4000-8000-000000000001',
          filename: 'image.bin',
          mimeType,
          sizeBytes: 1000,
        }).success,
      ).toBe(true);
    }
  });
});
