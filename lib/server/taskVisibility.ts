import { and, eq, ne, or, sql } from 'drizzle-orm';
import { tasks } from '@/drizzle/schema';

export function customNeedsAttentionPredicate() {
  return or(
    ne(tasks.status, 'delivered'),
    sql`${tasks.agreementState} IS DISTINCT FROM 'confirmed'`,
    sql`coalesce(${tasks.amountCollectedCents}, 0) < coalesce(${tasks.amountCents}, 0)`,
  );
}

export function activeTaskPredicate() {
  return and(
    ne(tasks.status, 'cancelled'),
    or(
      and(eq(tasks.type, 'custom'), customNeedsAttentionPredicate()),
      and(ne(tasks.type, 'custom'), ne(tasks.status, 'done')),
    ),
  );
}

export function recentlyCompletedTaskPredicate() {
  return or(
    and(
      eq(tasks.type, 'custom'),
      eq(tasks.status, 'delivered'),
      eq(tasks.agreementState, 'confirmed'),
      sql`coalesce(${tasks.amountCollectedCents}, 0) >= coalesce(${tasks.amountCents}, 0)`,
    ),
    and(ne(tasks.type, 'custom'), eq(tasks.status, 'done')),
  );
}
