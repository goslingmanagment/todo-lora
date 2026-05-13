/**
 * Insert or clear a small demo task set for local testing.
 *
 * Usage:
 *   pnpm db:seed [Owner Display Name]
 *   pnpm db:seed --clear-demo
 *
 * `--clear-demo` also removes legacy fixture rows created by the old seed
 * script. Topics are seeded by migration 0002. If the requested owner does not
 * exist, this script creates a placeholder user with no login code.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/drizzle/schema';
import { loadEnv } from '@/lib/env';
import { clearDemoTasks, seedDemoTasks } from '@/lib/server/demo-data';

loadEnv();

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--clear-demo')) {
    const result = await clearDemoTasks();
    console.log(`Deleted ${result.deleted} demo/legacy seed tasks.`);
    return;
  }

  const ownerName = args[0] ?? 'Seed Owner';
  const owner = await ensureOwner(ownerName);
  const result = await seedDemoTasks(owner.id);

  if (result.inserted > 0) {
    console.log(`Inserted ${result.inserted} demo tasks for owner ${owner.displayName}.`);
    return;
  }

  console.log(`Demo tasks already exist (${result.existing}); skipping insertion.`);
}

async function ensureOwner(ownerName: string) {
  let owner = await db.query.users.findFirst({
    where: eq(users.displayName, ownerName),
  });

  if (!owner) {
    console.log(`No user matched "${ownerName}". Creating placeholder seed-owner...`);
    const id = randomUUID();
    const placeholderEmail = `seed-${id.slice(0, 8)}@local.todo-lora`;
    await db.insert(users).values({
      id,
      name: ownerName,
      email: placeholderEmail,
      displayName: ownerName,
      emailVerified: true,
    });
    owner = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!owner) throw new Error('Could not create placeholder seed owner');
    console.log(`Placeholder owner created (id=${id}). Note: it has no login code.`);
  }

  return owner;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
