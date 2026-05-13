/**
 * Owner CLI: provision a new user.
 * Usage:  pnpm user:add "Display Name" [email]
 *
 * Prints the freshly generated login code ONCE. Hand it off out-of-band
 * (Telegram DM). No way to recover after this — rotate to issue a new one.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/drizzle/schema/auth';
import { generateLoginCode, hashLoginCode } from '@/lib/auth/codes';
import { loadEnv } from '@/lib/env';

loadEnv();

async function main() {
  const displayName = process.argv[2]?.trim();
  const emailArg = process.argv[3]?.trim();
  if (!displayName) {
    console.error('Usage: pnpm user:add "Display Name" [email]');
    process.exit(1);
  }

  const id = randomUUID();
  const email = emailArg && emailArg.length > 0 ? emailArg : `${slugify(displayName)}@local.todo-lora`;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    console.error(`User with email "${email}" already exists.`);
    process.exit(2);
  }

  const code = generateLoginCode(10);
  const hash = await hashLoginCode(code);

  await db.insert(users).values({
    id,
    name: displayName,
    displayName,
    email,
    emailVerified: true,
    loginCodeHash: hash,
  });

  console.log('');
  console.log(`User created:  ${displayName} <${email}>`);
  console.log(`User ID:       ${id}`);
  console.log('');
  console.log(`Login code (shown once): ${code}`);
  console.log('');
  console.log('Hand this to the user privately (e.g. Telegram DM).');
  console.log('The code is not stored in plaintext and cannot be recovered.');
  process.exit(0);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
