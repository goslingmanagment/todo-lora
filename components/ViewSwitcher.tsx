import Link from 'next/link';
import type { FilterValue, ViewValue } from '@/lib/validation/schemas';

const VIEWS: Array<{ key: ViewValue; label: string }> = [
  { key: 'grid', label: '2 колонки' },
  { key: 'kanban', label: 'Канбан' },
  { key: 'sidebar', label: 'Сайдбар' },
  { key: 'cockpit', label: 'Командный центр' },
  { key: 'calendar', label: 'Календарь' },
];

export function ViewSwitcher({
  active,
  filter,
  urgent,
  search,
  topic,
}: {
  active: ViewValue;
  filter: FilterValue;
  urgent: boolean;
  search?: string;
  topic?: string;
}) {
  const buildHref = (next: ViewValue) => {
    const params = new URLSearchParams();
    if (next !== 'grid') params.set('view', next);
    if (filter !== 'all') params.set('filter', filter);
    if (urgent) params.set('urgent', '1');
    if (search) params.set('q', search);
    if (next === 'sidebar' && topic) params.set('topic', topic);
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  };

  return (
    <nav aria-label="Вид ленты" className="segmented" style={{ overflowX: 'auto' }}>
      {VIEWS.map((v) => {
        const isActive = v.key === active;
        return (
          <Link
            key={v.key}
            href={buildHref(v.key)}
            aria-current={isActive ? 'page' : undefined}
            prefetch={false}
            className="segmented-item"
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
