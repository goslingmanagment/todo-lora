/**
 * Owner CLI: soft-remove a user (sets disabled_at, clears login code, kills sessions).
 * Historical task_events references stay valid because rows are not deleted.
 *
 * Usage:  pnpm user:remove "Display Name" | <user-id>
 *      add --hard to actually delete the row (only works if no FK references exist).
 */
import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users } from '@/drizzle/schema/auth';
import { loadEnv } from '@/lib/env';

loadEnv();

async function main() {
  const ident = process.argv[2]?.trim();
  const hard = process.argv.includes('--hard');
  if (!ident) {
    console.error('Usage: pnpm user:remove "Display Name" | <user-id> [--hard]');
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

  if (hard) {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(sessions).where(eq(sessions.userId, user.id));
        await tx.delete(users).where(eq(users.id, user.id));
      });
      console.log(`Hard-deleted user ${user.displayName} (${user.id}).`);
    } catch (err) {
      console.error(
        'Hard delete failed (likely FK references in task_events). Falling back is safer; rerun without --hard.',
      );
      console.error(err);
      process.exit(3);
    }
  } else {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ disabledAt: new Date(), loginCodeHash: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
    });
    console.log(`Disabled user ${user.displayName} (${user.id}). Sessions cleared, code revoked.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
