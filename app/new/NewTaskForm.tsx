'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  useTransition,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createTaskAction, createUrlAttachmentAction } from '@/lib/server/actions';
import { showToast } from '@/components/Toaster';
import type { NewTaskPreferences } from '@/lib/server/preferences';
import {
  ACCEPTED_IMAGE_MIMES,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  normalizeImageMime,
  useImageUpload,
} from '@/lib/client/useImageUpload';
import { parseDollarInput } from '@/lib/domain/inputs';

type TopicOption = { id: string; name: string; slug: string };
type UserOption = { id: string; displayName: string };

type Props = {
  topics: TopicOption[];
  users: UserOption[];
  currentUserId: string;
  preferences: NewTaskPreferences;
};

type TabKey = 'custom' | 'content_task';
type PriorityValue = 'low' | 'medium' | 'high';
type PayStatus = 'full' | 'half' | 'partial75' | 'custom';
type CustomContentKind = 'video' | 'photo';

type UrlAttachmentDraft = { id: string; url: string; caption: string };

const MAX_ATTACHMENTS = 10;

const TYPE_TABS: Array<{ value: TabKey; label: string }> = [
  { value: 'custom', label: 'Custom' },
  { value: 'content_task', label: 'Контент' },
];

const PRIORITY_OPTIONS: Array<{ value: PriorityValue; label: string }> = [
  { value: 'high', label: 'Высокий' },
  { value: 'medium', label: 'Средний' },
  { value: 'low', label: 'Низкий' },
];

const PAY_PRESETS: Array<{ value: PayStatus; label: string }> = [
  { value: 'full', label: '100%' },
  { value: 'half', label: '50/50' },
  { value: 'partial75', label: '75/25' },
  { value: 'custom', label: 'Своя' },
];

const CONTENT_KIND_OPTIONS: Array<{ value: CustomContentKind; label: string }> = [
  { value: 'video', label: 'Видео' },
  { value: 'photo', label: 'Фото' },
];

// Maps validation error keys to the DOM id used to scroll/focus the offending
// field. Duration min/max share a single visible input now.
const ERROR_FIELD_IDS: Record<string, string> = {
  topicId: 'topic',
  title: 'title',
  deadlineOn: 'deadline',
  buyerHandle: 'buyerHandle',
  platform: 'platformOther',
  amountDollars: 'amount',
  amountCollectedDollars: 'customCollected',
  contentKind: 'contentKind',
  durationMinMinutes: 'duration',
  durationMaxMinutes: 'duration',
  photoCountMin: 'photoCount',
  photoCountMax: 'photoCount',
  requesterId: 'requester',
  attachments: 'attachments-title',
  description: 'briefDescription',
};

const ERROR_FOCUS_ORDER = [
  'topicId',
  'title',
  'buyerHandle',
  'platform',
  'amountDollars',
  'amountCollectedDollars',
  'contentKind',
  'durationMinMinutes',
  'durationMaxMinutes',
  'photoCountMin',
  'photoCountMax',
  'requesterId',
  'deadlineOn',
  'description',
  'attachments',
];

function newUrlDraft(): UrlAttachmentDraft {
  const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return { id, url: '', caption: '' };
}

function isKnownPlatform(value: string | null | undefined): value is 'Fansly' | 'OnlyFans' {
  return value === 'Fansly' || value === 'OnlyFans';
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Accepts "5", "5 мин", "7-8", "7 - 8", "7–8", "7—8". Empty → both nulls.
// A bare integer stores min=max so display logic shows just "5 мин" (see ReadonlyPanel).
function parseDurationRange(
  text: string,
): { ok: true; min: number | null; max: number | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, min: null, max: null };
  const minuteSuffix = String.raw`\s*(?:мин\.?|минута|минуты|минут)?`;
  const range = trimmed.match(new RegExp(String.raw`^(\d+)\s*[-–—]\s*(\d+)${minuteSuffix}$`, 'i'));
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { ok: false, error: 'Укажите минуты: 5 или 7-8' };
    }
    if (min > max) return { ok: false, error: 'Минимум больше максимума' };
    return { ok: true, min, max };
  }
  const single = trimmed.match(new RegExp(String.raw`^(\d+)${minuteSuffix}$`, 'i'));
  if (single) {
    const n = Number(single[1]);
    return { ok: true, min: n, max: n };
  }
  return { ok: false, error: 'Укажите минуты: 5 или 7-8' };
}

function parsePhotoCountRange(
  text: string,
): { ok: true; min: number; max: number } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Укажите фото: 5 или 5-10' };
  const photoSuffix = String.raw`\s*(?:фото|фотки|фоток|шт\.?|штук)?`;
  const range = trimmed.match(new RegExp(String.raw`^(\d+)\s*[-–—]\s*(\d+)${photoSuffix}$`, 'i'));
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
      return { ok: false, error: 'Укажите фото: 5 или 5-10' };
    }
    if (min > max) return { ok: false, error: 'Минимум больше максимума' };
    return { ok: true, min, max };
  }
  const single = trimmed.match(new RegExp(String.raw`^(\d+)${photoSuffix}$`, 'i'));
  if (single) {
    const n = Number(single[1]);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Укажите фото: 5 или 5-10' };
    return { ok: true, min: n, max: n };
  }
  return { ok: false, error: 'Укажите фото: 5 или 5-10' };
}

// Three textareas → single description string with ТГ-style emoji section
// markers. Empty sections are omitted. Result mirrors the format the operator
// sees in the source Telegram messages.
function composeDescription(
  contentKind: CustomContentKind,
  brief: string,
  clothing: string,
  notes: string,
): string | null {
  const b = brief.trim();
  const c = clothing.trim();
  const n = notes.trim();
  const parts: string[] = [];
  if (b) parts.push(`${contentKind === 'photo' ? '📸' : '🎥'} Описание задания:\n${b}`);
  if (c) parts.push(`👗 Одежда:\n${c}`);
  if (n) parts.push(`📝 Заметки:\n${n}`);
  return parts.length === 0 ? null : parts.join('\n\n');
}

function presetCollected(
  preset: PayStatus,
  amount: number,
  customCollected: number | null,
): number {
  switch (preset) {
    case 'full':
      return amount;
    case 'half':
      return Math.floor(amount * 0.5);
    case 'partial75':
      return Math.floor(amount * 0.75);
    case 'custom':
      return Math.max(0, customCollected ?? 0);
  }
}

function payPresetSummary(
  preset: PayStatus,
  amount: number,
  collected: number,
): { text: string; warn: boolean } {
  if (preset === 'full') {
    return { text: `Полная предоплата $${amount}`, warn: false };
  }
  return {
    text: `Получено $${collected} из $${amount}`,
    warn: collected < amount,
  };
}

export function NewTaskForm({ topics, users, currentUserId, preferences }: Props) {
  const customsTopicId = topics.find((t) => t.slug === 'customs')?.id ?? topics[0]?.id ?? '';
  const contentTopicId =
    topics.find((t) => t.slug !== 'customs' && t.slug !== 'life')?.id ?? topics[0]?.id ?? '';
  // Custom-type tasks always belong to the "customs" topic — the type itself
  // already declares the category, so the sidebar hides the topic switcher
  // and we don't honour the saved preference here.
  const initialTopicId = customsTopicId;
  const preferredPlatform = preferences.custom?.platform;
  const loraUserId = users.find((u) => u.displayName === 'Лора')?.id ?? '';

  const [type, setType] = useState<TabKey>('custom');

  const defaultTopicFor = (t: TabKey): string => {
    if (t === 'custom') return customsTopicId;
    const preferred = preferences[t]?.topicId;
    if (preferred && topics.some((tp) => tp.id === preferred)) return preferred;
    return contentTopicId;
  };

  // Shared
  const [title, setTitle] = useState('');
  const [topicId, setTopicId] = useState<string>(initialTopicId);
  const [priority, setPriority] = useState<PriorityValue | null>('medium');
  const [deadlineOn, setDeadlineOn] = useState<string>('');
  // For content_task; custom uses brief/clothing/notes instead.
  const [description, setDescription] = useState('');

  // Custom — buyer
  const [buyerHandle, setBuyerHandle] = useState('');
  const [buyerDisplayName, setBuyerDisplayName] = useState('');
  const [platformChoice, setPlatformChoice] = useState<'Fansly' | 'OnlyFans' | 'Other'>(
    isKnownPlatform(preferredPlatform) ? preferredPlatform : preferredPlatform ? 'Other' : 'Fansly',
  );
  const [platformOther, setPlatformOther] = useState(
    preferredPlatform && !isKnownPlatform(preferredPlatform) ? preferredPlatform : '',
  );

  // Custom — payment
  const [paymentModel, setPaymentModel] = useState<'full' | 'unlock'>('full');
  const [amountDollars, setAmountDollars] = useState<string>('');
  const [payStatus, setPayStatus] = useState<PayStatus>('full');
  const [customCollectedDollars, setCustomCollectedDollars] = useState<string>('');

  // Custom — content format and single text metric input
  const [contentKind, setContentKind] = useState<CustomContentKind>('video');
  const [durationText, setDurationText] = useState<string>('');
  const [photoCountText, setPhotoCountText] = useState<string>('');

  // Custom — three-block description
  const [briefDescription, setBriefDescription] = useState('');
  const [clothingDescription, setClothingDescription] = useState('');
  const [notesDescription, setNotesDescription] = useState('');

  // Content
  const [requesterId, setRequesterId] = useState<string>(currentUserId);
  const [assigneeId, setAssigneeId] = useState<string>(loraUserId);

  const [urlAttachments, setUrlAttachments] = useState<UrlAttachmentDraft[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const imageUpload = useImageUpload();
  const router = useRouter();
  const isBusy = !hydrated || isPending || isUploading;

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const switchTaskType = (nextType: TabKey) => {
    if (nextType === type) return;
    setType(nextType);
    setTopicId(defaultTopicFor(nextType));
    setPriority((prev) => prev ?? 'medium');

    if (nextType === 'custom') {
      const savedPlatform = preferences.custom?.platform;
      if (isKnownPlatform(savedPlatform)) {
        setPlatformChoice(savedPlatform);
        setPlatformOther('');
      } else if (savedPlatform) {
        setPlatformChoice('Other');
        setPlatformOther(savedPlatform);
      } else {
        setPlatformChoice('Fansly');
        setPlatformOther('');
      }
    }
  };

  useEffect(() => {
    const firstErrorKey = ERROR_FOCUS_ORDER.find((key) => errors[key]) ?? Object.keys(errors)[0];
    if (!firstErrorKey) return;

    const id = ERROR_FIELD_IDS[firstErrorKey] ?? firstErrorKey;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el instanceof HTMLElement) {
        el.focus({ preventScroll: true });
      }
    });
  }, [errors]);

  const platform = platformChoice === 'Other' ? platformOther.trim() : platformChoice;
  const attachmentSlots = urlAttachments.length + files.length;
  const attachmentCount = urlAttachments.filter((item) => item.url.trim()).length + files.length;

  // Derived live preview of payment status (for the side panel summary line).
  const amountNumber = (() => {
    const parsed = parseDollarInput(amountDollars);
    return parsed.ok && parsed.value != null && parsed.value > 0 ? parsed.value : 0;
  })();
  const customCollectedNumber = (() => {
    const parsed = parseDollarInput(customCollectedDollars);
    return parsed.ok && parsed.value != null ? parsed.value : 0;
  })();
  const paySummaryDerived = (() => {
    if (amountNumber <= 0) return null;
    const collected = presetCollected(payStatus, amountNumber, customCollectedNumber);
    return payPresetSummary(payStatus, amountNumber, collected);
  })();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    const payload = buildPayload();
    if (!payload) return;

    startTransition(async () => {
      setIsUploading(true);
      try {
        const result = await createTaskAction(payload);
        if (!result.ok) {
          if (result.fieldErrors) setErrors(result.fieldErrors);
          showToast(result.error, { tone: 'error' });
          return;
        }

        try {
          await uploadAttachments(result.data.id);
        } catch {
          showToast('Задача создана, но вложения не загрузились. Добавьте их на странице задачи.', {
            tone: 'error',
          });
          router.push(`/task/${result.data.id}`);
          return;
        }

        router.push(`/?created=${result.data.id}`);
      } finally {
        setIsUploading(false);
      }
    });
  };

  const uploadAttachments = async (taskId: string) => {
    const urlDrafts = urlAttachments.filter((item) => item.url.trim().length > 0);
    for (const item of urlDrafts) {
      const res = await createUrlAttachmentAction({
        taskId,
        url: item.url.trim(),
        caption: item.caption.trim() || null,
      });
      if (!res.ok) throw new Error(res.error);
    }
    for (const file of files) await imageUpload.uploadImage({ taskId, file, caption: null });
  };

  const addUrlAttachment = () => {
    if (attachmentSlots >= MAX_ATTACHMENTS) {
      setErrors((prev) => ({ ...prev, attachments: 'Максимум 10 вложений' }));
      showToast('Максимум 10 вложений', { tone: 'error' });
      return;
    }
    setUrlAttachments((prev) => [...prev, newUrlDraft()]);
    setErrors((prev) => {
      const { attachments: _attachments, ...rest } = prev;
      return rest;
    });
  };

  const updateUrlAttachment = (id: string, patch: Partial<Omit<UrlAttachmentDraft, 'id'>>) => {
    setUrlAttachments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const removeUrlAttachment = (id: string) => {
    setUrlAttachments((prev) => prev.filter((item) => item.id !== id));
    setErrors((prev) => {
      const { attachments: _attachments, ...rest } = prev;
      return rest;
    });
  };

  const onFilesSelected = (selected: File[]) => {
    const available = Math.max(0, MAX_ATTACHMENTS - urlAttachments.length);
    if (selected.length > available) {
      setFiles(selected.slice(0, available));
      setErrors((prev) => ({ ...prev, attachments: 'Максимум 10 вложений' }));
      showToast('Максимум 10 вложений', { tone: 'error' });
      return;
    }
    setFiles(selected);
    setErrors((prev) => {
      const { attachments: _attachments, ...rest } = prev;
      return rest;
    });
  };

  const buildPayload = () => {
    const localErrors: Record<string, string> = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle && type !== 'custom') localErrors.title = 'Заполните заголовок';
    if (!topicId) {
      localErrors.topicId = type === 'custom' ? 'Нет активной темы Customs' : 'Выберите тему';
    }
    if (!deadlineOn) localErrors.deadlineOn = 'Укажите дедлайн';

    if (type === 'custom') {
      if (!buyerHandle.trim()) localErrors.buyerHandle = 'Укажите ник покупателя';
      if (!platform) localErrors.platform = 'Укажите платформу';

      const amount = parseDollarInput(amountDollars);
      if (!amount.ok) {
        localErrors.amountDollars = amount.error;
      } else if (amount.value == null) {
        localErrors.amountDollars = 'Укажите сумму';
      } else if (amount.value <= 0) {
        localErrors.amountDollars = 'Сумма должна быть больше 0';
      }

      if (payStatus === 'custom') {
        const collected = parseDollarInput(customCollectedDollars);
        if (!collected.ok) {
          localErrors.amountCollectedDollars = collected.error;
        } else if (collected.value == null) {
          localErrors.amountCollectedDollars = 'Укажите получено';
        } else if (collected.value < 0) {
          localErrors.amountCollectedDollars = 'Не может быть отрицательной';
        } else if (
          amount.ok &&
          amount.value != null &&
          amount.value > 0 &&
          collected.value > amount.value
        ) {
          localErrors.amountCollectedDollars = 'Получено больше суммы';
        }
      }

      if (contentKind === 'video') {
        const dur = parseDurationRange(durationText);
        if (!dur.ok) {
          localErrors.durationMinMinutes = dur.error;
        }
      } else {
        const photos = parsePhotoCountRange(photoCountText);
        if (!photos.ok) {
          localErrors.photoCountMin = photos.error;
        }
      }
    }

    if (type === 'content_task' && !requesterId) {
      localErrors.requesterId = 'Выберите заказчика';
    }

    const nonEmptyUrls = urlAttachments.filter((item) => item.url.trim().length > 0);
    if (nonEmptyUrls.length + files.length > MAX_ATTACHMENTS) {
      localErrors.attachments = 'Максимум 10 вложений';
    }
    for (const item of nonEmptyUrls) {
      if (!isHttpUrl(item.url.trim())) {
        localErrors.attachments = 'Проверьте ссылки: нужны http(s)';
        break;
      }
      if (item.caption.trim().length > 500) {
        localErrors.attachments = 'Подпись к ссылке слишком длинная';
        break;
      }
    }
    for (const file of files) {
      const mimeType = normalizeImageMime(file);
      if (!IMAGE_MIME_TYPES.has(mimeType)) {
        localErrors.attachments = 'Поддерживаются JPEG, PNG, WebP, HEIC';
        break;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        localErrors.attachments = 'Изображение больше 20 МБ';
        break;
      }
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return null;
    }

    if (type === 'custom') {
      const amount = parseDollarInput(amountDollars);
      if (!amount.ok || amount.value == null) return null;
      const dur = contentKind === 'video' ? parseDurationRange(durationText) : null;
      if (dur && !dur.ok) return null;
      const photos = contentKind === 'photo' ? parsePhotoCountRange(photoCountText) : null;
      if (photos && !photos.ok) return null;
      const durationMinMinutes = dur?.ok ? dur.min : null;
      const durationMaxMinutes = dur?.ok ? dur.max : null;
      const photoCountMin = photos?.ok ? photos.min : null;
      const photoCountMax = photos?.ok ? photos.max : null;
      const collected = presetCollected(
        payStatus,
        amount.value,
        payStatus === 'custom' ? customCollectedNumber : null,
      );
      const composedDescription = composeDescription(
        contentKind,
        briefDescription,
        clothingDescription,
        notesDescription,
      );
      return {
        type: 'custom' as const,
        topicId,
        title: trimmedTitle || null,
        description: composedDescription,
        priority: priority ?? 'medium',
        deadlineOn,
        buyerHandle: buyerHandle.trim(),
        buyerDisplayName: buyerDisplayName.trim() || null,
        platform,
        contentKind,
        paymentModel,
        amountDollars: amount.value,
        amountCollectedDollars: collected,
        durationMinMinutes,
        durationMaxMinutes,
        photoCountMin,
        photoCountMax,
        agreementState: 'confirmed' as const,
      };
    }
    return {
      type: 'content_task' as const,
      topicId,
      title: trimmedTitle,
      description: description.trim() || null,
      priority: priority ?? 'medium',
      deadlineOn,
      requesterId,
      assigneeId: assigneeId || null,
    };
  };

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: '1.1rem' }}>
      {/* Type selector — always visible at top, spans full width */}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Тип задачи</legend>
        <div className="segmented" role="tablist" aria-label="Тип задачи">
          {TYPE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              className="segmented-item"
              aria-selected={type === t.value}
              onClick={() => switchTaskType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>
      {type === 'custom' && errors.topicId ? (
        <p id="topic" role="alert" tabIndex={-1} className="field-error" style={{ margin: 0 }}>
          {errors.topicId}
        </p>
      ) : null}

      <div className="task-form-grid">
        {/* MAIN PANE */}
        <div className="task-form-main">
          {type === 'content_task' ? (
            <>
              {/* Title (typography-driven, no rectangle) */}
              <label htmlFor="title" className="sr-only">
                Заголовок
              </label>
              <input
                id="title"
                className="task-form-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Заголовок задачи"
                aria-invalid={errors.title ? 'true' : undefined}
                aria-describedby={errors.title ? 'title-error' : undefined}
              />
              {errors.title ? (
                <p id="title-error" role="alert" className="field-error" style={{ marginTop: 0 }}>
                  {errors.title}
                </p>
              ) : null}
            </>
          ) : null}

          {type === 'custom' ? (
            <>
              <div className="task-form-block">
                <div className="task-form-block-head">
                  <span className="icon" aria-hidden="true">
                    {contentKind === 'photo' ? '📸' : '🎥'}
                  </span>
                  <span id="briefDescription-label" className="lbl">
                    Описание задания
                  </span>
                  <span className="opt">опционально</span>
                </div>
                <textarea
                  id="briefDescription"
                  aria-labelledby="briefDescription-label"
                  className="textarea textarea-primary"
                  value={briefDescription}
                  onChange={(e) => setBriefDescription(e.target.value)}
                  maxLength={1500}
                  placeholder={
                    contentKind === 'photo'
                      ? 'Что нужно снять, ракурсы, ключевые акценты'
                      : 'Что нужно снять, сценарий, ключевые акценты'
                  }
                />
              </div>

              <div className="task-form-block">
                <div className="task-form-block-head">
                  <span className="icon" aria-hidden="true">
                    👗
                  </span>
                  <span id="clothingDescription-label" className="lbl">
                    Одежда
                  </span>
                  <span className="opt">опционально</span>
                </div>
                <textarea
                  id="clothingDescription"
                  aria-labelledby="clothingDescription-label"
                  className="textarea textarea-sm"
                  value={clothingDescription}
                  onChange={(e) => setClothingDescription(e.target.value)}
                  maxLength={800}
                  placeholder="Что надеть, аксессуары, макияж"
                />
              </div>

              <div className="task-form-block">
                <div className="task-form-block-head">
                  <span className="icon" aria-hidden="true">
                    📝
                  </span>
                  <span id="notesDescription-label" className="lbl">
                    Заметки
                  </span>
                  <span className="opt">опционально</span>
                </div>
                <textarea
                  id="notesDescription"
                  aria-labelledby="notesDescription-label"
                  className="textarea textarea-sm"
                  value={notesDescription}
                  onChange={(e) => setNotesDescription(e.target.value)}
                  maxLength={800}
                  placeholder="Доп. указания, нюансы, что важно"
                />
              </div>
            </>
          ) : (
            <div className="task-form-block">
              <div className="task-form-block-head">
                <span id="description-label" className="lbl">
                  Описание
                </span>
                <span className="opt">опционально</span>
              </div>
              <textarea
                id="description"
                aria-labelledby="description-label"
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
              />
            </div>
          )}

          {/* Attachments */}
          <section
            aria-labelledby="attachments-title"
            className="task-form-block"
            style={{ marginTop: '1.4rem' }}
          >
            <div className="task-form-block-head">
              <span className="icon" aria-hidden="true">
                📎
              </span>
              <span id="attachments-title" className="lbl" tabIndex={-1}>
                Вложения
              </span>
              <span className="opt">
                {attachmentCount}/{MAX_ATTACHMENTS}
              </span>
            </div>

            {urlAttachments.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {urlAttachments.map((item, index) => (
                  <div
                    key={item.id}
                    className="card"
                    style={{
                      display: 'grid',
                      gap: '0.5rem',
                      padding: '0.55rem 0.7rem',
                      background: 'var(--color-card)',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gap: '0.5rem',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      }}
                    >
                      <Field id={`url-attachment-${index}`} label={`URL вложения ${index + 1}`}>
                        <input
                          id={`url-attachment-${index}`}
                          className="input"
                          value={item.url}
                          onChange={(e) => updateUrlAttachment(item.id, { url: e.target.value })}
                          placeholder="https://..."
                        />
                      </Field>
                      <Field id={`url-caption-${index}`} label="Подпись">
                        <input
                          id={`url-caption-${index}`}
                          className="input"
                          value={item.caption}
                          onChange={(e) =>
                            updateUrlAttachment(item.id, { caption: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={() => removeUrlAttachment(item.id)}
                        disabled={isBusy}
                      >
                        Убрать ссылку
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {files.length > 0 ? (
              <ul
                style={{
                  display: 'grid',
                  gap: '0.4rem',
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 0.5rem',
                }}
              >
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      padding: '0.5rem 0.7rem',
                    }}
                  >
                    <span className="muted" style={{ minWidth: 0, wordBreak: 'break-word' }}>
                      {file.name}
                    </span>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))
                      }
                      disabled={isBusy}
                    >
                      Убрать
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {errors.attachments ? (
              <p
                role="alert"
                className="field-error"
                style={{ marginTop: 0, marginBottom: '0.5rem' }}
              >
                {errors.attachments}
              </p>
            ) : null}

            <div className="toolbar">
              <button
                type="button"
                className="btn"
                aria-label="Добавить ссылку"
                onClick={addUrlAttachment}
                disabled={isBusy || attachmentSlots >= MAX_ATTACHMENTS}
              >
                + Ссылка
              </button>
              <label
                htmlFor="attachments-files"
                className="btn"
                aria-label="Добавить картинки"
                aria-disabled={isBusy || attachmentSlots >= MAX_ATTACHMENTS}
              >
                + Картинки
              </label>
              <input
                id="attachments-files"
                className="sr-only"
                type="file"
                accept={ACCEPTED_IMAGE_MIMES}
                multiple
                disabled={isBusy || attachmentSlots >= MAX_ATTACHMENTS}
                onChange={(e) => onFilesSelected(Array.from(e.target.files ?? []))}
              />
            </div>
          </section>

          {/* Action row */}
          <div
            className="toolbar"
            style={{
              marginTop: '1.5rem',
              paddingTop: '1.1rem',
              borderTop: '1px solid var(--color-line)',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isBusy}
              style={{ minWidth: 160 }}
            >
              {!hydrated
                ? 'Загружаем…'
                : isBusy
                  ? 'Создаём…'
                  : type === 'content_task'
                    ? 'Создать задачу'
                    : 'Создать ТЗ'}
            </button>
            <Link href="/" className="back-link" prefetch={false}>
              Отмена
            </Link>
          </div>
        </div>

        {/* SIDEBAR */}
        <aside className="task-form-side" aria-label="Метаданные задачи">
          {/* Topic — hidden for Custom (already implied by the type tab; the
              task always lands in the "customs" topic). Shown for content
              tasks where the topic is a meaningful choice. */}
          {type !== 'custom' ? (
            <div className="task-form-side-section">
              <h4>Тема</h4>
              <Field id="topic" label="" hideLabel error={errors.topicId}>
                <select
                  id="topic"
                  className="select"
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : null}

          {type === 'custom' ? (
            <>
              {/* Custom details */}
              <div className="task-form-side-section">
                <h4>Детали</h4>
                <div className="task-form-side-stack">
                  <Field id="title" label="Заголовок" error={errors.title}>
                    <input
                      id="title"
                      className="input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={200}
                      placeholder="опционально"
                      aria-invalid={errors.title ? 'true' : undefined}
                      aria-describedby={errors.title ? 'title-error' : undefined}
                    />
                  </Field>

                  <Field id="platform" label="Платформа" error={errors.platform}>
                    <div className="segmented" role="radiogroup" aria-label="Платформа">
                      {(['Fansly', 'OnlyFans', 'Other'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          role="radio"
                          className="segmented-item"
                          aria-checked={platformChoice === p}
                          onClick={() => setPlatformChoice(p)}
                        >
                          {p === 'OnlyFans' ? 'OF' : p}
                        </button>
                      ))}
                    </div>
                    {platformChoice === 'Other' ? (
                      <input
                        id="platformOther"
                        style={{ marginTop: '0.4rem' }}
                        className="input"
                        value={platformOther}
                        onChange={(e) => setPlatformOther(e.target.value)}
                        aria-label="Своя платформа"
                        aria-invalid={errors.platform ? 'true' : undefined}
                        aria-describedby={errors.platform ? 'platform-error' : undefined}
                        placeholder="Например, X / Reddit"
                      />
                    ) : null}
                  </Field>

                  <Field id="buyerHandle" label="Ник / ссылка" required error={errors.buyerHandle}>
                    <input
                      id="buyerHandle"
                      className="input"
                      value={buyerHandle}
                      onChange={(e) => setBuyerHandle(e.target.value)}
                      placeholder="@handle или URL профиля"
                    />
                  </Field>

                  <Field id="buyerDisplayName" label="Имя">
                    <input
                      id="buyerDisplayName"
                      className="input"
                      value={buyerDisplayName}
                      onChange={(e) => setBuyerDisplayName(e.target.value)}
                      placeholder="опционально"
                    />
                  </Field>
                </div>
              </div>

              {/* Payment */}
              <div className="task-form-side-section">
                <h4>Оплата</h4>
                <div className="task-form-side-stack">
                  <div className="task-form-side-row">
                    <Field id="paymentModel" label="Модель">
                      <div className="segmented" role="radiogroup" aria-label="Модель оплаты">
                        {(['full', 'unlock'] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            role="radio"
                            className="segmented-item"
                            aria-checked={paymentModel === p}
                            onClick={() => setPaymentModel(p)}
                          >
                            {p === 'full' ? 'Full' : 'Unlock'}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field id="amount" label="Сумма, $" required error={errors.amountDollars}>
                      <input
                        id="amount"
                        className="input tabular"
                        type="text"
                        inputMode="numeric"
                        value={amountDollars}
                        onChange={(e) => setAmountDollars(e.target.value)}
                      />
                    </Field>
                  </div>

                  <div>
                    <label className="label">Статус оплаты</label>
                    <div className="pay-presets" role="radiogroup" aria-label="Статус оплаты">
                      {PAY_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          role="radio"
                          className="pay-presets-item"
                          aria-checked={payStatus === p.value}
                          onClick={() => setPayStatus(p.value)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {payStatus === 'custom' ? (
                      <Field
                        id="customCollected"
                        label="Получено, $"
                        error={errors.amountCollectedDollars}
                      >
                        <input
                          id="customCollected"
                          className="input tabular"
                          type="text"
                          inputMode="numeric"
                          value={customCollectedDollars}
                          onChange={(e) => setCustomCollectedDollars(e.target.value)}
                          style={{ marginTop: '0.4rem' }}
                        />
                      </Field>
                    ) : null}
                    {paySummaryDerived ? (
                      <p className={`pay-summary${paySummaryDerived.warn ? ' warn' : ''}`}>
                        {paySummaryDerived.text}
                      </p>
                    ) : (
                      <p className="pay-summary muted-2">Укажите сумму выше</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Timing — duration, deadline, priority */}
              <div className="task-form-side-section">
                <h4>Тайминг</h4>
                <div className="task-form-side-stack">
                  <Field id="contentKind" label="Формат">
                    <div className="segmented" role="radiogroup" aria-label="Формат кастома">
                      {CONTENT_KIND_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          className="segmented-item"
                          aria-checked={contentKind === option.value}
                          onClick={() => setContentKind(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <div className="task-form-side-row">
                    {contentKind === 'video' ? (
                      <Field
                        id="duration"
                        label="Длительность, мин"
                        error={errors.durationMinMinutes ?? errors.durationMaxMinutes}
                      >
                        <input
                          id="duration"
                          className="input tabular"
                          value={durationText}
                          onChange={(e) => setDurationText(e.target.value)}
                          placeholder="5 или 7-8"
                        />
                      </Field>
                    ) : (
                      <Field
                        id="photoCount"
                        label="Кол-во фото"
                        required
                        error={errors.photoCountMin ?? errors.photoCountMax}
                      >
                        <input
                          id="photoCount"
                          className="input tabular"
                          value={photoCountText}
                          onChange={(e) => setPhotoCountText(e.target.value)}
                          placeholder="5 или 5-10"
                        />
                      </Field>
                    )}

                    <Field id="deadline" label="Дедлайн" required error={errors.deadlineOn}>
                      <input
                        id="deadline"
                        className="input tabular"
                        type="date"
                        value={deadlineOn}
                        onChange={(e) => setDeadlineOn(e.target.value)}
                      />
                    </Field>
                  </div>

                  <Field id="priority" label="Приоритет">
                    <div className="segmented" role="radiogroup" aria-label="Приоритет">
                      {PRIORITY_OPTIONS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          role="radio"
                          className="segmented-item"
                          aria-checked={priority === p.value}
                          onClick={() => setPriority(p.value)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              </div>
            </>
          ) : null}

          {type === 'content_task' ? (
            <>
              <div className="task-form-side-section">
                <h4>Команда</h4>
                <div className="task-form-side-stack">
                  <Field id="requester" label="Заказчик" required error={errors.requesterId}>
                    <select
                      id="requester"
                      className="select"
                      value={requesterId}
                      onChange={(e) => setRequesterId(e.target.value)}
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="assignee" label="Исполнитель">
                    <select
                      id="assignee"
                      className="select"
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                    >
                      <option value="">— не указано —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="task-form-side-section">
                <h4>Тайминг</h4>
                <div className="task-form-side-stack">
                  <Field id="deadline" label="Дедлайн" required error={errors.deadlineOn}>
                    <input
                      id="deadline"
                      className="input tabular"
                      type="date"
                      value={deadlineOn}
                      onChange={(e) => setDeadlineOn(e.target.value)}
                    />
                  </Field>
                  <Field id="priority" label="Приоритет">
                    <div className="segmented" role="radiogroup" aria-label="Приоритет">
                      {PRIORITY_OPTIONS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          role="radio"
                          className="segmented-item"
                          aria-checked={priority === p.value}
                          onClick={() => setPriority(p.value)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  error,
  hideLabel,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hideLabel?: boolean;
  children: ReactNode;
}) {
  const errorId = `${id}-error`;
  const childrenWithA11y = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const props = child.props as {
      id?: string;
      role?: string;
      'aria-describedby'?: string;
      'aria-invalid'?: boolean | 'true' | 'false';
    };
    const shouldAnnotate = props.id === id || props.role === 'radiogroup';
    if (!shouldAnnotate) return child;

    return cloneElement(child as ReactElement<Record<string, unknown>>, {
      id: props.id ?? (props.role === 'radiogroup' ? id : undefined),
      'aria-invalid': error ? 'true' : undefined,
      'aria-describedby': error ? errorId : props['aria-describedby'],
    });
  });

  return (
    <div>
      {label ? (
        <label
          htmlFor={id}
          className={(hideLabel ? 'sr-only ' : '') + (required ? 'label label-required' : 'label')}
        >
          {label}
        </label>
      ) : null}
      {childrenWithA11y}
      {error ? (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
