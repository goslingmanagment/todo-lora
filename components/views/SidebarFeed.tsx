import Link from 'next/link';
import { TaskCard } from '@/components/TaskCard';
import type { FeedResult } from '@/lib/server/feed';
import type { FilterValue } from '@/lib/validation/schemas';

export function SidebarFeed({
  feed,
  filter,
  urgent,
  search,
  topicSlug,
  highlightTaskId,
  outstandingDollars,
}: {
  feed: FeedResult;
  filter: FilterValue;
  urgent: boolean;
  search?: string;
  topicSlug?: string;
  highlightTaskId?: string | null;
  outstandingDollars: number;
}) {
  // Selection precedence:
  //   1. URL slug, if it still matches a topic.
  //   2. The topic owning ?created=<id>, so the just-created task lands in
  //      its own section instead of the default ("first non-empty topic"),
  //      where its highlight flash would never render.
  //   3. First topic with active tasks, else first topic overall.
  const requested = topicSlug
    ? feed.sections.find((s) => s.topic.slug === topicSlug)
    : null;
  const sectionForHighlight = highlightTaskId
    ? feed.sections.find(
        (s) =>
          s.active.some((t) => t.id === highlightTaskId) ||
          s.recentlyCompleted.some((t) => t.id === highlightTaskId),
      )
    : null;
  const defaultSection =
    feed.sections.find((s) => s.active.length > 0) ?? feed.sections[0];
  const activeSection = requested ?? sectionForHighlight ?? defaultSection;

  const buildHref = (slug: string) => {
    const p = new URLSearchParams();
    p.set('view', 'sidebar');
    p.set('topic', slug);
    if (filter !== 'all') p.set('filter', filter);
    if (urgent) p.set('urgent', '1');
    if (search) p.set('q', search);
    return `/?${p.toString()}`;
  };

  return (
    <div className="sidebar-grid">
      <aside className="sidebar-side" aria-label="Темы">
        <h3>Разделы</h3>
        <div className="sidebar-nav">
          {feed.sections.map((s) => {
            const isActive = activeSection?.topic.id === s.topic.id;
            const count = s.active.length;
            return (
              <Link
                key={s.topic.id}
                href={buildHref(s.topic.slug)}
                aria-current={isActive ? 'page' : undefined}
                prefetch={false}
                className="sidebar-nav-item"
              >
                <span>{s.topic.name}</span>
                {count > 0 ? (
                  <span className="badge tabular">{count}</span>
                ) : (
                  <span className="badge tabular" aria-hidden="true">
                    —
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="sidebar-main">
        {activeSection ? (
          <>
            <h2>{activeSection.topic.name}</h2>
            <div className="sidebar-sub">
              {activeSection.active.length} активных
              {activeSection.topic.slug === 'customs' && outstandingDollars > 0
                ? ` · ожидается $${outstandingDollars.toLocaleString('en-US')}`
                : ''}
            </div>

            {activeSection.active.length === 0 ? (
              <p className="muted">В этом разделе пока ничего под фильтр.</p>
            ) : (
              <div className="sidebar-feed">
                {activeSection.active.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    todayIso={feed.todayIso}
                    highlight={t.id === highlightTaskId}
                  />
                ))}
              </div>
            )}

            {filter === 'all' && activeSection.recentlyCompleted.length > 0 ? (
              <details style={{ marginTop: '1.4rem' }}>
                <summary
                  className="eyebrow"
                  style={{ cursor: 'pointer', listStyle: 'none' }}
                >
                  Недавно завершено · {activeSection.recentlyCompleted.length}
                </summary>
                <div
                  className="sidebar-feed"
                  style={{ marginTop: '0.6rem', opacity: 0.85 }}
                >
                  {activeSection.recentlyCompleted.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      todayIso={feed.todayIso}
                      highlight={t.id === highlightTaskId}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <p className="muted">Темы пока не настроены.</p>
        )}
      </div>
    </div>
  );
}
