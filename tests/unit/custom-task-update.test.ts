import { describe, expect, it } from 'vitest';
import type { Task } from '@/drizzle/schema';
import { inferCustomTaskTitle } from '@/lib/domain/taskTitle';
import {
  buildCustomTaskUpdatePatch,
  validateCustomTaskUpdate,
} from '@/lib/server/customTaskUpdate';
import type { UpdateTaskOutput } from '@/lib/validation/schemas';

const baseTask: Task = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'custom',
  topicId: '00000000-0000-4000-8000-000000000002',
  title: 'Custom task',
  description: null,
  status: 'draft',
  priority: 'medium',
  deadlineOn: '2026-06-01',
  createdBy: 'user-1',
  lastEditedBy: 'user-1',
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-01T00:00:00Z'),
  version: 0,
  buyerHandle: '@old',
  buyerDisplayName: null,
  platform: 'Fansly',
  contentKind: 'video',
  paymentModel: 'full',
  amountCents: 10000,
  amountCollectedCents: 5000,
  durationMinSeconds: 300,
  durationMaxSeconds: 300,
  photoCountMin: null,
  photoCountMax: null,
  contentDestination: null,
  contentProductionStatus: null,
  agreementState: 'pending',
};

function update(overrides: Partial<UpdateTaskOutput>): UpdateTaskOutput {
  return {
    id: baseTask.id,
    expectedVersion: baseTask.version,
    description: baseTask.description,
    buyerDisplayName: baseTask.buyerDisplayName,
    ...overrides,
  };
}

describe('custom task update helpers', () => {
  it('validates custom money and content-shape updates against existing values', () => {
    expect(validateCustomTaskUpdate(update({ amountCollectedDollars: 120 }), baseTask)).toEqual({
      amountCollectedDollars: 'Получено больше суммы',
    });
    expect(validateCustomTaskUpdate(update({ contentKind: 'photo' }), baseTask)).toEqual({
      durationMinMinutes: 'Для фото укажите количество фото',
      photoCountMin: 'Укажите количество фото',
    });
  });

  it('builds storage patch values and refreshes generated titles only when still generated', () => {
    const generatedTitle = inferCustomTaskTitle({
      buyerHandle: baseTask.buyerHandle,
      buyerDisplayName: baseTask.buyerDisplayName,
      contentKind: 'video',
      description: baseTask.description,
      durationMinMinutes: 5,
      durationMaxMinutes: 5,
      photoCountMin: null,
      photoCountMax: null,
    });
    const existing = { ...baseTask, title: generatedTitle };

    const patch = buildCustomTaskUpdatePatch(
      update({
        buyerHandle: '@new',
        amountDollars: 150,
        durationMinMinutes: 7,
        durationMaxMinutes: 8,
      }),
      existing,
    );

    expect(patch).toMatchObject({
      buyerHandle: '@new',
      amountCents: 15000,
      durationMinSeconds: 420,
      durationMaxSeconds: 480,
    });
    expect(patch.title).toBe(
      inferCustomTaskTitle({
        buyerHandle: '@new',
        buyerDisplayName: baseTask.buyerDisplayName,
        contentKind: 'video',
        description: baseTask.description,
        durationMinMinutes: 7,
        durationMaxMinutes: 8,
        photoCountMin: null,
        photoCountMax: null,
      }),
    );
  });

  it('preserves manual titles when custom details change', () => {
    const patch = buildCustomTaskUpdatePatch(update({ buyerHandle: '@new' }), baseTask);

    expect(patch.buyerHandle).toBe('@new');
    expect(patch.title).toBeUndefined();
  });
});
