/**
 * Owner CLI: list users.
 */
import { db } from '@/lib/db/client';
import { users } from '@/drizzle/schema/auth';
import { loadEnv } from '@/lib/env';

loadEnv();

async function main() {
  const rows = await db.select().from(users);
  if (rows.length === 0) {
    console.log('No users yet. Add one with: pnpm user:add "Display Name"');
    return;
  }
  for (const u of rows) {
    const status = u.disabledAt ? 'DISABLED' : u.loginCodeHash ? 'active' : 'no-code';
    console.log(`${u.id}  ${u.displayName.padEnd(20)}  ${u.email.padEnd(40)}  ${status}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
