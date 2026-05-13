import { describe, expect, it } from 'vitest';
import {
  dollarsToCents,
  minutesToSeconds,
  parseCountInput,
  parseDollarInput,
  parseMinuteInput,
} from '@/lib/domain/inputs';
import { createTaskSchema, updateTaskSchema } from '@/lib/validation/schemas';

const topicId = '00000000-0000-0000-0000-000000000001';

describe('integer input normalization', () => {
  it('accepts ordinary integer dollar and minute inputs', () => {
    expect(parseDollarInput(' 250 ')).toEqual({ ok: true, value: 250 });
    expect(parseDollarInput('$250')).toEqual({ ok: true, value: 250 });
    expect(parseDollarInput('250$')).toEqual({ ok: true, value: 250 });
    expect(parseMinuteInput('15')).toEqual({ ok: true, value: 15 });
    expect(parseCountInput('10')).toEqual({ ok: true, value: 10 });
    expect(dollarsToCents(250)).toBe(25000);
    expect(minutesToSeconds(15)).toBe(900);
  });

  it('rejects scientific notation and decimals for integer fields', () => {
    for (const value of ['1e2', '1E2', '10.5', '10,5', '$10.5', '10.5$']) {
      expect(parseDollarInput(value).ok).toBe(false);
      expect(parseMinuteInput(value).ok).toBe(false);
      expect(parseCountInput(value).ok).toBe(false);
    }
  });

  it('uses the same normalization in create and update schemas', () => {
    const create = createTaskSchema.safeParse({
      type: 'custom',
      topicId,
      title: 'Custom',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      buyerHandle: '@x',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: '1e2',
    });
    expect(create.success).toBe(false);

    const update = updateTaskSchema.safeParse({
      id: topicId,
      expectedVersion: 0,
      durationMinMinutes: '1.5',
    });
    expect(update.success).toBe(false);
  });
});
