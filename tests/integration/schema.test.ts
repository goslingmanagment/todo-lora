import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startTestDb, ensureUser, getPool, truncateAll, type IntegrationDB } from './_helpers';
import { tasks, taskEvents, attachments } from '@/drizzle/schema';

let db: IntegrationDB;
const OWNER_ID = '00000000-0000-0000-0000-000000000001';

beforeAll(async () => {
  db = await startTestDb();
  await truncateAll(getPool());
  await ensureUser(getPool(), 'Owner', OWNER_ID);
}, 180_000);

afterAll(async () => {
  await db?._close();
});

async function getCustomsTopicId(): Promise<string> {
  const { rows } = await getPool().query(`SELECT id FROM topics WHERE slug = 'customs'`);
  return rows[0].id as string;
}

describe('schema CHECKs', () => {
  it('rejects custom-only fields on a content_task row', async () => {
    const topicId = await getCustomsTopicId();
    await expect(
      db.insert(tasks).values({
        type: 'content_task',
        topicId,
        title: 'bad content_task',
        contentDestination: 'other',
        contentProductionStatus: 'planned',
        createdBy: OWNER_ID,
        // Custom-only column on a non-custom row → CHECK should fail
        buyerHandle: '@x',
      }),
    ).rejects.toThrow();
  });

  it('rejects status=delivered on content_task', async () => {
    const topicId = await getCustomsTopicId();
    await expect(
      db.insert(tasks).values({
        type: 'content_task',
        topicId,
        title: 'bad delivered',
        status: 'delivered',
        contentDestination: 'other',
        contentProductionStatus: 'planned',
        createdBy: OWNER_ID,
      }),
    ).rejects.toThrow();
  });

  it('allows content_task row with structured media volume', async () => {
    const topicId = await getCustomsTopicId();
    const [row] = await db
      .insert(tasks)
      .values({
        type: 'content_task',
        topicId,
        title: 'content with volume',
        description: 'brief',
        contentDestination: 'of_ppv',
        contentProductionStatus: 'planned',
        createdBy: OWNER_ID,
        durationMinSeconds: 300,
        durationMaxSeconds: 600,
        photoCountMin: 5,
        photoCountMax: 15,
      })
      .returning();
    expect(row?.id).toBeTruthy();
  });

  it('allows valid custom row with money/duration constraints', async () => {
    const topicId = await getCustomsTopicId();
    const [row] = await db
      .insert(tasks)
      .values({
        type: 'custom',
        topicId,
        title: 'ok custom',
        createdBy: OWNER_ID,
        buyerHandle: '@a',
        platform: 'Fansly',
        contentKind: 'video',
        paymentModel: 'unlock',
        amountCents: 10000,
        amountCollectedCents: 5000,
        durationMinSeconds: 300,
        durationMaxSeconds: 600,
      })
      .returning();
    expect(row?.id).toBeTruthy();
  });

  it('allows valid photo custom row', async () => {
    const topicId = await getCustomsTopicId();
    const [row] = await db
      .insert(tasks)
      .values({
        type: 'custom',
        topicId,
        title: 'ok photo custom',
        createdBy: OWNER_ID,
        buyerHandle: '@photo',
        platform: 'Fansly',
        contentKind: 'photo',
        paymentModel: 'full',
        amountCents: 10000,
        amountCollectedCents: 10000,
        photoCountMin: 5,
        photoCountMax: 10,
      })
      .returning();
    expect(row?.id).toBeTruthy();
  });

  it('rejects collected > total', async () => {
    const topicId = await getCustomsTopicId();
    await expect(
      db.insert(tasks).values({
        type: 'custom',
        topicId,
        title: 'overcollected',
        createdBy: OWNER_ID,
        buyerHandle: '@b',
        platform: 'Fansly',
        paymentModel: 'full',
        amountCents: 1000,
        amountCollectedCents: 5000,
      }),
    ).rejects.toThrow();
  });

  it('rejects negative total amount', async () => {
    const topicId = await getCustomsTopicId();
    await expect(
      db.insert(tasks).values({
        type: 'custom',
        topicId,
        title: 'negative total',
        createdBy: OWNER_ID,
        amountCents: -1,
      }),
    ).rejects.toThrow();
  });

  it('rejects negative collected amount', async () => {
    const topicId = await getCustomsTopicId();
    await expect(
      db.insert(tasks).values({
        type: 'custom',
        topicId,
        title: 'negative collected',
        createdBy: OWNER_ID,
        amountCents: 1000,
        amountCollectedCents: -1,
      }),
    ).rejects.toThrow();
  });

  it('rejects unlock without amount', async () => {
    const topicId = await getCustomsTopicId();
    await expect(
      db.insert(tasks).values({
        type: 'custom',
        topicId,
        title: 'unlock no amount',
        createdBy: OWNER_ID,
        buyerHandle: '@c',
        platform: 'Fansly',
        paymentModel: 'unlock',
      }),
    ).rejects.toThrow();
  });

  it('attachments must have either object_key (image) or url (url) — not both', async () => {
    const topicId = await getCustomsTopicId();
    const [task] = await db
      .insert(tasks)
      .values({
        type: 'content_task',
        topicId,
        title: 'attach test',
        contentDestination: 'other',
        contentProductionStatus: 'planned',
        createdBy: OWNER_ID,
      })
      .returning();
    if (!task) throw new Error('expected task');

    await expect(
      db.insert(attachments).values({
        taskId: task.id,
        kind: 'image',
        url: 'https://x.example',
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(attachments).values({
        taskId: task.id,
        kind: 'url',
        objectKey: 'attachments/x',
      }),
    ).rejects.toThrow();

    const [ok] = await db
      .insert(attachments)
      .values({ taskId: task.id, kind: 'url', url: 'https://x.example' })
      .returning();
    expect(ok?.id).toBeTruthy();
  });
});

describe('triggers', () => {
  it('updates `updated_at` on UPDATE', async () => {
    const topicId = await getCustomsTopicId();
    const [t1] = await db
      .insert(tasks)
      .values({
        type: 'content_task',
        topicId,
        title: 'updated_at test',
        contentDestination: 'other',
        contentProductionStatus: 'planned',
        createdBy: OWNER_ID,
      })
      .returning();
    if (!t1) throw new Error('expected task');
    const before = t1.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await db.update(tasks).set({ title: 'renamed' }).where(eq(tasks.id, t1.id));
    const t2 = await db.query.tasks.findFirst({ where: eq(tasks.id, t1.id) });
    expect(t2?.updatedAt.getTime()).toBeGreaterThan(before.getTime());
    expect(t2?.version).toBe(1);
  });

  it('does NOT NOTIFY on raw inserts (DB triggers were dropped in 0005)', async () => {
    // Confirms migration 0005 removed the AFTER-write triggers. The
    // realtime contract is now: server actions emit `pg_notify` explicitly,
    // so raw inserts (whether bypassing actions in tests or background
    // tooling) do not produce phantom client refreshes.
    const topicId = await getCustomsTopicId();
    const client = await getPool().connect();
    try {
      await client.query('LISTEN task_changes');
      const events: string[] = [];
      client.on('notification', (msg) => {
        if (msg.payload) events.push(msg.payload);
      });
      const [row] = await db
        .insert(tasks)
        .values({
          type: 'content_task',
          topicId,
          title: 'no-NOTIFY test',
          contentDestination: 'other',
          contentProductionStatus: 'planned',
          createdBy: OWNER_ID,
        })
        .returning({ id: tasks.id });
      await new Promise((r) => setTimeout(r, 200));
      expect(events.length).toBe(0);
      await db.insert(taskEvents).values({
        taskId: row!.id,
        actorId: OWNER_ID,
        eventType: 'created',
      });
      await new Promise((r) => setTimeout(r, 200));
      expect(events.length).toBe(0);
    } finally {
      client.release();
    }
  });
});

describe('migration compatibility', () => {
  it('refuses unsafe adoption for a fully migrated schema without history', async () => {
    await getPool().query(`
      DROP TABLE IF EXISTS __drizzle_migrations;
      CREATE TABLE __drizzle_migrations (
        tag text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    process.env.DATABASE_URL = `postgres://todo_lora_test:todo_lora_test@${getPool().options.host}:${getPool().options.port}/todo_lora_test`;
    const { adoptExistingBaseline } = await import('../../scripts/migrate');
    const applied = new Set<string>();
    const client = await getPool().connect();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await expect(adoptExistingBaseline(client, applied)).rejects.toThrow(
        /refusing unsafe baseline adoption/,
      );
    } finally {
      logSpy.mockRestore();
      client.release();
    }

    const { rows } = await getPool().query<{ tag: string }>(
      `SELECT tag FROM __drizzle_migrations WHERE tag = '0001_init'`,
    );
    expect(applied.has('0001_init')).toBe(false);
    expect(rows).toHaveLength(0);
  });
});
