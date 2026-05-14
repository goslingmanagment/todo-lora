import { describe, expect, it } from 'vitest';
import {
  customNeedsAttention,
  isTaskActive,
  isTaskRecentlyCompleted,
} from '@/lib/domain/taskVisibility';

describe('task visibility', () => {
  it('keeps custom tasks active until delivered, confirmed, and paid', () => {
    expect(isTaskActive({ type: 'custom', status: 'done' })).toBe(true);
    expect(
      isTaskActive({
        type: 'custom',
        status: 'delivered',
        amountCents: 10000,
        amountCollectedCents: 5000,
        agreementState: 'confirmed',
      }),
    ).toBe(true);
    expect(
      isTaskActive({
        type: 'custom',
        status: 'delivered',
        amountCents: 10000,
        amountCollectedCents: 10000,
        agreementState: 'pending',
      }),
    ).toBe(true);
    expect(
      isTaskActive({
        type: 'custom',
        status: 'delivered',
        amountCents: 10000,
        amountCollectedCents: 10000,
        agreementState: 'confirmed',
      }),
    ).toBe(false);
  });

  it('treats content done as completed and cancelled as inactive', () => {
    expect(isTaskActive({ type: 'content_task', status: 'in_progress' })).toBe(true);
    expect(isTaskActive({ type: 'content_task', status: 'done' })).toBe(false);
    expect(isTaskActive({ type: 'custom', status: 'cancelled' })).toBe(false);
  });

  it('uses the same settled-custom rule for recently completed tasks', () => {
    expect(customNeedsAttention({ status: 'delivered', agreementState: 'confirmed' })).toBe(false);
    expect(
      isTaskRecentlyCompleted({
        type: 'custom',
        status: 'delivered',
        amountCents: 10000,
        amountCollectedCents: 10000,
        agreementState: 'confirmed',
      }),
    ).toBe(true);
    expect(
      isTaskRecentlyCompleted({
        type: 'custom',
        status: 'delivered',
        amountCents: 10000,
        amountCollectedCents: 5000,
        agreementState: 'confirmed',
      }),
    ).toBe(false);
    expect(isTaskRecentlyCompleted({ type: 'content_task', status: 'done' })).toBe(true);
  });
});
