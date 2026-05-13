import { describe, expect, it } from 'vitest';
import {
  changeStatusSchema,
  createTaskSchema,
  finalizeImageSchema,
  loginCodeSchema,
  updateTaskSchema,
  urlAttachmentSchema,
  imageUploadIntentSchema,
} from '@/lib/validation/schemas';

import { randomUUID } from 'node:crypto';
const validUuid = randomUUID();

describe('createTaskSchema', () => {
  it('accepts valid Custom payload', () => {
    const r = createTaskSchema.safeParse({
      type: 'custom',
      topicId: validUuid,
      title: 'Custom для @x',
      description: null,
      priority: 'medium',
      deadlineOn: '2026-05-15',
      buyerHandle: '@x',
      buyerDisplayName: null,
      platform: 'Fansly',
      contentKind: 'video',
      paymentModel: 'full',
      amountDollars: 200,
      amountCollectedDollars: 0,
      durationMinMinutes: 5,
      durationMaxMinutes: 5,
      agreementState: 'pending',
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid Custom photo payload', () => {
    const r = createTaskSchema.safeParse({
      type: 'custom',
      topicId: validUuid,
      title: 'Custom для @x, 5-10 фото',
      description: null,
      priority: 'medium',
      deadlineOn: '2026-05-15',
      buyerHandle: '@x',
      buyerDisplayName: null,
      platform: 'Fansly',
      contentKind: 'photo',
      paymentModel: 'full',
      amountDollars: 200,
      amountCollectedDollars: 200,
      photoCountMin: 5,
      photoCountMax: 10,
      agreementState: 'pending',
    });
    expect(r.success).toBe(true);
  });

  it('rejects photo custom without photo count', () => {
    const r = createTaskSchema.safeParse({
      type: 'custom',
      topicId: validUuid,
      title: 'X',
      priority: 'low',
      deadlineOn: '2026-05-15',
      buyerHandle: '@x',
      platform: 'Fansly',
      contentKind: 'photo',
      paymentModel: 'full',
      amountDollars: 100,
    });
    expect(r.success).toBe(false);
  });

  it('rejects custom with collected > total', () => {
    const r = createTaskSchema.safeParse({
      type: 'custom',
      topicId: validUuid,
      title: 'X',
      priority: 'low',
      deadlineOn: '2026-05-15',
      buyerHandle: '@x',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 100,
      amountCollectedDollars: 200,
    });
    expect(r.success).toBe(false);
  });

  it('rejects custom with non-positive amount', () => {
    const r = createTaskSchema.safeParse({
      type: 'custom',
      topicId: validUuid,
      title: 'X',
      priority: 'low',
      deadlineOn: '2026-05-15',
      buyerHandle: '@x',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 0,
    });
    expect(r.success).toBe(false);
  });

  it('rejects content task without requesterId', () => {
    const r = createTaskSchema.safeParse({
      type: 'content_task',
      topicId: validUuid,
      title: 'X',
      priority: 'medium',
      deadlineOn: '2026-05-15',
    });
    expect(r.success).toBe(false);
  });

  it('rejects bad ISO deadline', () => {
    const r = createTaskSchema.safeParse({
      type: 'content_task',
      topicId: validUuid,
      title: 'X',
      priority: 'medium',
      requesterId: 'user-1',
      deadlineOn: 'tomorrow',
    });
    expect(r.success).toBe(false);
  });
});

describe('urlAttachmentSchema', () => {
  it('accepts http and https', () => {
    expect(
      urlAttachmentSchema.safeParse({ taskId: validUuid, url: 'http://x.example/' }).success,
    ).toBe(true);
    expect(
      urlAttachmentSchema.safeParse({ taskId: validUuid, url: 'https://x.example/path' }).success,
    ).toBe(true);
  });

  it('rejects javascript: and data: URLs', () => {
    expect(
      urlAttachmentSchema.safeParse({ taskId: validUuid, url: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(
      urlAttachmentSchema.safeParse({ taskId: validUuid, url: 'data:text/html,<x>' }).success,
    ).toBe(false);
    expect(urlAttachmentSchema.safeParse({ taskId: validUuid, url: 'ftp://x' }).success).toBe(
      false,
    );
  });
});

describe('updateTaskSchema', () => {
  const expectedVersion = 0;

  it('requires expectedVersion for the OCC gate', () => {
    const r = updateTaskSchema.safeParse({
      id: validUuid,
      title: 'no occ',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'expectedVersion')).toBe(true);
    }
  });

  it('rejects collected > amount', () => {
    const r = updateTaskSchema.safeParse({
      id: validUuid,
      expectedVersion,
      amountDollars: 100,
      amountCollectedDollars: 200,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'amountCollectedDollars')).toBe(true);
    }
  });

  it('rejects negative collected amount', () => {
    const r = updateTaskSchema.safeParse({
      id: validUuid,
      expectedVersion,
      amountCollectedDollars: -1,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'amountCollectedDollars')).toBe(true);
    }
  });

  it('rejects inverted duration range', () => {
    const r = updateTaskSchema.safeParse({
      id: validUuid,
      expectedVersion,
      durationMinMinutes: 20,
      durationMaxMinutes: 10,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'durationMaxMinutes')).toBe(true);
    }
  });
});

describe('imageUploadIntentSchema', () => {
  it('rejects size > 20MB', () => {
    const r = imageUploadIntentSchema.safeParse({
      taskId: validUuid,
      filename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 21 * 1024 * 1024,
    });
    expect(r.success).toBe(false);
  });

  it('rejects unsupported MIME', () => {
    const r = imageUploadIntentSchema.safeParse({
      taskId: validUuid,
      filename: 'a.gif',
      mimeType: 'image/gif',
      sizeBytes: 1000,
    });
    expect(r.success).toBe(false);
  });
});

describe('finalizeImageSchema', () => {
  it('accepts generated staging keys for the same task', () => {
    const objectId = randomUUID();
    const r = finalizeImageSchema.safeParse({
      taskId: validUuid,
      stagingKey: `staging/${validUuid}/${objectId}.jpg`,
      filename: 'a.jpg',
      caption: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejects canonical, wrong-task, and path-shaped staging keys', () => {
    const otherTaskId = randomUUID();
    const objectId = randomUUID();
    const base = { taskId: validUuid, filename: 'a.jpg', caption: null };

    expect(
      finalizeImageSchema.safeParse({
        ...base,
        stagingKey: `attachments/${validUuid}/${objectId}.bin`,
      }).success,
    ).toBe(false);
    expect(
      finalizeImageSchema.safeParse({
        ...base,
        stagingKey: `staging/${otherTaskId}/${objectId}.jpg`,
      }).success,
    ).toBe(false);
    expect(
      finalizeImageSchema.safeParse({
        ...base,
        stagingKey: `staging/${validUuid}/../${objectId}.jpg`,
      }).success,
    ).toBe(false);
  });
});

describe('loginCodeSchema', () => {
  it('rejects empty / overly-long codes', () => {
    expect(loginCodeSchema.safeParse({ code: '' }).success).toBe(false);
    expect(loginCodeSchema.safeParse({ code: 'a' }).success).toBe(false);
    expect(loginCodeSchema.safeParse({ code: 'x'.repeat(100) }).success).toBe(false);
  });

  it('trims input', () => {
    const r = loginCodeSchema.safeParse({ code: '  ABCD12  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe('ABCD12');
  });
});

describe('changeStatusSchema', () => {
  it('requires expectedVersion', () => {
    const r = changeStatusSchema.safeParse({ id: validUuid, newStatus: 'in_progress' });
    expect(r.success).toBe(false);
  });
});
