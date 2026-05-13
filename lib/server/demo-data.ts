import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { taskEvents, tasks, topics } from '@/drizzle/schema';
import { addDaysIso, toMskDateString } from '@/lib/format/dates';
import { emitTaskInvalidationInTransaction } from '@/lib/realtime/notify';

export const DEMO_DATASET = 'telegram-export-2026-05-small';

type DemoFixture = {
  sourceMessageId: number;
  type: 'custom' | 'content_task' | 'note';
  topicSlug: string;
  title: string;
  description: string | null;
  status?: 'draft' | 'in_progress' | 'done' | 'delivered' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | null;
  deadlineOffsetDays: number | null;
  assignOwner?: boolean;
  requestOwner?: boolean;
  buyerHandle?: string;
  buyerDisplayName?: string | null;
  platform?: string;
  paymentModel?: 'full' | 'unlock';
  amountCents?: number;
  amountCollectedCents?: number;
  durationMinSeconds?: number | null;
  durationMaxSeconds?: number | null;
  agreementState?: 'pending' | 'confirmed' | 'rejected';
};

const DEMO_FIXTURES: DemoFixture[] = [
  {
    sourceMessageId: 9176,
    type: 'custom',
    topicSlug: 'customs',
    title: 'Custom для @fan_jeff — срочный ролик',
    description:
      'Из Telegram-заказа: 5 минут, один образ, нужно назвать имя покупателя. Главный риск — короткий срок.',
    status: 'in_progress',
    priority: 'high',
    deadlineOffsetDays: -1,
    buyerHandle: '@fan_jeff',
    buyerDisplayName: 'Jeff',
    platform: 'Fansly',
    paymentModel: 'full',
    amountCents: 20000,
    amountCollectedCents: 20000,
    durationMinSeconds: 300,
    durationMaxSeconds: 300,
    agreementState: 'confirmed',
  },
  {
    sourceMessageId: 9282,
    type: 'custom',
    topicSlug: 'customs',
    title: 'Custom для @sport_fan — 13 минут',
    description:
      'Оплачено полностью. Сначала спортивный блок, затем основной сценарий. Нужна проверка перед загрузкой.',
    status: 'in_progress',
    priority: 'medium',
    deadlineOffsetDays: 0,
    buyerHandle: '@sport_fan',
    platform: 'OnlyFans',
    paymentModel: 'full',
    amountCents: 30000,
    amountCollectedCents: 30000,
    durationMinSeconds: 780,
    durationMaxSeconds: 780,
    agreementState: 'confirmed',
  },
  {
    sourceMessageId: 9274,
    type: 'custom',
    topicSlug: 'customs',
    title: 'Custom для @photo_buyer — 5-10 фото',
    description: 'Небольшой фото-заказ. Важно не забыть нижний ракурс и проверить выбранный образ.',
    status: 'draft',
    priority: 'medium',
    deadlineOffsetDays: 2,
    buyerHandle: '@photo_buyer',
    platform: 'Fansly',
    paymentModel: 'full',
    amountCents: 5000,
    amountCollectedCents: 5000,
    durationMinSeconds: null,
    durationMaxSeconds: null,
    agreementState: 'confirmed',
  },
  {
    sourceMessageId: 8937,
    type: 'custom',
    topicSlug: 'customs',
    title: 'Custom для @andrew_vip — крупный заказ',
    description:
      'Частичная предоплата, остальное открытием после готовности. Длинный сценарий лучше разбить на чеклист.',
    status: 'delivered',
    priority: 'high',
    deadlineOffsetDays: -4,
    buyerHandle: '@andrew_vip',
    buyerDisplayName: 'Andrew',
    platform: 'Fansly',
    paymentModel: 'unlock',
    amountCents: 55000,
    amountCollectedCents: 40000,
    durationMinSeconds: 1200,
    durationMaxSeconds: 1200,
    agreementState: 'confirmed',
  },
  {
    sourceMessageId: 9314,
    type: 'content_task',
    topicSlug: 'ppv',
    title: 'PPV-бандл: 2 фотосета + 2 коротких видео',
    description:
      'Снять два комплекта для платной рассылки или стены. Первый бандл раньше, второй — позже.',
    status: 'in_progress',
    priority: 'high',
    deadlineOffsetDays: 3,
    assignOwner: true,
    requestOwner: true,
  },
  {
    sourceMessageId: 9313,
    type: 'content_task',
    topicSlug: 'life',
    title: 'Life-photo: 10-20 живых фото',
    description:
      'Нужны естественные фото для ощущения “снято прямо сейчас”: дом, кофе, зеркало, кухня, мягкий свет.',
    status: 'draft',
    priority: 'medium',
    deadlineOffsetDays: 12,
    assignOwner: true,
    requestOwner: true,
  },
  {
    sourceMessageId: 9315,
    type: 'content_task',
    topicSlug: 'sets',
    title: 'Photo set: тизер + платный сет',
    description:
      'Два фотосета по гайду: сначала тизер, затем основной платный набор. Проверить рекомендации перед съемкой.',
    status: 'draft',
    priority: 'medium',
    deadlineOffsetDays: 6,
    assignOwner: true,
    requestOwner: true,
  },
  {
    sourceMessageId: 9117,
    type: 'content_task',
    topicSlug: 'instagram',
    title: 'Instagram: снять контент по референсам',
    description:
      'Повторить движения из референсов одним кадром; движение камеры сделают на монтаже.',
    status: 'in_progress',
    priority: 'medium',
    deadlineOffsetDays: 4,
    assignOwner: true,
    requestOwner: true,
  },
  {
    sourceMessageId: 8946,
    type: 'content_task',
    topicSlug: 'pictures',
    title: 'Фото-пак на 90 кадров по категориям',
    description:
      'Разбить большой список на мини-сеты: джинсы, POV, прозрачные образы, детали, запасные кадры.',
    status: 'in_progress',
    priority: 'medium',
    deadlineOffsetDays: 1,
    assignOwner: true,
    requestOwner: true,
  },
  {
    sourceMessageId: 9175,
    type: 'note',
    topicSlug: 'instagram',
    title: 'Уточнение для монтажа: камера не слишком близко',
    description:
      'Для референсов с движением камеры снять ровно одним кадром и оставить запас по краям.',
    status: 'draft',
    priority: 'low',
    deadlineOffsetDays: null,
  },
  {
    sourceMessageId: 9182,
    type: 'content_task',
    topicSlug: 'life',
    title: 'Life: фото из зала',
    description:
      'Сделать несколько зеркальных фото в зале и пару кадров с легким реквизитом, чтобы закрыть живой чат-контент.',
    status: 'draft',
    priority: 'low',
    deadlineOffsetDays: 5,
    assignOwner: true,
    requestOwner: true,
  },
  {
    sourceMessageId: 9269,
    type: 'note',
    topicSlug: 'customs',
    title: 'Снять общий кадр реквизита',
    description:
      'Попросили фото всех игрушек рядом на одном кадре, чтобы быстро согласовывать кастомы.',
    status: 'draft',
    priority: 'low',
    deadlineOffsetDays: 1,
  },
  {
    sourceMessageId: 9283,
    type: 'custom',
    topicSlug: 'customs',
    title: 'Custom для @detail_fan — короткий фокусный ролик',
    description:
      'Короткий оплаченный заказ на 2 минуты. Нужен один главный акцент и быстрый финальный просмотр.',
    status: 'draft',
    priority: 'medium',
    deadlineOffsetDays: 2,
    buyerHandle: '@detail_fan',
    platform: 'Fansly',
    paymentModel: 'full',
    amountCents: 5000,
    amountCollectedCents: 5000,
    durationMinSeconds: 120,
    durationMaxSeconds: 120,
    agreementState: 'confirmed',
  },
  {
    sourceMessageId: 9301,
    type: 'custom',
    topicSlug: 'customs',
    title: 'Custom для @repeat_order — повторный запрос',
    description:
      'Постоянный покупатель снова просит похожий формат. Нужно сверить комфортные рамки перед съемкой.',
    status: 'in_progress',
    priority: 'high',
    deadlineOffsetDays: 0,
    buyerHandle: '@repeat_order',
    platform: 'Fansly',
    paymentModel: 'unlock',
    amountCents: 10000,
    amountCollectedCents: 0,
    durationMinSeconds: 300,
    durationMaxSeconds: 300,
    agreementState: 'pending',
  },
  {
    sourceMessageId: 8883,
    type: 'content_task',
    topicSlug: 'fyp',
    title: 'FYP: собрать короткие вертикальные референсы',
    description:
      'На основе Instagram-референсов выделить 3 коротких вертикальных идеи для теста в ленте.',
    status: 'draft',
    priority: 'medium',
    deadlineOffsetDays: 8,
    assignOwner: true,
    requestOwner: true,
  },
];

export async function getDemoTaskCount(): Promise<number> {
  return (await getClearableDemoTaskIds()).length;
}

export async function clearDemoTasks(): Promise<{ deleted: number; topicIds: string[] }> {
  const ids = await getClearableDemoTaskIds();
  if (ids.length === 0) return { deleted: 0, topicIds: [] };

  const deleted = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(tasks)
      .where(inArray(tasks.id, ids))
      .returning({ id: tasks.id, topicId: tasks.topicId });
    if (rows.length > 0) {
      await emitTaskInvalidationInTransaction(tx, {
        taskId: 'demo-data',
        topicId: null,
        reason: 'demo_cleared',
        at: Date.now(),
      });
    }
    return rows;
  });

  return {
    deleted: deleted.length,
    topicIds: Array.from(new Set(deleted.map((row) => row.topicId))),
  };
}

export async function seedDemoTasks(
  ownerId: string,
): Promise<{ inserted: number; existing: number; topicIds: string[] }> {
  const existing = (await getCurrentDemoTaskIds()).length;
  if (existing > 0) return { inserted: 0, existing, topicIds: [] };

  const topicRows = await db.select().from(topics);
  const bySlug = (slug: string) => {
    const topic = topicRows.find((row) => row.slug === slug);
    if (!topic) throw new Error(`Topic ${slug} not seeded - run pnpm db:migrate first`);
    return topic.id;
  };

  const todayIso = toMskDateString();
  const insertedTopicIds = new Set<string>();
  const inserted = await db.transaction(async (tx) => {
    const rows: Array<{ id: string; topicId: string }> = [];

    for (const fixture of DEMO_FIXTURES) {
      const topicId = bySlug(fixture.topicSlug);
      const deadlineOn =
        fixture.deadlineOffsetDays == null
          ? null
          : addDaysIso(todayIso, fixture.deadlineOffsetDays);
      const [task] = await tx
        .insert(tasks)
        .values({
          type: fixture.type,
          topicId,
          title: fixture.title,
          description: fixture.description,
          status: fixture.status ?? 'draft',
          priority: fixture.priority ?? null,
          deadlineOn,
          assigneeId: fixture.type === 'content_task' && fixture.assignOwner ? ownerId : null,
          requesterId: fixture.type === 'content_task' && fixture.requestOwner ? ownerId : null,
          createdBy: ownerId,
          lastEditedBy: ownerId,
          buyerHandle: fixture.type === 'custom' ? (fixture.buyerHandle ?? null) : null,
          buyerDisplayName: fixture.type === 'custom' ? (fixture.buyerDisplayName ?? null) : null,
          platform: fixture.type === 'custom' ? (fixture.platform ?? null) : null,
          paymentModel: fixture.type === 'custom' ? (fixture.paymentModel ?? null) : null,
          amountCents: fixture.type === 'custom' ? (fixture.amountCents ?? null) : null,
          amountCollectedCents:
            fixture.type === 'custom' ? (fixture.amountCollectedCents ?? null) : null,
          durationMinSeconds:
            fixture.type === 'custom' ? (fixture.durationMinSeconds ?? null) : null,
          durationMaxSeconds:
            fixture.type === 'custom' ? (fixture.durationMaxSeconds ?? null) : null,
          agreementState: fixture.type === 'custom' ? (fixture.agreementState ?? 'pending') : null,
        })
        .returning({ id: tasks.id, topicId: tasks.topicId });
      if (!task) throw new Error('Insert returned no row');

      await tx.insert(taskEvents).values({
        taskId: task.id,
        actorId: ownerId,
        eventType: 'created',
        payload: {
          demo: true,
          demoSet: DEMO_DATASET,
          source: 'telegram_export',
          sourceMessageId: fixture.sourceMessageId,
          type: fixture.type,
          status: fixture.status ?? 'draft',
        },
      });

      insertedTopicIds.add(task.topicId);
      rows.push(task);
    }

    if (rows.length > 0) {
      await emitTaskInvalidationInTransaction(tx, {
        taskId: 'demo-data',
        topicId: null,
        reason: 'demo_seeded',
        at: Date.now(),
      });
    }

    return rows;
  });

  return {
    inserted: inserted.length,
    existing: 0,
    topicIds: Array.from(insertedTopicIds),
  };
}

async function getClearableDemoTaskIds(): Promise<string[]> {
  const [currentIds, legacyIds] = await Promise.all([
    getCurrentDemoTaskIds(),
    getLegacySeedTaskIds(),
  ]);
  return Array.from(new Set([...currentIds, ...legacyIds]));
}

async function getCurrentDemoTaskIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ taskId: taskEvents.taskId })
    .from(taskEvents)
    .where(
      and(
        eq(taskEvents.eventType, 'created'),
        sql`${taskEvents.payload}->>'demoSet' = ${DEMO_DATASET}`,
      ),
    );

  return rows.map((row) => row.taskId);
}

async function getLegacySeedTaskIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ taskId: taskEvents.taskId })
    .from(taskEvents)
    .where(
      and(
        eq(taskEvents.eventType, 'created'),
        sql`${taskEvents.payload}->>'seed' = 'true'`,
        sql`${taskEvents.payload}->>'demoSet' IS NULL`,
      ),
    );

  return rows.map((row) => row.taskId);
}
