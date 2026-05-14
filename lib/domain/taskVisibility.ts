import type { AgreementState, TaskStatus, TaskType } from '@/drizzle/schema/enums';

export type CustomAttentionState = {
  status: TaskStatus;
  amountCents?: number | null;
  amountCollectedCents?: number | null;
  agreementState?: AgreementState | null;
};

export type TaskVisibilityState = CustomAttentionState & {
  type: TaskType;
};

export function customNeedsAttention(state: CustomAttentionState): boolean {
  if (state.status !== 'delivered') return true;
  const total = state.amountCents ?? 0;
  const collected = state.amountCollectedCents ?? 0;
  return state.agreementState !== 'confirmed' || collected < total;
}

export function isTaskActive(state: TaskVisibilityState): boolean {
  if (state.status === 'cancelled') return false;
  if (state.type === 'custom') return customNeedsAttention(state);
  return state.status !== 'done';
}

export function isTaskRecentlyCompleted(state: TaskVisibilityState): boolean {
  if (state.type === 'custom') {
    return state.status === 'delivered' && !customNeedsAttention(state);
  }
  return state.status === 'done';
}
