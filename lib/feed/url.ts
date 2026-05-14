import type { FilterValue, ViewValue } from '@/lib/validation/schemas';

export type FeedHrefState = {
  view?: ViewValue;
  filter?: FilterValue;
  urgent?: boolean;
  search?: string | null;
  topic?: string | null;
};

export function buildFeedHref({
  view = 'grid',
  filter = 'all',
  urgent = false,
  search,
  topic,
}: FeedHrefState = {}): string {
  const params = new URLSearchParams();
  if (view !== 'grid') params.set('view', view);
  if (view === 'sidebar' && topic) params.set('topic', topic);
  if (filter !== 'all') params.set('filter', filter);
  if (urgent) params.set('urgent', '1');

  const q = search?.trim() ?? '';
  if (q) params.set('q', q);

  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}
