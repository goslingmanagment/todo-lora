import type { Task } from '@/drizzle/schema';
import { CollapsibleDetails } from './CollapsibleDetails';
import { TaskCard } from './TaskCard';

type Topic = { id: string; name: string; slug: string };

type Section = {
  topic: Topic;
  active: Task[];
  recentlyCompleted: Task[];
};

export function TopicSection({
  section,
  todayIso,
  filter,
  emptyLabel,
  highlightTaskId,
  cardColumns = 1,
  wide = false,
}: {
  section: Section;
  todayIso: string;
  filter: 'all' | 'overdue' | 'today' | 'week';
  emptyLabel: string;
  highlightTaskId?: string | null;
  cardColumns?: 1 | 2;
  wide?: boolean;
}) {
  const { topic, active, recentlyCompleted } = section;
  const showRecent = filter === 'all' && recentlyCompleted.length > 0;
  const isEmpty = active.length === 0;
  const showHeader = active.length > 0;
  // Active cards render in a flat 1-col list by default; GridFeed opts in to a
  // 2-col grid via cardColumns=2. A section with a single card always lays
  // out full-width — a lone card next to an empty second column reads as a
  // hole in the grid. The recently-completed details block also stays full-
  // width below.
  const useGrid = cardColumns === 2 && active.length > 1;
  const activeContainerProps = useGrid
    ? { className: 'feed-grid-2' as const, style: undefined }
    : { className: undefined, style: { display: 'grid', gap: '0.7rem' } };

  return (
    <CollapsibleDetails
      storageKey={`topic-collapsed:${topic.slug}`}
      className={`panel-soft topic-section${wide ? ' topic-section-wide' : ''}`}
      style={{ marginTop: '1.1rem' }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '0.6rem',
          padding: '0.15rem 0.1rem 0.4rem',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.55rem' }}>
          <span className="topic-chevron" aria-hidden="true" />
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.15rem',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--color-ink)',
            }}
          >
            {topic.name}
          </span>
        </span>
        <span className="muted-2 tabular" style={{ fontSize: '0.8rem' }}>
          {showHeader ? active.length : '—'}
        </span>
      </summary>

      <div style={{ marginTop: '0.6rem' }}>
        {isEmpty ? (
          <p className="muted-2" style={{ fontSize: '0.85rem', padding: '0.25rem 0.1rem' }}>
            {emptyLabel}
          </p>
        ) : (
          <div className={activeContainerProps.className} style={activeContainerProps.style}>
            {active.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                todayIso={todayIso}
                highlight={t.id === highlightTaskId}
              />
            ))}
          </div>
        )}

        {showRecent ? (
          <details
            style={{
              marginTop: '0.7rem',
              borderTop: '1px solid color-mix(in srgb, var(--color-line) 70%, transparent)',
              paddingTop: '0.5rem',
            }}
          >
            <summary
              className="eyebrow"
              style={{ cursor: 'pointer', listStyle: 'none', padding: '0.15rem 0.1rem' }}
            >
              Недавно завершено · {recentlyCompleted.length}
            </summary>
            <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.5rem', opacity: 0.85 }}>
              {recentlyCompleted.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  todayIso={todayIso}
                  highlight={t.id === highlightTaskId}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </CollapsibleDetails>
  );
}
