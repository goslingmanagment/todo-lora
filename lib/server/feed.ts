/**
 * Feed query builder. Server-only.
 *
 * Active = §6.4 visibility rules.
 * Recently completed = §6.4 collapsed subsection.
 * Sort = §6.5.
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tasks, topics, type TaskType } from '@/drizzle/schema';
import { addDaysIso, toMskDateString } from '@/lib/format/dates';
import type { FilterValue } from '@/lib/validation/schemas';

export type TaskRow = typeof tasks.$inferSelect;
export type TopicRow = typeof topics.$inferSelect;

const orderByActive = sql`
  CASE ${tasks.priority}
    WHEN 'high' THEN 0
    WHEN 'medium' THEN 1
    WHEN 'low' THEN 2
    ELSE 3
  END,
  ${tasks.deadlineOn} ASC NULLS LAST,
  ${tasks.updatedAt} DESC
`;

/**
 * Returns `true` for the SQL predicate matching “active” cards per type.
 * We compose this in code rather than as a CHECK so it can also be evaluated
 * client-side later if needed.
 */
function activePredicate() {
  return and(
    ne(tasks.status, 'cancelled'),
    or(
      // Custom: delivered work stays visible while money/agreement still needs attention.
      and(eq(tasks.type, 'custom'), customNeedsAttentionPredicate()),
      // Content/Note: active unless done or cancelled
      and(ne(tasks.type, 'custom'), ne(tasks.status, 'done')),
    ),
  );
}

function customNeedsAttentionPredicate() {
  return or(
    ne(tasks.status, 'delivered'),
    sql`${tasks.agreementState} IS DISTINCT FROM 'confirmed'`,
    sql`coalesce(${tasks.amountCollectedCents}, 0) < coalesce(${tasks.amountCents}, 0)`,
  );
}

function completedCustomPredicate() {
  return and(
    eq(tasks.type, 'custom'),
    eq(tasks.status, 'delivered'),
    eq(tasks.agreementState, 'confirmed'),
    sql`coalesce(${tasks.amountCollectedCents}, 0) >= coalesce(${tasks.amountCents}, 0)`,
  );
}

function filterPredicate(filter: FilterValue, todayIso: string) {
  if (filter === 'all') return undefined;
  if (filter === 'overdue') {
    return and(isNotNull(tasks.deadlineOn), lte(tasks.deadlineOn, addDaysIso(todayIso, -1)));
  }
  if (filter === 'today') {
    return eq(tasks.deadlineOn, todayIso);
  }
  // 'week' = today..today+6 inclusive
  return and(
    isNotNull(tasks.deadlineOn),
    gte(tasks.deadlineOn, todayIso),
    lte(tasks.deadlineOn, addDaysIso(todayIso, 6)),
  );
}

function searchPredicate(query: string) {
  const pattern = `%${escapeLikePattern(query)}%`;
  const escape = '\\';
  return or(
    sql`${tasks.title} ILIKE ${pattern} ESCAPE ${escape}`,
    sql`${tasks.description} ILIKE ${pattern} ESCAPE ${escape}`,
    sql`${tasks.buyerHandle} ILIKE ${pattern} ESCAPE ${escape}`,
    sql`${tasks.buyerDisplayName} ILIKE ${pattern} ESCAPE ${escape}`,
    sql`${tasks.platform} ILIKE ${pattern} ESCAPE ${escape}`,
  );
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type FeedSection = {
  topic: TopicRow;
  active: TaskRow[];
  recentlyCompleted: TaskRow[];
};

export type FeedResult = {
  todayIso: string;
  sections: FeedSection[];
  outstandingCustomCents: number;
  totals: FeedTotals;
};

export type FeedTotals = {
  active: number;
  overdue: number;
  todayDue: number;
  thisWeekDue: number;
  urgent: number;
};

export type HeaderMetrics = {
  outstandingCustomCents: number;
  totals: FeedTotals;
};

export type FeedOptions = {
  /** When true, restrict the active set to high-priority tasks (P1.4.1). */
  urgent?: boolean;
  /** Free-text operator search over task/buyer fields. */
  search?: string;
};

export async function getFeed(
  filter: FilterValue = 'all',
  options: FeedOptions = {},
): Promise<FeedResult> {
  const todayIso = toMskDateString();
  const { urgent = false } = options;
  const search = options.search?.trim().slice(0, 100) ?? '';

  const topicRows = await db
    .select()
    .from(topics)
    .where(sql`${topics.archivedAt} IS NULL`)
    .orderBy(topics.sortOrder);
  const activeTopicIds = topicRows.map((topic) => topic.id);

  // Active tasks under filter (deadline) and any triage chips (urgent).
  const wherePieces = [activePredicate()];
  if (activeTopicIds.length > 0) wherePieces.push(inArray(tasks.topicId, activeTopicIds));
  const deadlineWhere = filterPredicate(filter, todayIso);
  if (deadlineWhere) wherePieces.push(deadlineWhere);
  if (urgent) wherePieces.push(eq(tasks.priority, 'high'));
  if (search) wherePieces.push(searchPredicate(search));
  const where = wherePieces.length === 1 ? wherePieces[0] : and(...wherePieces);

  const activeRows = await db
    .select()
    .from(tasks)
    .where(where)
    .orderBy(orderByActive);

  // Recently completed (last 7 days by updatedAt). Only included for 'all'.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentPieces = [
    and(
      or(
        completedCustomPredicate(),
        and(ne(tasks.type, 'custom'), eq(tasks.status, 'done')),
      ),
      gte(tasks.updatedAt, sevenDaysAgo),
    ),
  ];
  if (search) recentPieces.push(searchPredicate(search));
  if (activeTopicIds.length > 0) recentPieces.push(inArray(tasks.topicId, activeTopicIds));
  const recentlyCompleted = filter === 'all'
    ? await db
        .select()
        .from(tasks)
        .where(recentPieces.length === 1 ? recentPieces[0] : and(...recentPieces))
        .orderBy(desc(tasks.updatedAt))
    : [];

  const sections: FeedSection[] = topicRows.map((t) => ({
    topic: t,
    active: activeRows.filter((r) => r.topicId === t.id),
    recentlyCompleted: recentlyCompleted.filter((r) => r.topicId === t.id),
  }));

  const { outstandingCustomCents, totals } = await getHeaderMetrics(todayIso);

  return {
    todayIso,
    sections,
    outstandingCustomCents,
    totals,
  };
}

export async function getHeaderMetrics(todayIso: string = toMskDateString()): Promise<HeaderMetrics> {
  const weekEnd = addDaysIso(todayIso, 6);
  const [row] = await db
    .select({
      outstandingCustomCents: sql<number>`coalesce(sum(
        CASE
          WHEN ${tasks.type} = 'custom' AND ${tasks.amountCents} IS NOT NULL
          THEN greatest(0, ${tasks.amountCents} - coalesce(${tasks.amountCollectedCents}, 0))
          ELSE 0
        END
      ), 0)::integer`,
      active: sql<number>`(count(*))::integer`,
      overdue: sql<number>`(count(*) FILTER (
        WHERE ${tasks.deadlineOn} IS NOT NULL AND ${tasks.deadlineOn} < ${todayIso}
      ))::integer`,
      todayDue: sql<number>`(count(*) FILTER (
        WHERE ${tasks.deadlineOn} = ${todayIso}
      ))::integer`,
      thisWeekDue: sql<number>`(count(*) FILTER (
        WHERE ${tasks.deadlineOn} IS NOT NULL
          AND ${tasks.deadlineOn} >= ${todayIso}
          AND ${tasks.deadlineOn} <= ${weekEnd}
      ))::integer`,
      urgent: sql<number>`(count(*) FILTER (WHERE ${tasks.priority} = 'high'))::integer`,
    })
    .from(tasks)
    .innerJoin(topics, eq(tasks.topicId, topics.id))
    .where(and(activePredicate(), isNull(topics.archivedAt)));

  return {
    outstandingCustomCents: row?.outstandingCustomCents ?? 0,
    totals: {
      active: row?.active ?? 0,
      overdue: row?.overdue ?? 0,
      todayDue: row?.todayDue ?? 0,
      thisWeekDue: row?.thisWeekDue ?? 0,
      urgent: row?.urgent ?? 0,
    },
  };
}

export async function getTaskById(id: string): Promise<TaskRow | null> {
  const row = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  return row ?? null;
}

export type AnyTaskRow = TaskRow & { _type?: TaskType };
