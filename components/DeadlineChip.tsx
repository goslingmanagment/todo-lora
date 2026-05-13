import { deadlineState } from '@/lib/format/dates';

export function DeadlineChip({
  deadline,
  todayIso,
}: {
  deadline: string | null | undefined;
  todayIso?: string;
}) {
  const dl = deadlineState(deadline ?? null, todayIso);
  if (dl.kind === 'none') return null;
  const klass =
    dl.kind === 'overdue' ? 'chip chip-red'
    : dl.kind === 'imminent' ? 'chip chip-amber'
    : 'chip chip-green';
  return <span className={klass}>{dl.label}</span>;
}
