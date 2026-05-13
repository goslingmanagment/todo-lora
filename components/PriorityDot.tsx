import type { TaskPriority } from '@/drizzle/schema/enums';

const LABEL: Record<TaskPriority, string> = {
  high: 'Высокий приоритет',
  medium: 'Средний приоритет',
  low: 'Низкий приоритет',
};

const CLASSNAME: Record<TaskPriority, string> = {
  high: 'priority-dot priority-dot-high',
  medium: 'priority-dot priority-dot-medium',
  low: 'priority-dot priority-dot-low',
};

export function PriorityDot({ priority }: { priority: TaskPriority | null | undefined }) {
  if (!priority) return null;
  return (
    <span
      role="img"
      aria-label={LABEL[priority]}
      title={LABEL[priority]}
      className={CLASSNAME[priority]}
    />
  );
}
