import { TopicSection } from '@/components/TopicSection';
import type { FeedResult } from '@/lib/server/feed';
import type { FilterValue } from '@/lib/validation/schemas';

// Sections with this many or more active cards get the wide treatment: they
// span both columns of the outer masonry and run their own 2-col internal
// card grid. Picked empirically — at 5+ cards a stacked half-width section
// dwarfs the opposite column; at 4 the balance is still natural.
const WIDE_THRESHOLD = 5;

export function GridFeed({
  feed,
  filter,
  emptyByFilter,
  highlightTaskId,
}: {
  feed: FeedResult;
  filter: FilterValue;
  emptyByFilter: Record<FilterValue, string>;
  highlightTaskId?: string | null;
}) {
  return (
    <div className="topic-section-columns">
      {feed.sections.map((section) => {
        const showSection =
          section.active.length > 0 ||
          (filter === 'all' && section.recentlyCompleted.length > 0);
        if (!showSection) return null;
        const wide = section.active.length >= WIDE_THRESHOLD;
        return (
          <TopicSection
            key={section.topic.id}
            section={section}
            todayIso={feed.todayIso}
            filter={filter}
            emptyLabel={emptyByFilter[filter]}
            highlightTaskId={highlightTaskId}
            cardColumns={wide ? 2 : 1}
            wide={wide}
          />
        );
      })}
    </div>
  );
}
