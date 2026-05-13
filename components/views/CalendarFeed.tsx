import Link from 'next/link';
import type { Task } from '@/drizzle/schema';
import { addDaysIso, diffDaysIso } from '@/lib/format/dates';
import { topicColor } from '@/lib/format/topicColor';
import { PriorityDot } from '@/components/PriorityDot';
import type { FeedResult } from '@/lib/server/feed';
import type { FilterValue } from '@/lib/validation/schemas';

const WEEKDAY_SHORT_CAP = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12));
}

function formatDayDate(iso: string): string {
  const dt = isoToLocalDate(iso);
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

type DayBucket = {
  key: string;
  label: string;
  date: string;
  className: string;
  tasks: Task[];
};

function buildBuckets(activeTasks: Task[], todayIso: string): DayBucket[] {
  const buckets: DayBucket[] = [
    { key: 'overdue', label: 'Просрочено', date: `до ${formatShortDate(todayIso)}`, className: 'day-col day-col-overdue', tasks: [] },
  ];
  // Sliding 5-day window starting today: today, today+1, today+2, today+3, today+4.
  // Day labels stay short (two-letter weekday) so column headers have a stable
  // width — earlier "Понедельник"/"Вторник" stretched and pushed the date out.
  for (let i = 0; i <= 4; i++) {
    const iso = addDaysIso(todayIso, i);
    const dt = isoToLocalDate(iso);
    let label: string;
    let className = 'day-col';
    if (i === 0) {
      label = 'Сегодня';
      className = 'day-col day-col-today';
    } else if (i === 1) {
      label = 'Завтра';
    } else {
      label = WEEKDAY_SHORT_CAP[dt.getUTCDay()]!;
    }
    buckets.push({ key: `d${i}`, label, date: formatDayDate(iso), className, tasks: [] });
  }
  // Split «Позже» (future, dated) from «Без дедлайна» (no deadline) so the
  // operator can tell the two states apart at a glance. Both were lumped into
  // a single column before, which made it look like every undated task was
  // weeks away.
  const laterIdx = buckets.length;
  buckets.push({
    key: 'later',
    label: 'Позже',
    date: `от ${formatShortDate(addDaysIso(todayIso, 5))}`,
    className: 'day-col',
    tasks: [],
  });
  const noDeadlineIdx = buckets.length;
  buckets.push({
    key: 'nodate',
    label: 'Без дедлайна',
    date: '—',
    className: 'day-col day-col-nodate',
    tasks: [],
  });

  const lastDayIso = addDaysIso(todayIso, 4);
  for (const t of activeTasks) {
    if (!t.deadlineOn) {
      buckets[noDeadlineIdx]!.tasks.push(t);
      continue;
    }
    if (t.deadlineOn < todayIso) {
      buckets[0]!.tasks.push(t);
      continue;
    }
    if (t.deadlineOn > lastDayIso) {
      buckets[laterIdx]!.tasks.push(t);
      continue;
    }
    const offset = diffDaysIso(t.deadlineOn, todayIso);
    buckets[1 + offset]!.tasks.push(t);
  }

  return buckets;
}

function formatShortDate(iso: string): string {
  const dt = isoToLocalDate(iso);
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

function formatRelativeHint(
  deadlineIso: string | null,
  todayIso: string,
): string | null {
  if (!deadlineIso) return null;
  const diff = diffDaysIso(deadlineIso, todayIso);
  if (diff < 0) return `−${-diff}д · ${formatShortDate(deadlineIso)}`;
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  return `+${diff}д · ${formatShortDate(deadlineIso)}`;
}

function activeBucketKey(filter: FilterValue): string | null {
  if (filter === 'overdue') return 'overdue';
  if (filter === 'today') return 'd0';
  return null;
}

export function CalendarFeed({
  feed,
  filter,
  highlightTaskId,
}: {
  feed: FeedResult;
  filter: FilterValue;
  highlightTaskId?: string | null;
}) {
  const todayIso = feed.todayIso;
  const allActive = feed.sections.flatMap((s) => s.active);
  const topicById = new Map(feed.sections.map((s) => [s.topic.id, s.topic]));
  const buckets = buildBuckets(allActive, todayIso);
  const highlightKey = activeBucketKey(filter);

  return (
    <div className="cal-grid">
      {buckets.map((b) => {
        const cls = `${b.className}${highlightKey === b.key ? ' day-col-active' : ''}`;
        return (
          <div className={cls} key={b.key}>
            <header>
              <div>
                <div className="day-name">{b.label}</div>
                <div className="day-date">{b.date}</div>
              </div>
              <span className="day-count tabular">{b.tasks.length}</span>
            </header>
            {b.tasks.length === 0 ? (
              <div className="day-card-empty">—</div>
            ) : (
              b.tasks.map((t) => {
                const topic = topicById.get(t.topicId);
                // Show a date hint inside cards whose bucket doesn't already
                // carry a specific calendar date — overdue/later/nodate. Cards
                // inside d0..d4 share the column header date.
                const showDateHint = b.key === 'overdue' || b.key === 'later' || b.key === 'nodate';
                const dateHint = showDateHint
                  ? formatRelativeHint(t.deadlineOn, todayIso)
                  : null;
                return (
                  <Link
                    key={t.id}
                    href={`/task/${t.id}`}
                    prefetch={true}
                    className={`day-card${t.id === highlightTaskId ? ' flash' : ''}`}
                  >
                    <div className="day-card-title">{t.title}</div>
                    <div className="day-card-meta">
                      {topic ? (
                        <span
                          className="topic-tag"
                          style={
                            {
                              ['--topic-color' as string]: topicColor(topic.slug),
                            } as React.CSSProperties
                          }
                        >
                          {topic.name}
                        </span>
                      ) : null}
                      <PriorityDot priority={t.priority} />
                      {dateHint ? <span className="day-card-date">{dateHint}</span> : null}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
