/**
 * Owner CLI: HARD-purge a user created for local/E2E cleanup.
 *
 * Intended for E2E test cleanup — `pnpm user:remove --hard` won't work
 * once the user has touched tasks (task_events has RESTRICT on actor_id).
 * This script wipes tasks they created, deletes audit events where they were
 * the actor, nulls nullable references from unrelated tasks, then deletes
 * preferences, accounts, sessions, and finally the user row.
 *
 * Do not run on a real user — task history is destroyed.
 *
 * Usage:  pnpm user:purge -- --yes --confirm "Display Name" "Display Name" | <user-id>
 * Raw:    pnpm exec tsx scripts/user-purge.ts --yes --confirm "Display Name" "Display Name"
 */
import { and, eq, or, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users, accounts } from '@/drizzle/schema/auth';
import { tasks, taskEvents, attachments } from '@/drizzle/schema/tasks';
import { userPreferences } from '@/drizzle/schema/preferences';
import { loadEnv } from '@/lib/env';
import { deleteObject } from '@/lib/storage/presign';

loadEnv();

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const ident = parsed.ident?.trim();
  if (!ident) {
    console.error('Usage: pnpm user:purge -- --yes --confirm "<same identifier>" "<Display Name | user-id | email>"');
    process.exit(1);
  }
  if (!parsed.yes || parsed.confirm !== ident) {
    console.error('Refusing hard purge. Pass --yes and --confirm with the exact identifier being purged.');
    process.exit(1);
  }
  if (!isAllowedDatabase(process.env.DATABASE_URL ?? '')) {
    console.error('Refusing hard purge against a non-local database. Set ALLOW_USER_PURGE_NON_LOCAL=true to override.');
    process.exit(1);
  }

  const found = await db
    .select()
    .from(users)
    .where(or(eq(users.id, ident), eq(users.displayName, ident), eq(users.email, ident)))
    .limit(1);
  const user = found[0];
  if (!user) {
    console.error(`No user found for "${ident}".`);
    process.exit(2);
  }

  const created = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.createdBy, user.id));
  const createdIds = created.map((t) => t.id);
  const imageKeys = createdIds.length
    ? await db
        .select({ key: attachments.objectKey })
        .from(attachments)
        .where(and(inArray(attachments.taskId, createdIds), isNotNull(attachments.objectKey)))
    : [];

  const result = await db.transaction(async (tx) => {
    if (createdIds.length > 0) {
      await tx.delete(tasks).where(inArray(tasks.id, createdIds));
    }
    await tx.update(tasks).set({ assigneeId: null }).where(eq(tasks.assigneeId, user.id));
    await tx.update(tasks).set({ requesterId: null }).where(eq(tasks.requesterId, user.id));
    await tx.update(tasks).set({ lastEditedBy: null }).where(eq(tasks.lastEditedBy, user.id));
    await tx.delete(taskEvents).where(eq(taskEvents.actorId, user.id));
    await tx.delete(userPreferences).where(eq(userPreferences.userId, user.id));
    await tx.delete(accounts).where(eq(accounts.userId, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(users).where(eq(users.id, user.id));
    return { deletedTasks: createdIds.length };
  });

  for (const { key } of imageKeys) {
    if (!key) continue;
    try {
      await deleteObject(key);
    } catch (err) {
      console.warn(`Could not delete object ${key}:`, err);
    }
  }

  console.log(
    `Purged user ${user.displayName} (${user.id}); deleted ${result.deletedTasks} created tasks and ${imageKeys.length} image objects.`,
  );
}

function parseArgs(args: string[]): { yes: boolean; confirm: string | null; ident: string | null } {
  let yes = false;
  let confirm: string | null = null;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--yes') {
      yes = true;
      continue;
    }
    if (arg === '--confirm') {
      confirm = args[++i] ?? null;
      continue;
    }
    if (arg.startsWith('--confirm=')) {
      confirm = arg.slice('--confirm='.length);
      continue;
    }
    positional.push(arg);
  }

  return { yes, confirm, ident: positional[0] ?? null };
}

function isAllowedDatabase(databaseUrl: string): boolean {
  if (process.env.ALLOW_USER_PURGE_NON_LOCAL === 'true') return true;
  try {
    const url = new URL(databaseUrl);
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1' ||
      url.hostname === '[::1]' ||
      url.pathname.endsWith('_test')
    );
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
