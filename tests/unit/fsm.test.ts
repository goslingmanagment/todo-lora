import { describe, expect, it } from 'vitest';
import {
  STATUS_RULES,
  allowedTargets,
  isActive,
  planTransition,
} from '@/lib/fsm/taskStatus';

describe('status FSM', () => {
  it('allows custom forward path: draft → in_progress → done → delivered', () => {
    expect(planTransition('custom', 'draft', 'in_progress').ok).toBe(true);
    expect(planTransition('custom', 'in_progress', 'done').ok).toBe(true);
    expect(planTransition('custom', 'done', 'delivered').ok).toBe(true);
  });

  it('rejects done → delivered for content_task', () => {
    const a = planTransition('content_task', 'done', 'delivered');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe('wrong_type');
  });

  it('allows cancel from non-terminal statuses only', () => {
    for (const from of ['draft', 'in_progress', 'done'] as const) {
      expect(planTransition('content_task', from, 'cancelled').ok).toBe(true);
    }
    expect(planTransition('custom', 'delivered', 'cancelled').ok).toBe(false);
  });

  it('allows reopen cancelled → draft', () => {
    expect(planTransition('content_task', 'cancelled', 'draft').ok).toBe(true);
  });

  it('allows one-step rollback', () => {
    expect(planTransition('custom', 'delivered', 'done').ok).toBe(true);
    expect(planTransition('custom', 'done', 'in_progress').ok).toBe(true);
    expect(planTransition('content_task', 'done', 'in_progress').ok).toBe(true);
    expect(planTransition('content_task', 'in_progress', 'draft').ok).toBe(true);
  });

  it('rejects two-step jumps', () => {
    expect(planTransition('custom', 'draft', 'done').ok).toBe(false);
    expect(planTransition('custom', 'in_progress', 'delivered').ok).toBe(false);
  });

  it('rejects no-op transitions', () => {
    const r = planTransition('content_task', 'draft', 'draft');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('noop');
  });

  it('allowedTargets excludes delivered for non-custom', () => {
    expect(allowedTargets('content_task', 'done')).not.toContain('delivered');
    expect(allowedTargets('custom', 'done')).toContain('delivered');
  });

  it('isActive matches feed visibility rules (§6.4)', () => {
    expect(isActive('custom', 'done')).toBe(true);
    expect(
      isActive('custom', 'delivered', {
        amountCents: 10000,
        amountCollectedCents: 10000,
        agreementState: 'confirmed',
      }),
    ).toBe(false);
    expect(
      isActive('custom', 'delivered', {
        amountCents: 10000,
        amountCollectedCents: 5000,
        agreementState: 'confirmed',
      }),
    ).toBe(true);
    expect(
      isActive('custom', 'delivered', {
        amountCents: 10000,
        amountCollectedCents: 10000,
        agreementState: 'pending',
      }),
    ).toBe(true);
    expect(isActive('content_task', 'done')).toBe(false);
    expect(isActive('custom', 'cancelled')).toBe(false);
    expect(isActive('content_task', 'in_progress')).toBe(true);
  });

  it('every rule terminus references the same enum domain', () => {
    const validStates = new Set([
      'draft',
      'in_progress',
      'done',
      'delivered',
      'cancelled',
    ]);
    for (const r of STATUS_RULES) {
      expect(validStates.has(r.from)).toBe(true);
      expect(validStates.has(r.to)).toBe(true);
    }
  });
});
