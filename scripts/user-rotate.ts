/**
 * Owner CLI: rotate a user's login code.
 * Usage:  pnpm user:rotate-code "Display Name"
 *      or pnpm user:rotate-code <user-id>
 *
 * Invalidates all live sessions for the user.
 */
import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users } from '@/drizzle/schema/auth';
import { generateLoginCode, hashLoginCode } from '@/lib/auth/codes';
import { loadEnv } from '@/lib/env';

loadEnv();

async function main() {
  const ident = process.argv[2]?.trim();
  if (!ident) {
    console.error('Usage: pnpm user:rotate-code "Display Name" | <user-id>');
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

  const code = generateLoginCode(10);
  const hash = await hashLoginCode(code);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ loginCodeHash: hash, updatedAt: new Date() }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
  });

  console.log('');
  console.log(`Rotated code for: ${user.displayName} <${user.email}>`);
  console.log(`Live sessions for this user have been invalidated.`);
  console.log('');
  console.log(`New login code (shown once): ${code}`);
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
