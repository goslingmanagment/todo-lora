/**
 * Server-action integration tests against a real Postgres testcontainer.
 *
 * The actions module reads auth via `requireAuth()` from `@/lib/auth/session`.
 * We mock that module to inject a fixed acting user for each test.
 *
 * Storage actions are excluded from this file — they need MinIO. URL
 * attachments and task mutations are covered here.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { MAX_IMAGE_BYTES } from '@/lib/domain/limits';
import { ensureUser, getPool, startTestDb, truncateAll, type IntegrationDB } from './_helpers';

const ACTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const OTHER_ID = '00000000-0000-0000-0000-0000000000bb';
const VALID_MISSING_TASK_ID = '00000000-0000-0000-0000-0000000000cc';

// Default content_task fixture used as a stub anywhere we just need *some*
// task to exist. Previously these tests used `type: 'note'` because note
// required no extra fields; with note removed, content_task is the cheapest
// real option and needs requester/priority/deadline.
function stubInput(topicId: string, title: string) {
  return {
    type: 'content_task' as const,
    topicId,
    title,
    priority: 'medium' as const,
    deadlineOn: '2026-06-01',
    requesterId: ACTOR_ID,
  };
}

const authState = vi.hoisted(() => ({ authenticated: true }));
const sanitizeState = vi.hoisted(() => ({
  calls: [] as string[],
  onSanitize: null as null | ((taskId: string, stagingKey: string) => void | Promise<void>),
  throwOnSanitize: null as Error | null,
}));
const storageState = vi.hoisted(() => ({
  objectSize: 100,
  throwOnObjectSize: null as Error | null,
}));

vi.mock('@/lib/auth/session', () => {
  return {
    requireAuth: async () => {
      if (!authState.authenticated) throw new Error('unauthenticated');
      return {
        user: {
          id: ACTOR_ID,
          displayName: 'Tester',
          name: 'Tester',
          email: 't@local',
          disabledAt: null,
        },
        session: {},
      };
    },
    getCurrentAuth: async () =>
      authState.authenticated
        ? {
            user: {
              id: ACTOR_ID,
              displayName: 'Tester',
              name: 'Tester',
              email: 't@local',
              disabledAt: null,
            },
            session: {},
          }
        : null,
    destroyCurrentSession: async () => undefined,
  };
});

vi.mock('@/lib/storage/sanitize', () => ({
  sanitizeStagedImage: async (taskId: string, stagingKey: string) => {
    sanitizeState.calls.push(stagingKey);
    if (sanitizeState.throwOnSanitize) throw sanitizeState.throwOnSanitize;
    if (!stagingKey.startsWith(`staging/${taskId}/`)) {
      throw new Error('bad staging key');
    }
    await sanitizeState.onSanitize?.(taskId, stagingKey);
    return {
      objectKey: `attachments/${taskId}/fake.bin`,
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      width: 10,
      height: 10,
    };
  },
}));

const deleteObjectCalls: string[] = [];
vi.mock('@/lib/storage/presign', () => ({
  createUploadPresign: async (taskId: string) => ({
    url: 'http://127.0.0.1:9000/staging/abc',
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    stagingKey: `staging/${taskId}/00000000-0000-4000-8000-000000000001.jpg`,
    expiresAt: Date.now() + 60_000,
  }),
  presignDownload: async () => 'http://127.0.0.1:9000/preview',
  getObjectSize: async () => {
    if (storageState.throwOnObjectSize) throw storageState.throwOnObjectSize;
    return storageState.objectSize;
  },
  deleteObject: async (key: string) => {
    deleteObjectCalls.push(key);
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', () => ({ redirect: () => undefined }));

import type * as ActionsModule from '@/lib/server/actions';
import type * as FeedModule from '@/lib/server/feed';
import type * as LookupsModule from '@/lib/server/lookups';
import type * as SchemaModule from '@/drizzle/schema';

let db: IntegrationDB;
let actions: typeof ActionsModule;
let feed: typeof FeedModule;
let lookups: typeof LookupsModule;
let schema: typeof SchemaModule;

beforeAll(async () => {
  db = await startTestDb();
  process.env.DATABASE_URL = `postgres://todo_lora_test:todo_lora_test@${getPool().options.host}:${getPool().options.port}/todo_lora_test`;
  // Force lib/db/client to use our test pool.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__todoLoraPool = getPool();

  schema = await import('@/drizzle/schema');
  actions = await import('@/lib/server/actions');
  feed = await import('@/lib/server/feed');
  lookups = await import('@/lib/server/lookups');
}, 180_000);

afterAll(async () => {
  await db?._close();
});

beforeEach(async () => {
  await truncateAll(getPool());
  await ensureUser(getPool(), 'Tester', ACTOR_ID);
  await ensureUser(getPool(), 'Other', OTHER_ID);
  deleteObjectCalls.length = 0;
  authState.authenticated = true;
  sanitizeState.calls.length = 0;
  sanitizeState.onSanitize = null;
  sanitizeState.throwOnSanitize = null;
  storageState.objectSize = 100;
  storageState.throwOnObjectSize = null;
});

async function getTopicId(slug: string): Promise<string> {
  const { rows } = await getPool().query(`SELECT id FROM topics WHERE slug = $1`, [slug]);
  return rows[0].id as string;
}

async function getCustomsTopicId(): Promise<string> {
  return getTopicId('customs');
}

async function reloadTask(id: string) {
  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  if (!rows[0]) throw new Error(`Task ${id} not found`);
  return rows[0];
}

async function recentEvents(taskId: string) {
  const result = await actions.getRecentEventsAction({ taskId });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.data.events;
}

async function waitForTimestampTick() {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

describe('createTaskAction', () => {
  it('creates a Custom task and emits a created event', async () => {
    const topicId = await getCustomsTopicId();
    const result = await actions.createTaskAction({
      type: 'custom',
      topicId,
      title: 'Custom one',
      description: null,
      priority: 'high',
      deadlineOn: '2026-05-15',
      buyerHandle: '@hi',
      buyerDisplayName: null,
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 250,
      amountCollectedDollars: 0,
      durationMinMinutes: 5,
      durationMaxMinutes: 5,
      agreementState: 'pending',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await recentEvents(result.data.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe('created');
    expect(events[0]!.actorId).toBe(ACTOR_ID);
  });

  it('rejects content_task without requesterId', async () => {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'no requester',
      priority: 'medium',
      deadlineOn: '2026-05-15',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects disabled users for new content task assignments', async () => {
    const topicId = await getCustomsTopicId();
    await getPool().query(`UPDATE users SET disabled_at = now() WHERE id = $1`, [OTHER_ID]);

    const disabledRequester = await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'disabled requester',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      requesterId: OTHER_ID,
      assigneeId: null,
    });
    expect(disabledRequester.ok).toBe(false);
    if (!disabledRequester.ok) {
      expect(disabledRequester.fieldErrors?.requesterId).toBe('Выберите активного пользователя');
    }

    const disabledAssignee = await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'disabled assignee',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      requesterId: ACTOR_ID,
      assigneeId: OTHER_ID,
    });
    expect(disabledAssignee.ok).toBe(false);
    if (!disabledAssignee.ok) {
      expect(disabledAssignee.fieldErrors?.assigneeId).toBe('Выберите активного пользователя');
    }
  });

  it('stores server-side defaults per user and task type', async () => {
    const customsTopicId = await getCustomsTopicId();
    const setsTopicId = await getTopicId('sets');
    const r1 = await actions.createTaskAction({
      type: 'custom',
      topicId: customsTopicId,
      title: 'Custom prefs first',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      buyerHandle: '@prefs',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 100,
      amountCollectedDollars: 100,
      agreementState: 'confirmed',
    });
    expect(r1.ok).toBe(true);

    const r2 = await actions.createTaskAction({
      type: 'custom',
      topicId: setsTopicId,
      title: 'Custom prefs second',
      priority: 'medium',
      deadlineOn: '2026-05-16',
      buyerHandle: '@prefs2',
      platform: 'ManyVids',
      paymentModel: 'unlock',
      amountDollars: 150,
      amountCollectedDollars: 10,
      agreementState: 'confirmed',
    });
    expect(r2.ok).toBe(true);

    const r3 = await actions.createTaskAction(stubInput(customsTopicId, 'Content prefs'));
    expect(r3.ok).toBe(true);

    const prefs = await db.select().from(schema.userPreferences);
    const customPref = prefs.find((pref) => pref.taskType === 'custom');
    const contentPref = prefs.find((pref) => pref.taskType === 'content_task');

    expect(customPref?.userId).toBe(ACTOR_ID);
    expect(customPref?.lastTopicId).toBe(setsTopicId);
    expect(customPref?.lastPlatform).toBe('ManyVids');
    expect(contentPref?.lastTopicId).toBe(customsTopicId);
    expect(contentPref?.lastPlatform).toBeNull();
  });
});

describe('protected server actions', () => {
  it('rejects unauthenticated task and audit reads', async () => {
    authState.authenticated = false;

    const create = await actions.createTaskAction(stubInput(await getCustomsTopicId(), 'blocked'));
    expect(create.ok).toBe(false);
    if (!create.ok) expect(create.code).toBe('unauthenticated');

    const events = await actions.getRecentEventsAction({ taskId: VALID_MISSING_TASK_ID });
    expect(events.ok).toBe(false);
    if (!events.ok) expect(events.code).toBe('unauthenticated');
  });
});

describe('shared lookup helpers', () => {
  it('omits disabled users from active assignee options', async () => {
    await getPool().query(`UPDATE users SET disabled_at = now() WHERE id = $1`, [OTHER_ID]);
    const activeUsers = await lookups.listActiveUserOptions();
    const allUsers = await lookups.listAllUserOptions();

    expect(activeUsers.some((user) => user.id === ACTOR_ID)).toBe(true);
    expect(activeUsers.some((user) => user.id === OTHER_ID)).toBe(false);
    expect(allUsers.some((user) => user.id === OTHER_ID)).toBe(true);
  });
});

describe('demo data actions', () => {
  it('seeds a small idempotent demo set and clears only demo tasks', async () => {
    const topicId = await getCustomsTopicId();
    const realTask = await actions.createTaskAction(stubInput(topicId, 'real task must stay'));
    expect(realTask.ok).toBe(true);

    const seeded = await actions.seedDemoDataAction();
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    expect(seeded.data.inserted).toBe(13);
    expect(seeded.data.existing).toBe(0);

    const afterSeed = await db.select().from(schema.tasks);
    expect(afterSeed).toHaveLength(14);

    const secondSeed = await actions.seedDemoDataAction();
    expect(secondSeed.ok).toBe(true);
    if (!secondSeed.ok) return;
    expect(secondSeed.data.inserted).toBe(0);
    expect(secondSeed.data.existing).toBe(13);

    const afterSecondSeed = await db.select().from(schema.tasks);
    expect(afterSecondSeed).toHaveLength(14);

    const [legacySeedTask] = await db
      .insert(schema.tasks)
      .values({
        type: 'content_task',
        topicId,
        title: 'legacy seed task',
        createdBy: ACTOR_ID,
      })
      .returning({ id: schema.tasks.id });
    if (!legacySeedTask) throw new Error('legacy setup failed');
    await db.insert(schema.taskEvents).values({
      taskId: legacySeedTask.id,
      actorId: ACTOR_ID,
      eventType: 'created',
      payload: { seed: true, type: 'content_task', status: 'draft' },
    });

    const afterLegacy = await db.select().from(schema.tasks);
    expect(afterLegacy).toHaveLength(15);

    const cleared = await actions.clearDemoDataAction();
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.data.deleted).toBe(14);

    const remaining = await db.select().from(schema.tasks);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.title).toBe('real task must stay');

    const secondClear = await actions.clearDemoDataAction();
    expect(secondClear.ok).toBe(true);
    if (!secondClear.ok) return;
    expect(secondClear.data.deleted).toBe(0);
  });
});

describe('changeStatusAction (FSM + OCC)', () => {
  async function setupCustom() {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction({
      type: 'custom',
      topicId,
      title: 'C',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      buyerHandle: '@x',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 100,
      amountCollectedDollars: 100,
      agreementState: 'confirmed',
    });
    if (!r.ok) throw new Error('setup failed');
    const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, r.data.id));
    if (!rows[0]) throw new Error('expected row');
    return rows[0];
  }

  it('walks through draft → in_progress → done → delivered', async () => {
    let task = await setupCustom();
    const r1 = await actions.changeStatusAction({
      id: task.id,
      newStatus: 'in_progress',
      expectedVersion: task.version,
    });
    expect(r1.ok).toBe(true);

    task = await reloadTask(task.id);
    const r2 = await actions.changeStatusAction({
      id: task.id,
      newStatus: 'done',
      expectedVersion: task.version,
    });
    expect(r2.ok).toBe(true);

    task = await reloadTask(task.id);
    const r3 = await actions.changeStatusAction({
      id: task.id,
      newStatus: 'delivered',
      expectedVersion: task.version,
    });
    expect(r3.ok).toBe(true);

    const events = await recentEvents(task.id);
    const types = events.map((e) => e.eventType);
    expect(types.filter((t) => t === 'status_changed').length).toBeGreaterThanOrEqual(3);
  });

  it('requires confirmed agreement before marking a Custom delivered', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction({
      type: 'custom',
      topicId,
      title: 'C pending agreement',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      buyerHandle: '@x',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 100,
      amountCollectedDollars: 100,
      agreementState: 'pending',
    });
    if (!c.ok) throw new Error('setup failed');
    let task = await reloadTask(c.data.id);
    for (const next of ['in_progress', 'done'] as const) {
      const ok = await actions.changeStatusAction({
        id: task.id,
        newStatus: next,
        expectedVersion: task.version,
      });
      expect(ok.ok).toBe(true);
      task = await reloadTask(task.id);
    }

    const delivered = await actions.changeStatusAction({
      id: task.id,
      newStatus: 'delivered',
      expectedVersion: task.version,
    });
    expect(delivered.ok).toBe(false);
    if (!delivered.ok) expect(delivered.code).toBe('agreement_pending');
  });

  it('returns stale on OCC mismatch', async () => {
    const task = await setupCustom();
    const beforeEvents = await recentEvents(task.id);
    const r = await actions.changeStatusAction({
      id: task.id,
      newStatus: 'in_progress',
      expectedVersion: 999,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('stale');
    const afterTask = await reloadTask(task.id);
    const afterEvents = await recentEvents(task.id);
    expect(afterTask.status).toBe('draft');
    expect(afterEvents).toHaveLength(beforeEvents.length);
  });

  it('rolls back status when audit insert fails', async () => {
    const task = await setupCustom();
    await getPool().query(`
      CREATE OR REPLACE FUNCTION fail_task_event_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced audit failure';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER fail_task_event_insert_trg
      BEFORE INSERT ON task_events
      FOR EACH ROW EXECUTE FUNCTION fail_task_event_insert();
    `);
    try {
      await expect(
        actions.changeStatusAction({
          id: task.id,
          newStatus: 'in_progress',
          expectedVersion: task.version,
        }),
      ).rejects.toThrow();
      const after = await reloadTask(task.id);
      expect(after.status).toBe('draft');
    } finally {
      await getPool().query(`
        DROP TRIGGER IF EXISTS fail_task_event_insert_trg ON task_events;
        DROP FUNCTION IF EXISTS fail_task_event_insert();
      `);
    }
  });

  it('rejects non-Custom → delivered', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'X',
      priority: 'low',
      deadlineOn: '2026-05-15',
      requesterId: ACTOR_ID,
    });
    if (!c.ok) throw new Error('create failed');
    let cur = await reloadTask(c.data.id);
    const r1 = await actions.changeStatusAction({
      id: cur.id,
      newStatus: 'in_progress',
      expectedVersion: cur.version,
    });
    expect(r1.ok).toBe(true);
    cur = await reloadTask(cur.id);
    const r2 = await actions.changeStatusAction({
      id: cur.id,
      newStatus: 'done',
      expectedVersion: cur.version,
    });
    expect(r2.ok).toBe(true);
    cur = await reloadTask(cur.id);
    const r3 = await actions.changeStatusAction({
      id: cur.id,
      newStatus: 'delivered',
      expectedVersion: cur.version,
    });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.code).toBe('wrong_type');
  });
});

describe('agreement state', () => {
  it('rejects setAgreementState on non-Custom', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'note'));
    if (!c.ok) throw new Error('create failed');
    const task = await reloadTask(c.data.id);
    const r = await actions.setAgreementStateAction({
      id: c.data.id,
      agreementState: 'confirmed',
      expectedVersion: task.version,
    });
    expect(r.ok).toBe(false);
  });

  it('uses OCC for Custom agreement changes', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction({
      type: 'custom',
      topicId,
      title: 'agreement',
      priority: 'low',
      deadlineOn: '2026-05-15',
      buyerHandle: '@agreement',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 50,
      amountCollectedDollars: 0,
      agreementState: 'pending',
    });
    if (!c.ok) throw new Error('create failed');
    const task = await reloadTask(c.data.id);

    const stale = await actions.setAgreementStateAction({
      id: c.data.id,
      agreementState: 'confirmed',
      expectedVersion: 999,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe('stale');

    const ok = await actions.setAgreementStateAction({
      id: c.data.id,
      agreementState: 'confirmed',
      expectedVersion: task.version,
    });
    expect(ok.ok).toBe(true);
    const fresh = await reloadTask(c.data.id);
    expect(fresh.agreementState).toBe('confirmed');
  });
});

describe('URL attachments', () => {
  it('adds and removes URL attachments with audit events and parent task metadata', async () => {
    const topicId = await getCustomsTopicId();
    const [task] = await db
      .insert(schema.tasks)
      .values({
        type: 'content_task',
        topicId,
        title: 'attach',
        createdBy: OTHER_ID,
        lastEditedBy: OTHER_ID,
      })
      .returning();
    if (!task) throw new Error('create failed');
    await waitForTimestampTick();
    const a = await actions.createUrlAttachmentAction({
      taskId: task.id,
      url: 'https://example.com/x',
      caption: 'note',
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const afterAdd = await reloadTask(task.id);
    expect(afterAdd.lastEditedBy).toBe(ACTOR_ID);
    expect(afterAdd.updatedAt.getTime()).toBeGreaterThan(task.updatedAt.getTime());
    const events = await recentEvents(task.id);
    expect(events.some((e) => e.eventType === 'attachment_added')).toBe(true);

    await waitForTimestampTick();
    const d = await actions.deleteAttachmentAction({ id: a.data.id });
    expect(d.ok).toBe(true);
    const afterDelete = await reloadTask(task.id);
    expect(afterDelete.lastEditedBy).toBe(ACTOR_ID);
    expect(afterDelete.updatedAt.getTime()).toBeGreaterThan(afterAdd.updatedAt.getTime());
    const events2 = await recentEvents(task.id);
    expect(events2.some((e) => e.eventType === 'attachment_removed')).toBe(true);
  });

  it('does not create duplicate audit events or version bumps on stale attachment delete', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'double delete'));
    if (!c.ok) throw new Error('create failed');
    const a = await actions.createUrlAttachmentAction({
      taskId: c.data.id,
      url: 'https://example.com/x',
    });
    if (!a.ok) throw new Error('attachment create failed');

    const first = await actions.deleteAttachmentAction({ id: a.data.id });
    expect(first.ok).toBe(true);
    const afterFirst = await reloadTask(c.data.id);
    const eventsAfterFirst = await recentEvents(c.data.id);

    const second = await actions.deleteAttachmentAction({ id: a.data.id });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('not_found');

    const afterSecond = await reloadTask(c.data.id);
    const eventsAfterSecond = await recentEvents(c.data.id);
    expect(afterSecond.version).toBe(afterFirst.version);
    expect(eventsAfterSecond).toHaveLength(eventsAfterFirst.length);
  });

  it('rejects javascript: URLs', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'attach'));
    if (!c.ok) throw new Error('create failed');
    const a = await actions.createUrlAttachmentAction({
      taskId: c.data.id,
      url: 'javascript:alert(1)',
    });
    expect(a.ok).toBe(false);
  });

  it('enforces 10-attachment cap', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'cap'));
    if (!c.ok) throw new Error('create failed');
    for (let i = 0; i < 10; i++) {
      const r = await actions.createUrlAttachmentAction({
        taskId: c.data.id,
        url: `https://x.example/${i}`,
      });
      expect(r.ok).toBe(true);
    }
    const denied = await actions.createUrlAttachmentAction({
      taskId: c.data.id,
      url: 'https://x.example/over',
    });
    expect(denied.ok).toBe(false);
  });

  it('serializes concurrent writes at the 10-attachment cap', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'cap race'));
    if (!c.ok) throw new Error('create failed');

    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        actions.createUrlAttachmentAction({
          taskId: c.data.id,
          url: `https://race.example/${i}`,
        }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(10);
    expect(results.filter((r) => !r.ok)).toHaveLength(5);
    const rows = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.taskId, c.data.id));
    expect(rows).toHaveLength(10);
  });
});

describe('feed query', () => {
  it('groups active tasks by topic and surfaces outstanding custom money', async () => {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction({
      type: 'custom',
      topicId,
      title: 'Customs A',
      priority: 'high',
      deadlineOn: '2026-05-15',
      buyerHandle: '@a',
      platform: 'Fansly',
      paymentModel: 'unlock',
      amountDollars: 200,
      amountCollectedDollars: 50,
    });
    expect(r.ok).toBe(true);

    const result = await feed.getFeed('all');
    const customsSection = result.sections.find((s) => s.topic.slug === 'customs');
    expect(customsSection?.active.length).toBe(1);
    // 200 - 50 = 150 dollars outstanding = 15000 cents
    expect(result.outstandingCustomCents).toBe(15000);
  });

  it('hides delivered customs from the active feed but keeps them in recently completed', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction({
      type: 'custom',
      topicId,
      title: 'Customs B',
      priority: 'high',
      deadlineOn: '2026-05-15',
      buyerHandle: '@b',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 100,
      amountCollectedDollars: 100,
      agreementState: 'confirmed',
    });
    if (!c.ok) throw new Error('create failed');
    let t = await reloadTask(c.data.id);
    for (const next of ['in_progress', 'done', 'delivered'] as const) {
      const ok = await actions.changeStatusAction({
        id: t.id,
        newStatus: next,
        expectedVersion: t.version,
      });
      expect(ok.ok).toBe(true);
      t = await reloadTask(c.data.id);
    }
    const result = await feed.getFeed('all');
    const customs = result.sections.find((s) => s.topic.slug === 'customs');
    expect(customs?.active.length ?? 0).toBe(0);
    expect(customs?.recentlyCompleted.length ?? 0).toBe(1);
  });

  it('keeps delivered customs active while money is still outstanding', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction({
      type: 'custom',
      topicId,
      title: 'Customs unpaid delivery',
      priority: 'high',
      deadlineOn: '2026-05-15',
      buyerHandle: '@unpaid',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 100,
      amountCollectedDollars: 25,
      agreementState: 'confirmed',
    });
    if (!c.ok) throw new Error('create failed');
    let t = await reloadTask(c.data.id);
    for (const next of ['in_progress', 'done', 'delivered'] as const) {
      const ok = await actions.changeStatusAction({
        id: t.id,
        newStatus: next,
        expectedVersion: t.version,
      });
      expect(ok.ok).toBe(true);
      t = await reloadTask(c.data.id);
    }
    const result = await feed.getFeed('all');
    const customs = result.sections.find((s) => s.topic.slug === 'customs');
    expect(customs?.active.some((row) => row.id === c.data.id)).toBe(true);
    expect(customs?.recentlyCompleted.some((row) => row.id === c.data.id)).toBe(false);
    expect(result.outstandingCustomCents).toBe(7500);
  });

  it('urgent triage filter narrows to high-priority active rows and intersects deadline filters', async () => {
    const topicId = await getCustomsTopicId();
    const { toMskDateString, addDaysIso } = await import('@/lib/format/dates');
    const today = toMskDateString();
    const tomorrow = addDaysIso(today, 1);
    const yesterday = addDaysIso(today, -1);

    await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'low active',
      priority: 'low',
      deadlineOn: today,
      requesterId: ACTOR_ID,
    });
    await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'med tomorrow',
      priority: 'medium',
      deadlineOn: tomorrow,
      requesterId: ACTOR_ID,
    });
    await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'high today',
      priority: 'high',
      deadlineOn: today,
      requesterId: ACTOR_ID,
    });
    await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'high overdue',
      priority: 'high',
      deadlineOn: yesterday,
      requesterId: ACTOR_ID,
    });

    const urgentAll = await feed.getFeed('all', { urgent: true });
    const urgentTitles = urgentAll.sections.flatMap((s) => s.active.map((t) => t.title)).sort();
    expect(urgentTitles).toEqual(['high overdue', 'high today']);
    expect(urgentAll.totals.urgent).toBe(2);

    const urgentToday = await feed.getFeed('today', { urgent: true });
    const urgentTodayTitles = urgentToday.sections.flatMap((s) => s.active.map((t) => t.title));
    expect(urgentTodayTitles).toEqual(['high today']);
  });

  it('searches active tasks by title and custom buyer fields', async () => {
    const topicId = await getCustomsTopicId();
    await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'ordinary note',
      priority: 'low',
      deadlineOn: '2026-05-15',
      requesterId: ACTOR_ID,
    });
    await actions.createTaskAction({
      type: 'custom',
      topicId,
      title: 'buyer lookup',
      priority: 'low',
      deadlineOn: '2026-05-15',
      buyerHandle: '@rare_buyer',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 25,
      amountCollectedDollars: 0,
      agreementState: 'pending',
    });

    const byTitle = await feed.getFeed('all', { search: 'ordinary' });
    expect(byTitle.sections.flatMap((s) => s.active.map((t) => t.title))).toEqual([
      'ordinary note',
    ]);

    const byBuyer = await feed.getFeed('all', { search: 'rare_buyer' });
    expect(byBuyer.sections.flatMap((s) => s.active.map((t) => t.title))).toEqual(['buyer lookup']);
  });

  it('overdue filter only matches deadlines strictly before today', async () => {
    const { addDaysIso, toMskDateString } = await import('@/lib/format/dates');
    const topicId = await getCustomsTopicId();
    const today = toMskDateString();
    const yesterday = addDaysIso(today, -1);
    await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'overdue',
      deadlineOn: yesterday,
      priority: 'low',
      requesterId: ACTOR_ID,
    });
    await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'today',
      deadlineOn: today,
      priority: 'low',
      requesterId: ACTOR_ID,
    });
    const overdue = await feed.getFeed('overdue');
    const overdueRows = overdue.sections.flatMap((s) => s.active);
    expect(overdueRows).toHaveLength(1);
    expect(overdueRows[0]!.title).toBe('overdue');
  });
});

describe('realtime invalidation fanout', () => {
  it('emits exactly one NOTIFY per createTaskAction', async () => {
    const topicId = await getCustomsTopicId();
    const client = await getPool().connect();
    try {
      await client.query('LISTEN task_changes');
      const payloads: string[] = [];
      client.on('notification', (msg) => {
        if (msg.payload) payloads.push(msg.payload);
      });

      const r = await actions.createTaskAction(stubInput(topicId, 'one-notify'));
      expect(r.ok).toBe(true);
      // Generous flush window — Postgres delivers NOTIFY on commit; the
      // listening connection drains them on its next event-loop tick.
      await new Promise((res) => setTimeout(res, 250));

      expect(payloads).toHaveLength(1);
      const parsed = JSON.parse(payloads[0]!);
      if (!r.ok) return;
      expect(parsed.taskId).toBe(r.data.id);
      expect(parsed.topicId).toBe(topicId);
      expect(parsed.reason).toBe('created');
    } finally {
      client.release();
    }
  });

  it('emits exactly one NOTIFY per updateTaskAction', async () => {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction(stubInput(topicId, 'pre-update'));
    if (!r.ok) throw new Error('create failed');
    const fresh = await reloadTask(r.data.id);

    const client = await getPool().connect();
    try {
      await client.query('LISTEN task_changes');
      const payloads: string[] = [];
      client.on('notification', (msg) => {
        if (msg.payload) payloads.push(msg.payload);
      });

      const u = await actions.updateTaskAction({
        id: r.data.id,
        expectedVersion: fresh.version,
        title: 'updated once',
      });
      expect(u.ok).toBe(true);
      await new Promise((res) => setTimeout(res, 250));

      expect(payloads).toHaveLength(1);
      const parsed = JSON.parse(payloads[0]!);
      expect(parsed.taskId).toBe(r.data.id);
      expect(parsed.reason).toBe('edited');
    } finally {
      client.release();
    }
  });
});

describe('updateTaskAction', () => {
  it('records audit event and bumps updated_at', async () => {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction(stubInput(topicId, 'orig'));
    if (!r.ok) throw new Error('create failed');
    const before = await reloadTask(r.data.id);
    await new Promise((res) => setTimeout(res, 5));
    const u = await actions.updateTaskAction({
      id: r.data.id,
      expectedVersion: before.version,
      title: 'edited',
    });
    expect(u.ok).toBe(true);
    const after = await reloadTask(r.data.id);
    expect(after.title).toBe('edited');
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(after.version).toBe(before.version + 1);
    const events = await recentEvents(r.data.id);
    expect(events.some((e) => e.eventType === 'edited')).toBe(true);
  });

  it('returns stale on OCC mismatch and does not write', async () => {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction(stubInput(topicId, 'occ orig'));
    if (!r.ok) throw new Error('create failed');
    const beforeEvents = await recentEvents(r.data.id);
    const before = await reloadTask(r.data.id);

    const stale = await actions.updateTaskAction({
      id: r.data.id,
      expectedVersion: 999,
      title: 'should not land',
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe('stale');

    const after = await reloadTask(r.data.id);
    expect(after.title).toBe('occ orig');
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.version).toBe(before.version);
    const afterEvents = await recentEvents(r.data.id);
    expect(afterEvents).toHaveLength(beforeEvents.length);
  });

  it('rejects a second concurrent write with stale once one has landed', async () => {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction(stubInput(topicId, 'race orig'));
    if (!r.ok) throw new Error('create failed');
    const snapshot = await reloadTask(r.data.id);

    const first = await actions.updateTaskAction({
      id: r.data.id,
      expectedVersion: snapshot.version,
      title: 'first',
    });
    expect(first.ok).toBe(true);

    const second = await actions.updateTaskAction({
      id: r.data.id,
      expectedVersion: snapshot.version,
      title: 'second (stale)',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('stale');

    const after = await reloadTask(r.data.id);
    expect(after.title).toBe('first');
  });

  it('rejects switching content assignments to disabled users but preserves current inactive values', async () => {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'inactive assignee',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      requesterId: ACTOR_ID,
      assigneeId: OTHER_ID,
    });
    if (!r.ok) throw new Error('create failed');

    await getPool().query(`UPDATE users SET disabled_at = now() WHERE id = $1`, [OTHER_ID]);
    const existingInactive = await reloadTask(r.data.id);
    const preserve = await actions.updateTaskAction({
      id: r.data.id,
      expectedVersion: existingInactive.version,
      title: 'keeps inactive assignee',
      requesterId: ACTOR_ID,
      assigneeId: OTHER_ID,
    });
    expect(preserve.ok).toBe(true);

    const unassigned = await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'assign disabled later',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      requesterId: ACTOR_ID,
      assigneeId: null,
    });
    if (!unassigned.ok) throw new Error('create failed');
    const snapshot = await reloadTask(unassigned.data.id);
    const rejected = await actions.updateTaskAction({
      id: unassigned.data.id,
      expectedVersion: snapshot.version,
      assigneeId: OTHER_ID,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.fieldErrors?.assigneeId).toBe('Выберите активного пользователя');
    }
  });

  it('clears requester when the edit form sends requesterId null', async () => {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction({
      type: 'content_task',
      topicId,
      title: 'clear requester',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      requesterId: ACTOR_ID,
      assigneeId: OTHER_ID,
    });
    if (!r.ok) throw new Error('create failed');
    const before = await reloadTask(r.data.id);

    const cleared = await actions.updateTaskAction({
      id: r.data.id,
      expectedVersion: before.version,
      requesterId: null,
    });

    expect(cleared.ok).toBe(true);
    const after = await reloadTask(r.data.id);
    expect(after.requesterId).toBeNull();
    expect(after.assigneeId).toBe(OTHER_ID);
  });

  it('returns field errors for invalid custom money and duration updates', async () => {
    const topicId = await getCustomsTopicId();
    const r = await actions.createTaskAction({
      type: 'custom',
      topicId,
      title: 'custom edit',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      buyerHandle: '@x',
      platform: 'Fansly',
      paymentModel: 'full',
      amountDollars: 100,
      amountCollectedDollars: 0,
      durationMinMinutes: 5,
      durationMaxMinutes: 10,
      agreementState: 'pending',
    });
    if (!r.ok) throw new Error('create failed');
    const fresh = await reloadTask(r.data.id);

    const overCollected = await actions.updateTaskAction({
      id: r.data.id,
      expectedVersion: fresh.version,
      amountCollectedDollars: 200,
    });
    expect(overCollected.ok).toBe(false);
    if (!overCollected.ok) {
      expect(overCollected.fieldErrors?.amountCollectedDollars).toBe('Получено больше суммы');
    }

    const negativeCollected = await actions.updateTaskAction({
      id: r.data.id,
      expectedVersion: fresh.version,
      amountCollectedDollars: -1,
    });
    expect(negativeCollected.ok).toBe(false);
    if (!negativeCollected.ok) {
      expect(negativeCollected.fieldErrors?.amountCollectedDollars).toBe(
        'Не может быть отрицательной',
      );
    }

    const invertedDuration = await actions.updateTaskAction({
      id: r.data.id,
      expectedVersion: fresh.version,
      durationMinMinutes: 15,
    });
    expect(invertedDuration.ok).toBe(false);
    if (!invertedDuration.ok) {
      expect(invertedDuration.fieldErrors?.durationMaxMinutes).toBe(
        'Максимум должен быть ≥ минимума',
      );
    }
  });
});

describe('image attachment finalization', () => {
  async function insertUrlAttachments(taskId: string, count: number) {
    await db.insert(schema.attachments).values(
      Array.from({ length: count }, (_, index) => ({
        taskId,
        kind: 'url' as const,
        url: `https://cap.example/${index}`,
        uploadedBy: ACTOR_ID,
      })),
    );
  }

  it('registers an image attachment after sanitize and updates parent task metadata', async () => {
    const topicId = await getCustomsTopicId();
    const [task] = await db
      .insert(schema.tasks)
      .values({
        type: 'content_task',
        topicId,
        title: 'pic',
        createdBy: OTHER_ID,
        lastEditedBy: OTHER_ID,
      })
      .returning();
    if (!task) throw new Error('create failed');
    await waitForTimestampTick();
    const r = await actions.finalizeImageAttachmentAction({
      taskId: task.id,
      stagingKey: `staging/${task.id}/00000000-0000-4000-8000-000000000001.jpg`,
      filename: 'a.jpg',
      caption: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = await reloadTask(task.id);
    expect(after.lastEditedBy).toBe(ACTOR_ID);
    expect(after.updatedAt.getTime()).toBeGreaterThan(task.updatedAt.getTime());
    const rows = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.taskId, task.id));
    expect(rows[0]!.kind).toBe('image');
    expect(rows[0]!.objectKey).toBeTruthy();
  });

  it('skips sanitize and deletes staging when the cap is already reached', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'pic cap'));
    if (!c.ok) throw new Error('create failed');
    await insertUrlAttachments(c.data.id, 10);
    const stagingKey = `staging/${c.data.id}/00000000-0000-4000-8000-000000000001.jpg`;

    const r = await actions.finalizeImageAttachmentAction({
      taskId: c.data.id,
      stagingKey,
      filename: 'a.jpg',
      caption: null,
    });

    expect(r.ok).toBe(false);
    expect(sanitizeState.calls).toHaveLength(0);
    expect(deleteObjectCalls).toContain(stagingKey);
  });

  it('rejects oversized staged objects before sanitize and deletes staging', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'pic too large'));
    if (!c.ok) throw new Error('create failed');
    const stagingKey = `staging/${c.data.id}/00000000-0000-4000-8000-000000000001.jpg`;
    storageState.objectSize = MAX_IMAGE_BYTES + 1;

    const r = await actions.finalizeImageAttachmentAction({
      taskId: c.data.id,
      stagingKey,
      filename: 'a.jpg',
      caption: null,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Изображение больше 20 МБ');
    expect(sanitizeState.calls).toHaveLength(0);
    expect(deleteObjectCalls).toContain(stagingKey);
  });

  it('deletes staging when sanitize fails', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'pic sanitize fail'));
    if (!c.ok) throw new Error('create failed');
    const stagingKey = `staging/${c.data.id}/00000000-0000-4000-8000-000000000001.jpg`;
    sanitizeState.throwOnSanitize = new Error('bad image metadata');

    const r = await actions.finalizeImageAttachmentAction({
      taskId: c.data.id,
      stagingKey,
      filename: 'a.jpg',
      caption: null,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('sanitize_failed');
    expect(deleteObjectCalls).toContain(stagingKey);
  });

  it('rechecks the cap after sanitize and deletes the canonical object on cap race', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'pic cap race'));
    if (!c.ok) throw new Error('create failed');
    sanitizeState.onSanitize = async (taskId) => {
      await insertUrlAttachments(taskId, 10);
    };

    const r = await actions.finalizeImageAttachmentAction({
      taskId: c.data.id,
      stagingKey: `staging/${c.data.id}/00000000-0000-4000-8000-000000000001.jpg`,
      filename: 'a.jpg',
      caption: null,
    });

    expect(r.ok).toBe(false);
    const rows = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.taskId, c.data.id));
    expect(rows).toHaveLength(10);
    expect(rows.some((row) => row.kind === 'image')).toBe(false);
    expect(deleteObjectCalls).toContain(`attachments/${c.data.id}/fake.bin`);
  });

  it('deletes the canonical object when DB finalization fails', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'pic db fail'));
    if (!c.ok) throw new Error('create failed');
    await getPool().query(`
      CREATE OR REPLACE FUNCTION fail_task_event_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced audit failure';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER fail_task_event_insert_trg
      BEFORE INSERT ON task_events
      FOR EACH ROW EXECUTE FUNCTION fail_task_event_insert();
    `);
    try {
      await expect(
        actions.finalizeImageAttachmentAction({
          taskId: c.data.id,
          stagingKey: `staging/${c.data.id}/00000000-0000-4000-8000-000000000001.jpg`,
          filename: 'a.jpg',
          caption: null,
        }),
      ).rejects.toThrow();
      const rows = await db
        .select()
        .from(schema.attachments)
        .where(eq(schema.attachments.taskId, c.data.id));
      expect(rows).toHaveLength(0);
      expect(deleteObjectCalls).toContain(`attachments/${c.data.id}/fake.bin`);
    } finally {
      await getPool().query(`
        DROP TRIGGER IF EXISTS fail_task_event_insert_trg ON task_events;
        DROP FUNCTION IF EXISTS fail_task_event_insert();
      `);
    }
  });

  it('rejects forged canonical object keys before sanitize', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'pic'));
    if (!c.ok) throw new Error('create failed');
    const r = await actions.finalizeImageAttachmentAction({
      taskId: c.data.id,
      stagingKey: `attachments/${c.data.id}/00000000-0000-4000-8000-000000000001.bin`,
      filename: 'a.jpg',
      caption: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors?.stagingKey).toBeTruthy();
    }
  });
});

describe('deleteTaskAction (hard delete)', () => {
  it('removes the row, cascades attachments + events, and cleans MinIO objects', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'to delete'));
    if (!c.ok) throw new Error('create failed');

    // Attach a URL (kept in DB only) and an image (kept in MinIO + DB).
    const url = await actions.createUrlAttachmentAction({
      taskId: c.data.id,
      url: 'https://x.example/ref',
    });
    expect(url.ok).toBe(true);

    const img = await actions.finalizeImageAttachmentAction({
      taskId: c.data.id,
      stagingKey: `staging/${c.data.id}/00000000-0000-4000-8000-000000000001.jpg`,
      filename: 'a.jpg',
      caption: null,
    });
    expect(img.ok).toBe(true);

    const fresh = await reloadTask(c.data.id);
    deleteObjectCalls.length = 0;

    const del = await actions.deleteTaskAction({
      id: c.data.id,
      expectedVersion: fresh.version,
    });
    expect(del.ok).toBe(true);

    // Row + cascaded children are gone.
    const remaining = await db.select().from(schema.tasks).where(eq(schema.tasks.id, c.data.id));
    expect(remaining).toHaveLength(0);
    const remainingAtts = await db
      .select()
      .from(schema.attachments)
      .where(eq(schema.attachments.taskId, c.data.id));
    expect(remainingAtts).toHaveLength(0);
    const remainingEvents = await db
      .select()
      .from(schema.taskEvents)
      .where(eq(schema.taskEvents.taskId, c.data.id));
    expect(remainingEvents).toHaveLength(0);

    // The image's canonical MinIO key was cleaned. URL attachments never
    // had an object_key so they don't appear here.
    expect(deleteObjectCalls).toHaveLength(1);
    expect(deleteObjectCalls[0]).toMatch(/^attachments\//);
  });

  it('returns stale when expectedVersion is wrong and does not delete', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'survive'));
    if (!c.ok) throw new Error('create failed');

    const del = await actions.deleteTaskAction({
      id: c.data.id,
      expectedVersion: 999,
    });
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.code).toBe('stale');

    const stillThere = await db.select().from(schema.tasks).where(eq(schema.tasks.id, c.data.id));
    expect(stillThere).toHaveLength(1);
  });

  it('hides the task from feed reads after hard delete', async () => {
    const topicId = await getCustomsTopicId();
    const c = await actions.createTaskAction(stubInput(topicId, 'visible then gone'));
    if (!c.ok) throw new Error('create failed');
    const fresh = await reloadTask(c.data.id);

    const before = await feed.getFeed('all');
    expect(before.sections.flatMap((s) => s.active).some((t) => t.id === c.data.id)).toBe(true);

    const del = await actions.deleteTaskAction({
      id: c.data.id,
      expectedVersion: fresh.version,
    });
    expect(del.ok).toBe(true);

    const after = await feed.getFeed('all');
    expect(after.sections.flatMap((s) => s.active).some((t) => t.id === c.data.id)).toBe(false);
    expect(after.sections.flatMap((s) => s.recentlyCompleted).some((t) => t.id === c.data.id)).toBe(
      false,
    );
  });
});
