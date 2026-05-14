import Link from 'next/link';
import type { FilterValue, ViewValue } from '@/lib/validation/schemas';
import { buildFeedHref } from '@/lib/feed/url';

const FILTERS: Array<{ key: FilterValue; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'overdue', label: 'Просрочено' },
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'На неделе' },
];

export function FilterChips({
  active,
  urgent,
  search,
  totals,
  view = 'grid',
  topic,
}: {
  active: FilterValue;
  urgent: boolean;
  search?: string;
  totals: {
    active: number;
    overdue: number;
    todayDue: number;
    thisWeekDue: number;
    urgent: number;
  };
  view?: ViewValue;
  topic?: string;
}) {
  const badgeFor = (k: FilterValue) =>
    k === 'all' ? totals.active
    : k === 'overdue' ? totals.overdue
    : k === 'today' ? totals.todayDue
    : totals.thisWeekDue;

  // Deadline chip URLs preserve the urgent triage state (and the current view
  // / topic), so the two dimensions combine orthogonally (per P1.4.1 acceptance).
  const buildDeadlineHref = (k: FilterValue) =>
    buildFeedHref({ view, topic, filter: k, urgent, search });
  const buildUrgentHref = () =>
    buildFeedHref({ view, topic, filter: active, urgent: !urgent, search });

  // When the user is searching, the totals (active/overdue/today/week/urgent)
  // are computed over the full feed and no longer reflect what the user sees
  // on screen. Showing "Все 26" while the page is empty creates a disconnect,
  // so we suppress the per-chip counts for the duration of the search.
  const hideCounts = !!search;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem' }}>
      <nav aria-label="Фильтры по дедлайну" className="segmented">
        {FILTERS.map((f) => {
          const isActive = f.key === active;
          const badge = badgeFor(f.key);
          return (
            <Link
              key={f.key}
              href={buildDeadlineHref(f.key)}
              aria-current={isActive ? 'page' : undefined}
              prefetch={false}
              className="segmented-item"
            >
              {f.label}
              {!hideCounts && badge > 0 ? (
                <span
                  className="tabular"
                  style={{
                    marginLeft: '0.35rem',
                    fontSize: '0.75rem',
                    opacity: isActive ? 0.8 : 0.7,
                  }}
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <Link
        href={buildUrgentHref()}
        aria-current={urgent ? 'true' : undefined}
        prefetch={false}
        className={urgent ? 'chip chip-red' : 'chip chip-gray'}
        style={{
          cursor: 'pointer',
          textDecoration: 'none',
          padding: '0.25rem 0.7rem',
          fontSize: '0.8rem',
        }}
        aria-label={urgent ? 'Снять фильтр Срочные' : 'Показать только срочные'}
      >
        Срочные
        {!hideCounts && totals.urgent > 0 ? (
          <span
            className="tabular"
            style={{
              marginLeft: '0.35rem',
              fontSize: '0.75rem',
              opacity: urgent ? 0.85 : 0.7,
            }}
          >
            {totals.urgent}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
