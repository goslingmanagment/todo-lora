import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildNewTaskPayload,
  validateNewTaskAttachments,
  type NewTaskPayloadState,
} from '@/lib/domain/newTaskPayload';
import { MAX_IMAGE_BYTES } from '@/lib/domain/attachmentPolicy';

const topicId = randomUUID();
const requesterId = 'user-1';

function baseState(overrides: Partial<NewTaskPayloadState> = {}): NewTaskPayloadState {
  return {
    type: 'custom',
    title: '',
    topicId,
    priority: 'medium',
    deadlineOn: '2026-05-15',
    description: '',
    requesterId,
    assigneeId: '',
    buyerHandle: '@buyer',
    buyerDisplayName: '',
    platform: 'Fansly',
    paymentModel: 'full',
    amountDollars: '100',
    payStatus: 'full',
    customCollectedDollars: '',
    contentKind: 'video',
    durationText: '5-7',
    photoCountText: '',
    briefDescription: 'Сценарий',
    clothingDescription: '',
    notesDescription: '',
    urlAttachments: [],
    files: [],
    ...overrides,
  };
}

describe('new task payload builder', () => {
  it('builds a custom video payload with composed description and payment preset', () => {
    const result = buildNewTaskPayload(
      baseState({
        payStatus: 'half',
        clothingDescription: 'Черное платье',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      type: 'custom',
      topicId,
      priority: 'medium',
      buyerHandle: '@buyer',
      platform: 'Fansly',
      amountDollars: 100,
      amountCollectedDollars: 50,
      durationMinMinutes: 5,
      durationMaxMinutes: 7,
      photoCountMin: null,
      photoCountMax: null,
      agreementState: 'confirmed',
    });
    expect(result.payload.description).toContain('Сценарий');
    expect(result.payload.description).toContain('Черное платье');
  });

  it('builds a content task payload and trims optional fields', () => {
    const result = buildNewTaskPayload(
      baseState({
        type: 'content_task',
        title: '  Пост в Instagram  ',
        description: '  Опубликовать вечером  ',
        assigneeId: 'lora',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toEqual({
      type: 'content_task',
      topicId,
      title: 'Пост в Instagram',
      description: 'Опубликовать вечером',
      priority: 'medium',
      deadlineOn: '2026-05-15',
      requesterId,
      assigneeId: 'lora',
    });
  });

  it('returns field errors instead of a partial payload', () => {
    const result = buildNewTaskPayload(
      baseState({
        buyerHandle: '',
        amountDollars: '0',
        durationText: 'abc',
        deadlineOn: '',
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toMatchObject({
      buyerHandle: 'Укажите ник покупателя',
      amountDollars: 'Сумма должна быть больше 0',
      durationMinMinutes: 'Укажите минуты: 5 или 7-8',
      deadlineOn: 'Укажите дедлайн',
    });
  });

  it('validates URL and image attachments from the same policy constants as upload', () => {
    expect(validateNewTaskAttachments([{ url: 'javascript:alert(1)', caption: '' }], [])).toEqual({
      attachments: 'Проверьте ссылки: нужны http(s)',
    });
    expect(
      validateNewTaskAttachments(
        [],
        [{ name: 'too-big.jpg', size: MAX_IMAGE_BYTES + 1, type: 'image/jpeg' }],
      ),
    ).toEqual({
      attachments: 'Изображение больше 20 МБ',
    });
    expect(
      validateNewTaskAttachments([], [{ name: 'anim.gif', size: 1024, type: 'image/gif' }]),
    ).toEqual({
      attachments: 'Поддерживаются JPEG, PNG, WebP, HEIC',
    });
    expect(validateNewTaskAttachments([{ url: 'https://example.com', caption: '' }], [])).toEqual(
      {},
    );
  });
});
