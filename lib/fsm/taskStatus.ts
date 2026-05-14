/**
 * Server-side status FSM (§6).
 *
 * One lifecycle for all task types. `delivered` is custom-only.
 * Transitions allowed:
 *   - forward one step
 *   - rollback one step
 *   - cancel from any non-terminal
 *   - reopen `cancelled → draft`
 */
import type { AgreementState, TaskStatus, TaskType } from '@/drizzle/schema/enums';
import { isTaskActive } from '@/lib/domain/taskVisibility';

export type TransitionRule = {
  from: TaskStatus;
  to: TaskStatus;
  /** if set, only these task types may take this edge */
  onlyTypes?: TaskType[];
  kind: 'forward' | 'rollback' | 'cancel' | 'reopen';
};

export const STATUS_RULES: TransitionRule[] = [
  // forward
  { from: 'draft', to: 'in_progress', kind: 'forward' },
  { from: 'in_progress', to: 'done', kind: 'forward' },
  { from: 'done', to: 'delivered', kind: 'forward', onlyTypes: ['custom'] },

  // rollback (one step)
  { from: 'in_progress', to: 'draft', kind: 'rollback' },
  { from: 'done', to: 'in_progress', kind: 'rollback' },
  { from: 'delivered', to: 'done', kind: 'rollback', onlyTypes: ['custom'] },

  // cancel — from any non-terminal status
  { from: 'draft', to: 'cancelled', kind: 'cancel' },
  { from: 'in_progress', to: 'cancelled', kind: 'cancel' },
  { from: 'done', to: 'cancelled', kind: 'cancel' },

  // reopen
  { from: 'cancelled', to: 'draft', kind: 'reopen' },
];

export type TransitionOutcome =
  | { ok: true; rule: TransitionRule }
  | { ok: false; code: 'noop' | 'no_such_rule' | 'wrong_type' };

export function planTransition(
  type: TaskType,
  from: TaskStatus,
  to: TaskStatus,
): TransitionOutcome {
  if (from === to) return { ok: false, code: 'noop' };

  const rule = STATUS_RULES.find((r) => r.from === from && r.to === to);
  if (!rule) return { ok: false, code: 'no_such_rule' };

  if (rule.onlyTypes && !rule.onlyTypes.includes(type)) {
    return { ok: false, code: 'wrong_type' };
  }
  // Belt-and-suspenders: `delivered` is custom-only at the DB level too.
  if (to === 'delivered' && type !== 'custom') {
    return { ok: false, code: 'wrong_type' };
  }
  return { ok: true, rule };
}

export function allowedTargets(type: TaskType, from: TaskStatus): TaskStatus[] {
  return STATUS_RULES.filter((r) => r.from === from)
    .filter((r) => !r.onlyTypes || r.onlyTypes.includes(type))
    .filter((r) => r.to !== 'delivered' || type === 'custom')
    .map((r) => r.to);
}

export function isTerminal(status: TaskStatus): boolean {
  return status === 'cancelled';
}

export function isActive(
  type: TaskType,
  status: TaskStatus,
  customState: {
    amountCents?: number | null;
    amountCollectedCents?: number | null;
    agreementState?: AgreementState | null;
  } = {},
): boolean {
  return isTaskActive({ type, status, ...customState });
}

export const STATUS_LABELS_RU: Record<TaskStatus, string> = {
  draft: 'Черновик',
  in_progress: 'В работе',
  done: 'Готово',
  delivered: 'Доставлено',
  cancelled: 'Отменено',
};

export const PRIORITY_LABELS_RU = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
} as const;

export const TYPE_LABELS_RU = {
  custom: 'Custom',
  content_task: 'Контент',
} as const;

export const AGREEMENT_LABELS_RU = {
  pending: 'ожидает подтверждения',
  confirmed: 'подтверждено',
  rejected: 'отклонено',
} as const;

export const PAYMENT_LABELS_RU = {
  full: 'Full',
  unlock: 'Unlock',
} as const;
