import { TaskCard } from '@/components/TaskCard';
import type { FeedResult } from '@/lib/server/feed';

export function KanbanFeed({
  feed,
  highlightTaskId,
}: {
  feed: FeedResult;
  highlightTaskId?: string | null;
}) {
  // Hide topic columns that have no active tasks under the current filter —
  // an empty column on a wide kanban screen is more visual noise than signal.
  const visible = feed.sections.filter((s) => s.active.length > 0);

  if (visible.length === 0) {
    return (
      <p className="muted" style={{ marginTop: '1.5rem' }}>
        Под фильтр ничего не попало.
      </p>
    );
  }

  return (
    <div className="kanban-grid">
      {visible.map((section) => (
        <div className="k-column" key={section.topic.id}>
          <header>
            <span className="topic-h">{section.topic.name}</span>
            <span className="count">{section.active.length}</span>
          </header>
          {section.active.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              todayIso={feed.todayIso}
              highlight={t.id === highlightTaskId}
              variant="compact"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
