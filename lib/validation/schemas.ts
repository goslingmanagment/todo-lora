/**
 * Shared validation schemas. Keep error messages in Russian and short.
 */
import { z } from 'zod';
import { parseCountInput, parseDollarInput, parseMinuteInput } from '@/lib/domain/inputs';
import { MAX_IMAGE_BYTES } from '@/lib/domain/limits';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Неверный формат даты' });

const nonEmptyShort = z
  .string()
  .trim()
  .min(1, { message: 'Заполните поле' })
  .max(200, { message: 'Слишком длинно' });

const optionalShort = z
  .string()
  .trim()
  .max(200, { message: 'Слишком длинно' })
  .optional()
  .nullable();

const optionalText = z
  .string()
  .trim()
  .max(4000, { message: 'Слишком длинно' })
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const priority = z.enum(['low', 'medium', 'high']);
const taskStatus = z.enum(['draft', 'in_progress', 'done', 'delivered', 'cancelled']);
const paymentModel = z.enum(['full', 'unlock']);
const customContentKind = z.enum(['video', 'photo']);
const agreementState = z.enum(['pending', 'confirmed', 'rejected']);
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const stagingKeyPattern = new RegExp(
  `^staging/${uuidPattern}/${uuidPattern}(?:\\.[a-z0-9]{1,8})?$`,
  'i',
);

function integerField(parser: (value: unknown) => ReturnType<typeof parseDollarInput>) {
  return z.union([z.number(), z.string()]).transform((v, ctx) => {
    const parsed = parser(v);
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', message: parsed.error });
      return z.NEVER;
    }
    return parsed.value;
  });
}

const integerDollars = integerField(parseDollarInput);
const integerMinutes = integerField(parseMinuteInput);
const integerCount = integerField(parseCountInput);

export const createCustomSchema = z
  .object({
    type: z.literal('custom'),
    topicId: z.uuid({ message: 'Выберите тему' }),
    title: optionalShort,
    description: optionalText,
    priority: priority,
    deadlineOn: isoDate,
    buyerHandle: nonEmptyShort,
    buyerDisplayName: optionalText,
    platform: nonEmptyShort,
    contentKind: customContentKind.default('video'),
    paymentModel: paymentModel,
    amountDollars: integerDollars.refine((v): v is number => v != null && v > 0, {
      message: 'Сумма должна быть больше 0',
    }),
    amountCollectedDollars: integerDollars.optional().nullable(),
    durationMinMinutes: integerMinutes.optional().nullable(),
    durationMaxMinutes: integerMinutes.optional().nullable(),
    photoCountMin: integerCount.optional().nullable(),
    photoCountMax: integerCount.optional().nullable(),
    agreementState: agreementState.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const collected = data.amountCollectedDollars ?? 0;
    if (collected < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountCollectedDollars'],
        message: 'Не может быть отрицательной',
      });
    }
    if (collected > data.amountDollars) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountCollectedDollars'],
        message: 'Получено больше суммы',
      });
    }
    const durationMin = data.durationMinMinutes;
    const durationMax = data.durationMaxMinutes;
    if (durationMin != null && durationMax != null && durationMin > durationMax) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMaxMinutes'],
        message: 'Максимум должен быть ≥ минимума',
      });
    }
    if (durationMin != null && durationMin < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMinMinutes'],
        message: 'Не может быть отрицательной',
      });
    }
    if (durationMax != null && durationMax < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMaxMinutes'],
        message: 'Не может быть отрицательной',
      });
    }

    const photoMin = data.photoCountMin;
    const photoMax = data.photoCountMax;
    if (data.contentKind === 'video') {
      if (photoMin != null || photoMax != null) {
        ctx.addIssue({
          code: 'custom',
          path: ['photoCountMin'],
          message: 'Для видео укажите длительность',
        });
      }
    } else {
      if (durationMin != null || durationMax != null) {
        ctx.addIssue({
          code: 'custom',
          path: ['durationMinMinutes'],
          message: 'Для фото укажите количество фото',
        });
      }
      if (photoMin == null || photoMax == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['photoCountMin'],
          message: 'Укажите количество фото',
        });
      }
      if (photoMin != null && photoMin <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['photoCountMin'],
          message: 'Должно быть больше 0',
        });
      }
      if (photoMax != null && photoMax <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['photoCountMax'],
          message: 'Должно быть больше 0',
        });
      }
      if (photoMin != null && photoMax != null && photoMin > photoMax) {
        ctx.addIssue({
          code: 'custom',
          path: ['photoCountMax'],
          message: 'Максимум должен быть ≥ минимума',
        });
      }
    }
  });

export type CreateCustomInput = z.input<typeof createCustomSchema>;
export type CreateCustomOutput = z.output<typeof createCustomSchema>;

export const createContentSchema = z.object({
  type: z.literal('content_task'),
  topicId: z.uuid({ message: 'Выберите тему' }),
  title: nonEmptyShort,
  description: optionalText,
  priority: priority,
  deadlineOn: isoDate,
  requesterId: z.string().min(1, { message: 'Выберите заказчика' }),
  assigneeId: z.string().optional().nullable(),
});

export type CreateContentInput = z.input<typeof createContentSchema>;
export type CreateContentOutput = z.output<typeof createContentSchema>;

export const createTaskSchema = z.discriminatedUnion('type', [
  createCustomSchema,
  createContentSchema,
]);
export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type CreateTaskOutput = z.output<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    id: z.uuid(),
    expectedVersion: z.number().int().nonnegative({ message: 'expectedVersion обязателен' }),
    title: nonEmptyShort.optional(),
    description: optionalText,
    priority: priority.optional().nullable(),
    deadlineOn: isoDate.optional().nullable(),
    topicId: z.uuid().optional(),
    buyerHandle: z.string().trim().min(1).optional(),
    buyerDisplayName: optionalText,
    platform: z.string().trim().min(1).optional(),
    contentKind: customContentKind.optional(),
    paymentModel: paymentModel.optional(),
    amountDollars: integerDollars.optional().nullable(),
    amountCollectedDollars: integerDollars.optional().nullable(),
    durationMinMinutes: integerMinutes.optional().nullable(),
    durationMaxMinutes: integerMinutes.optional().nullable(),
    photoCountMin: integerCount.optional().nullable(),
    photoCountMax: integerCount.optional().nullable(),
    agreementState: agreementState.optional().nullable(),
    requesterId: z.string().optional().nullable(),
    assigneeId: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.amountDollars != null && data.amountDollars < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountDollars'],
        message: 'Не может быть отрицательной',
      });
    }
    if (data.amountCollectedDollars != null && data.amountCollectedDollars < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountCollectedDollars'],
        message: 'Не может быть отрицательной',
      });
    }
    if (
      data.amountDollars != null &&
      data.amountCollectedDollars != null &&
      data.amountCollectedDollars > data.amountDollars
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountCollectedDollars'],
        message: 'Получено больше суммы',
      });
    }
    if (
      data.durationMinMinutes != null &&
      data.durationMaxMinutes != null &&
      data.durationMinMinutes > data.durationMaxMinutes
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMaxMinutes'],
        message: 'Максимум должен быть ≥ минимума',
      });
    }
    if (data.durationMinMinutes != null && data.durationMinMinutes < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMinMinutes'],
        message: 'Не может быть отрицательной',
      });
    }
    if (data.durationMaxMinutes != null && data.durationMaxMinutes < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMaxMinutes'],
        message: 'Не может быть отрицательной',
      });
    }
    if (data.photoCountMin != null && data.photoCountMin <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['photoCountMin'],
        message: 'Должно быть больше 0',
      });
    }
    if (data.photoCountMax != null && data.photoCountMax <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['photoCountMax'],
        message: 'Должно быть больше 0',
      });
    }
    if (
      data.photoCountMin != null &&
      data.photoCountMax != null &&
      data.photoCountMin > data.photoCountMax
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['photoCountMax'],
        message: 'Максимум должен быть ≥ минимума',
      });
    }
    if (
      data.contentKind === 'video' &&
      (data.photoCountMin != null || data.photoCountMax != null)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['photoCountMin'],
        message: 'Для видео укажите длительность',
      });
    }
    if (
      data.contentKind === 'photo' &&
      (data.durationMinMinutes != null || data.durationMaxMinutes != null)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMinMinutes'],
        message: 'Для фото укажите количество фото',
      });
    }
  });
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type UpdateTaskOutput = z.output<typeof updateTaskSchema>;

export const changeStatusSchema = z.object({
  id: z.uuid(),
  newStatus: taskStatus,
  expectedVersion: z.number().int().nonnegative({ message: 'expectedVersion обязателен' }),
});
export type ChangeStatusInput = z.input<typeof changeStatusSchema>;

export const setAgreementSchema = z.object({
  id: z.uuid(),
  agreementState: agreementState,
  expectedVersion: z.number().int().nonnegative({ message: 'expectedVersion обязателен' }),
});
export type SetAgreementInput = z.input<typeof setAgreementSchema>;

export const deleteTaskSchema = z.object({
  id: z.uuid(),
  expectedVersion: z.number().int().nonnegative({ message: 'expectedVersion обязателен' }),
});
export type DeleteTaskInput = z.input<typeof deleteTaskSchema>;

export const recentEventsSchema = z.union([
  z.uuid().transform((taskId) => ({ taskId, limit: 20 })),
  z.object({
    taskId: z.uuid(),
    limit: z.number().int().min(1).max(50).optional().default(20),
  }),
]);
export type RecentEventsInput = z.input<typeof recentEventsSchema>;

export const urlAttachmentSchema = z.object({
  taskId: z.uuid(),
  url: z
    .string()
    .trim()
    .min(1, { message: 'Укажите ссылку' })
    .refine(isHttpUrl, { message: 'Только http(s) ссылки' }),
  caption: z.string().trim().max(500).optional().nullable(),
});
export type UrlAttachmentInput = z.input<typeof urlAttachmentSchema>;

export const imageUploadIntentSchema = z.object({
  taskId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_IMAGE_BYTES, {
      message: 'Изображение больше 20 МБ',
    }),
});
export type ImageUploadIntent = z.infer<typeof imageUploadIntentSchema>;

export const finalizeImageSchema = z
  .object({
    taskId: z.uuid(),
    stagingKey: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(stagingKeyPattern, { message: 'Некорректный staging key' }),
    filename: z.string().trim().min(1).max(255),
    caption: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.stagingKey.toLowerCase().startsWith(`staging/${data.taskId.toLowerCase()}/`)) {
      ctx.addIssue({
        code: 'custom',
        path: ['stagingKey'],
        message: 'Некорректный staging key',
      });
    }
  });
export type FinalizeImageInput = z.infer<typeof finalizeImageSchema>;

export const deleteAttachmentSchema = z.object({ id: z.uuid() });

export const filterSchema = z.enum(['all', 'overdue', 'today', 'week']);
export type FilterValue = z.infer<typeof filterSchema>;

export const viewSchema = z.enum(['grid', 'kanban', 'sidebar', 'cockpit', 'calendar']);
export type ViewValue = z.infer<typeof viewSchema>;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const loginCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, { message: 'Слишком короткий код' })
    .max(64, { message: 'Слишком длинный код' }),
});
