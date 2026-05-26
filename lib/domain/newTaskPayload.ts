import type {
  ContentDestination,
  ContentProductionStatus,
  CustomContentKind,
} from '@/drizzle/schema/enums';
import { ATTACHMENT_LIMIT, IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@/lib/domain/attachmentPolicy';
import {
  composeCustomDescription,
  parseDurationRange,
  parsePhotoCountRange,
  presetCollected,
  type CustomPayStatus,
} from '@/lib/domain/customTaskInput';
import { normalizeImageMime } from '@/lib/domain/imageMime';
import { parseDollarInput } from '@/lib/domain/inputs';

export type NewTaskType = 'custom' | 'content_task';
export type NewTaskPriority = 'low' | 'medium' | 'high';

export type NewTaskUrlAttachment = {
  url: string;
  caption: string;
};

export type NewTaskFileAttachment = {
  name: string;
  size: number;
  type?: string;
};

export type NewTaskPayloadState = {
  type: NewTaskType;
  title: string;
  topicId: string;
  priority: NewTaskPriority | null;
  deadlineOn: string;
  description: string;
  contentPhotoCountText: string;
  contentDurationText: string;
  contentDestination: ContentDestination | '';
  buyerHandle: string;
  buyerDisplayName: string;
  platform: string;
  paymentModel: 'full' | 'unlock';
  amountDollars: string;
  payStatus: CustomPayStatus;
  customCollectedDollars: string;
  contentKind: CustomContentKind;
  durationText: string;
  photoCountText: string;
  briefDescription: string;
  clothingDescription: string;
  notesDescription: string;
  urlAttachments: NewTaskUrlAttachment[];
  files: NewTaskFileAttachment[];
};

export type BuiltNewTaskPayload =
  | {
      type: 'custom';
      topicId: string;
      description: string | null;
      priority: NewTaskPriority;
      deadlineOn: string;
      buyerHandle: string;
      buyerDisplayName: string | null;
      platform: string;
      contentKind: CustomContentKind;
      paymentModel: 'full' | 'unlock';
      amountDollars: number;
      amountCollectedDollars: number;
      durationMinMinutes: number | null;
      durationMaxMinutes: number | null;
      photoCountMin: number | null;
      photoCountMax: number | null;
      agreementState: 'confirmed';
    }
  | {
      type: 'content_task';
      topicId: string;
      title: string;
      description: string | null;
      durationMinMinutes: number | null;
      durationMaxMinutes: number | null;
      photoCountMin: number | null;
      photoCountMax: number | null;
      contentDestination: ContentDestination;
      contentProductionStatus: ContentProductionStatus;
      priority: NewTaskPriority;
      deadlineOn: string;
    };

export type NewTaskPayloadResult =
  | { ok: true; payload: BuiltNewTaskPayload }
  | { ok: false; errors: Record<string, string> };

export function buildNewTaskPayload(state: NewTaskPayloadState): NewTaskPayloadResult {
  const errors = validateNewTaskPayload(state);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const trimmedTitle = state.title.trim();
  const priority = state.priority ?? 'medium';

  if (state.type === 'custom') {
    const amount = parseDollarInput(state.amountDollars);
    if (!amount.ok || amount.value == null)
      return { ok: false, errors: { amountDollars: 'Укажите сумму' } };

    const duration = state.contentKind === 'video' ? parseDurationRange(state.durationText) : null;
    if (duration && !duration.ok) {
      return { ok: false, errors: { durationMinMinutes: duration.error } };
    }

    const photos =
      state.contentKind === 'photo' ? parsePhotoCountRange(state.photoCountText) : null;
    if (photos && !photos.ok) {
      return { ok: false, errors: { photoCountMin: photos.error } };
    }

    const customCollected = parseDollarInput(state.customCollectedDollars);
    const collected = presetCollected(
      state.payStatus,
      amount.value,
      state.payStatus === 'custom' && customCollected.ok ? customCollected.value : null,
    );

    return {
      ok: true,
      payload: {
        type: 'custom',
        topicId: state.topicId,
        description: composeCustomDescription(
          state.contentKind,
          state.briefDescription,
          state.clothingDescription,
          state.notesDescription,
        ),
        priority,
        deadlineOn: state.deadlineOn,
        buyerHandle: state.buyerHandle.trim(),
        buyerDisplayName: state.buyerDisplayName.trim() || null,
        platform: state.platform,
        contentKind: state.contentKind,
        paymentModel: state.paymentModel,
        amountDollars: amount.value,
        amountCollectedDollars: collected,
        durationMinMinutes: duration?.ok ? duration.min : null,
        durationMaxMinutes: duration?.ok ? duration.max : null,
        photoCountMin: photos?.ok ? photos.min : null,
        photoCountMax: photos?.ok ? photos.max : null,
        agreementState: 'confirmed',
      },
    };
  }

  const contentDuration = parseDurationRange(state.contentDurationText);
  if (!contentDuration.ok) {
    return { ok: false, errors: { contentDuration: contentDuration.error } };
  }
  const contentPhotos = state.contentPhotoCountText.trim()
    ? parsePhotoCountRange(state.contentPhotoCountText)
    : null;
  if (contentPhotos && !contentPhotos.ok) {
    return { ok: false, errors: { contentPhotoCount: contentPhotos.error } };
  }

  return {
    ok: true,
    payload: {
      type: 'content_task',
      topicId: state.topicId,
      title: trimmedTitle,
      description: state.description.trim() || null,
      durationMinMinutes: contentDuration.min,
      durationMaxMinutes: contentDuration.max,
      photoCountMin: contentPhotos?.min ?? null,
      photoCountMax: contentPhotos?.max ?? null,
      contentDestination: state.contentDestination || 'other',
      contentProductionStatus: 'planned',
      priority,
      deadlineOn: state.deadlineOn,
    },
  };
}

export function validateNewTaskPayload(state: NewTaskPayloadState): Record<string, string> {
  const errors: Record<string, string> = {};
  const trimmedTitle = state.title.trim();

  if (!trimmedTitle && state.type !== 'custom') errors.title = 'Заполните заголовок';
  if (!state.topicId) {
    errors.topicId = state.type === 'custom' ? 'Нет активной темы Customs' : 'Выберите тему';
  }
  if (!state.deadlineOn) errors.deadlineOn = 'Укажите дедлайн';

  if (state.type === 'custom') {
    validateCustomTaskFields(state, errors);
  }

  if (state.type === 'content_task') validateContentTaskFields(state, errors);

  Object.assign(errors, validateNewTaskAttachments(state.urlAttachments, state.files));
  return errors;
}

export function validateNewTaskAttachments(
  urlAttachments: NewTaskUrlAttachment[],
  files: NewTaskFileAttachment[],
): Record<string, string> {
  const nonEmptyUrls = urlAttachments.filter((item) => item.url.trim().length > 0);
  if (nonEmptyUrls.length + files.length > ATTACHMENT_LIMIT) {
    return { attachments: 'Максимум 10 вложений' };
  }

  for (const item of nonEmptyUrls) {
    if (!isHttpUrl(item.url.trim())) {
      return { attachments: 'Проверьте ссылки: нужны http(s)' };
    }
    if (item.caption.trim().length > 500) {
      return { attachments: 'Подпись к ссылке слишком длинная' };
    }
  }

  for (const file of files) {
    const mimeType = normalizeImageMime(file);
    if (!IMAGE_MIME_TYPES.has(mimeType)) {
      return { attachments: 'Поддерживаются JPEG, PNG, WebP, HEIC' };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { attachments: 'Изображение больше 20 МБ' };
    }
  }

  return {};
}

function validateCustomTaskFields(
  state: NewTaskPayloadState,
  errors: Record<string, string>,
): void {
  if (!state.buyerHandle.trim()) errors.buyerHandle = 'Укажите ник покупателя';
  if (!state.platform) errors.platform = 'Укажите платформу';

  const amount = parseDollarInput(state.amountDollars);
  if (!amount.ok) {
    errors.amountDollars = amount.error;
  } else if (amount.value == null) {
    errors.amountDollars = 'Укажите сумму';
  } else if (amount.value <= 0) {
    errors.amountDollars = 'Сумма должна быть больше 0';
  }

  if (state.payStatus === 'custom') {
    const collected = parseDollarInput(state.customCollectedDollars);
    if (!collected.ok) {
      errors.amountCollectedDollars = collected.error;
    } else if (collected.value == null) {
      errors.amountCollectedDollars = 'Укажите получено';
    } else if (collected.value < 0) {
      errors.amountCollectedDollars = 'Не может быть отрицательной';
    } else if (
      amount.ok &&
      amount.value != null &&
      amount.value > 0 &&
      collected.value > amount.value
    ) {
      errors.amountCollectedDollars = 'Получено больше суммы';
    }
  }

  if (state.contentKind === 'video') {
    const duration = parseDurationRange(state.durationText);
    if (!duration.ok) errors.durationMinMinutes = duration.error;
  } else {
    const photos = parsePhotoCountRange(state.photoCountText);
    if (!photos.ok) errors.photoCountMin = photos.error;
  }
}

function validateContentTaskFields(
  state: NewTaskPayloadState,
  errors: Record<string, string>,
): void {
  if (!state.description.trim()) errors.description = 'Заполните ТЗ';

  const duration = parseDurationRange(state.contentDurationText);
  if (!duration.ok) errors.contentDuration = duration.error;

  if (state.contentPhotoCountText.trim()) {
    const photos = parsePhotoCountRange(state.contentPhotoCountText);
    if (!photos.ok) errors.contentPhotoCount = photos.error;
  }

}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
