import { redirect } from 'next/navigation';
import { getCurrentAuth } from '@/lib/auth/session';
import { getFeed } from '@/lib/server/feed';
import { Header } from '@/components/Header';
import { FilterChips } from '@/components/FilterChips';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';
import { ViewSwitcher } from '@/components/ViewSwitcher';
import { TopicCollapseControls } from '@/components/TopicCollapseControls';
import { DemoDataControls } from '@/components/DemoDataControls';
import { GridFeed } from '@/components/views/GridFeed';
import { KanbanFeed } from '@/components/views/KanbanFeed';
import { SidebarFeed } from '@/components/views/SidebarFeed';
import { CockpitFeed } from '@/components/views/CockpitFeed';
import { CalendarFeed } from '@/components/views/CalendarFeed';
import type { FilterValue, ViewValue } from '@/lib/validation/schemas';
import { filterSchema, viewSchema } from '@/lib/validation/schemas';
import { getDemoTaskCount } from '@/lib/server/demo-data';
import { buildFeedHref } from '@/lib/feed/url';

export const dynamic = 'force-dynamic';

const EMPTY_BY_FILTER: Record<FilterValue, string> = {
  all: 'Пока ничего.',
  overdue: 'Нет просроченных задач.',
  today: 'На сегодня — пусто.',
  week: 'На неделе — пусто.',
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    created?: string;
    urgent?: string;
    q?: string;
    view?: string;
    topic?: string;
  }>;
}) {
  const auth = await getCurrentAuth();
  if (!auth) redirect('/login');

  const sp = await searchParams;
  const parsedFilter = filterSchema.safeParse(sp.filter ?? 'all');
  const filter: FilterValue = parsedFilter.success ? parsedFilter.data : 'all';
  const parsedView = viewSchema.safeParse(sp.view ?? 'grid');
  const view: ViewValue = parsedView.success ? parsedView.data : 'grid';
  const urgent = sp.urgent === '1';
  const search = typeof sp.q === 'string' ? sp.q.trim().slice(0, 100) : '';
  const topicSlug =
    typeof sp.topic === 'string' && /^[a-z0-9_-]{1,40}$/i.test(sp.topic)
      ? sp.topic.toLowerCase()
      : undefined;
  const createdId =
    typeof sp.created === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.created)
      ? sp.created
      : null;

  // Calendar already buckets every active task by deadline — the deadline
  // FilterChips become a "highlight one column" gesture, not a data narrower.
  // Override to 'all' so the calendar sees the full active set regardless of
  // the URL filter; urgent + search still narrow.
  const effectiveFilter: FilterValue = view === 'calendar' ? 'all' : filter;
  const feed = await getFeed(effectiveFilter, { urgent, search });
  const demoTaskCount = await getDemoTaskCount();
  const outstandingDollars = Math.round(feed.outstandingCustomCents / 100);

  // Drop unknown topic slugs after we've seen the topic list. Keeping a stale
  // slug in URL builders would propagate it through search/switcher links.
  const validatedTopic =
    topicSlug && feed.sections.some((s) => s.topic.slug === topicSlug) ? topicSlug : undefined;

  const totalActiveInFilter = feed.sections.reduce((acc, s) => acc + s.active.length, 0);
  const totalVisibleInFilter = feed.sections.reduce(
    (acc, s) => acc + s.active.length + (filter === 'all' ? s.recentlyCompleted.length : 0),
    0,
  );
  const isAllEmpty = filter === 'all' && totalVisibleInFilter === 0 && feed.totals.active === 0;
  const isSearchEmpty = search.length > 0 && totalVisibleInFilter === 0;

  return (
    <>
      <Header
        userName={auth.user.displayName}
        outstandingDollars={outstandingDollars}
        subtitle="Лента задач"
        showOutstanding={view !== 'cockpit'}
      />
      <RealtimeRefresh />
      <main className="app-shell" id="main">
        <h1 className="sr-only">Лента задач</h1>
        <div
          style={{
            marginTop: '0.4rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem 1rem',
          }}
        >
          <FilterChips
            active={filter}
            urgent={urgent}
            search={search}
            totals={feed.totals}
            view={view}
            topic={validatedTopic}
          />
          {view === 'grid' && feed.sections.some((s) => s.active.length > 0) ? (
            <TopicCollapseControls
              slugs={feed.sections.filter((s) => s.active.length > 0).map((s) => s.topic.slug)}
            />
          ) : null}
          <div style={{ marginLeft: 'auto' }}>
            <ViewSwitcher
              active={view}
              filter={filter}
              urgent={urgent}
              search={search}
              topic={validatedTopic}
            />
          </div>
        </div>

        <form
          action="/"
          role="search"
          style={{
            display: 'flex',
            gap: '0.55rem',
            alignItems: 'center',
            marginTop: '0.9rem',
            flexWrap: 'wrap',
          }}
        >
          {view !== 'grid' ? <input type="hidden" name="view" value={view} /> : null}
          {view === 'sidebar' && validatedTopic ? (
            <input type="hidden" name="topic" value={validatedTopic} />
          ) : null}
          {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
          {urgent ? <input type="hidden" name="urgent" value="1" /> : null}
          <input
            className="input"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Поиск по задаче, покупателю или платформе (Enter)"
            aria-label="Поиск"
            style={{ flex: '1 1 18rem', minWidth: 0 }}
          />
          <button type="submit" className="sr-only">
            Найти
          </button>
          {search ? (
            <a
              href={buildFeedHref({ view, filter, urgent, topic: validatedTopic })}
              className="back-link"
            >
              Сбросить
            </a>
          ) : null}
        </form>

        {isAllEmpty || isSearchEmpty ? (
          <div style={{ marginTop: '2rem', display: 'grid', gap: '0.6rem' }}>
            <p className="muted">
              {search
                ? `Ничего не найдено по «${search}».`
                : 'Пока ничего. Добавьте первую задачу через кнопку «Новая ТЗ».'}
            </p>
            {search ? (
              <a
                href={buildFeedHref({ view, filter, urgent, topic: validatedTopic })}
                className="btn"
                style={{ width: 'fit-content' }}
              >
                Сбросить поиск
              </a>
            ) : null}
          </div>
        ) : null}

        {!isAllEmpty &&
        !isSearchEmpty &&
        totalActiveInFilter === 0 &&
        filter !== 'all' &&
        view === 'grid' ? (
          <p className="muted" style={{ marginTop: '2rem' }}>
            {search ? `Ничего не найдено по «${search}».` : EMPTY_BY_FILTER[filter]}
          </p>
        ) : null}

        {!isAllEmpty && !isSearchEmpty ? (
          <div
            style={{ marginTop: view === 'kanban' || view === 'calendar' ? '0.4rem' : '0.7rem' }}
          >
            {view === 'grid' ? (
              <GridFeed
                feed={feed}
                filter={filter}
                emptyByFilter={EMPTY_BY_FILTER}
                highlightTaskId={createdId}
              />
            ) : view === 'kanban' ? (
              <KanbanFeed feed={feed} highlightTaskId={createdId} />
            ) : view === 'sidebar' ? (
              <SidebarFeed
                feed={feed}
                filter={filter}
                urgent={urgent}
                search={search}
                topicSlug={validatedTopic}
                highlightTaskId={createdId}
                outstandingDollars={outstandingDollars}
              />
            ) : view === 'cockpit' ? (
              <CockpitFeed
                feed={feed}
                outstandingDollars={outstandingDollars}
                highlightTaskId={createdId}
              />
            ) : (
              <CalendarFeed feed={feed} filter={filter} highlightTaskId={createdId} />
            )}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '2.5rem',
            paddingTop: '1rem',
          }}
        >
          <DemoDataControls demoTaskCount={demoTaskCount} />
        </div>
      </main>
    </>
  );
}
