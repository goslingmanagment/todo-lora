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
import {
  createTaskAction,
  createUrlAttachmentAction,
} from '@/lib/server/actions';
import { showToast } from '@/components/Toaster';
import type { NewTaskPreferences } from '@/lib/server/preferences';
import {
  ACCEPTED_IMAGE_MIMES,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  normalizeImageMime,
  useImageUpload,
} from '@/lib/client/useImageUpload';
import { parseDollarInput, parseMinuteInput } from '@/lib/domain/inputs';

type TopicOption = { id: string; name: string; slug: string };
type UserOption = { id: string; displayName: string };

type Props = {
  topics: TopicOption[];
  users: UserOption[];
  currentUserId: string;
  preferences: NewTaskPreferences;
};

type TabKey = 'custom' | 'content_task' | 'note';
type PriorityValue = 'low' | 'medium' | 'high';

type UrlAttachmentDraft = { id: string; url: string; caption: string };

const MAX_ATTACHMENTS = 10;

const TYPE_TABS: Array<{ value: TabKey; label: string }> = [
  { value: 'custom', label: 'Custom' },
  { value: 'content_task', label: 'Контент' },
  { value: 'note', label: 'Заметка' },
];

const PRIORITY_OPTIONS: Array<{ value: PriorityValue; label: string }> = [
  { value: 'high', label: 'Высокий' },
  { value: 'medium', label: 'Средний' },
  { value: 'low', label: 'Низкий' },
];

const ERROR_FIELD_IDS: Record<string, string> = {
  topicId: 'topic',
  title: 'title',
  deadlineOn: 'deadline',
  buyerHandle: 'buyerHandle',
  platform: 'platform',
  amountDollars: 'amount',
  amountCollectedDollars: 'collected',
  durationMinMinutes: 'durMin',
  durationMaxMinutes: 'durMax',
  requesterId: 'requester',
  attachments: 'attachments-title',
};

const ERROR_FOCUS_ORDER = [
  'topicId',
  'title',
  'buyerHandle',
  'platform',
  'amountDollars',
  'amountCollectedDollars',
  'durationMinMinutes',
  'durationMaxMinutes',
  'requesterId',
  'deadlineOn',
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

export function NewTaskForm({ topics, users, currentUserId, preferences }: Props) {
  const customsTopicId = topics.find((t) => t.slug === 'customs')?.id ?? topics[0]?.id ?? '';
  const lifeTopicId = topics.find((t) => t.slug === 'life')?.id ?? topics[0]?.id ?? '';
  const contentTopicId =
    topics.find((t) => t.slug !== 'customs' && t.slug !== 'life')?.id ?? topics[0]?.id ?? '';
  const preferredCustomTopic = preferences.custom?.topicId;
  const initialTopicId =
    preferredCustomTopic && topics.some((t) => t.id === preferredCustomTopic)
      ? preferredCustomTopic
      : customsTopicId;
  const preferredPlatform = preferences.custom?.platform;
  const loraUserId = users.find((u) => u.displayName === 'Лора')?.id ?? '';
  const [type, setType] = useState<TabKey>('custom');

  // Default topic per task type. Notes specifically default to "life" when no
  // per-user preference exists, so an operator switching to the Note tab does
  // not silently file the note under whatever Custom topic was last used.
  const defaultTopicFor = (t: TabKey): string => {
    const preferred = preferences[t]?.topicId;
    if (preferred && topics.some((tp) => tp.id === preferred)) return preferred;
    if (t === 'custom') return customsTopicId;
    if (t === 'note') return lifeTopicId;
    return contentTopicId;
  };

  // Common
  const [title, setTitle] = useState('');
  const [topicId, setTopicId] = useState<string>(initialTopicId);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<PriorityValue | null>('medium');
  const [deadlineOn, setDeadlineOn] = useState<string>('');

  // Custom
  const [buyerHandle, setBuyerHandle] = useState('');
  const [buyerDisplayName, setBuyerDisplayName] = useState('');
  const [platformChoice, setPlatformChoice] = useState<'Fansly' | 'OnlyFans' | 'Other'>(
    isKnownPlatform(preferredPlatform) ? preferredPlatform : preferredPlatform ? 'Other' : 'Fansly',
  );
  const [platformOther, setPlatformOther] = useState(
    preferredPlatform && !isKnownPlatform(preferredPlatform) ? preferredPlatform : '',
  );
  const [paymentModel, setPaymentModel] = useState<'full' | 'unlock'>('full');
  const [amountDollars, setAmountDollars] = useState<string>('');
  const [amountCollectedDollars, setAmountCollectedDollars] = useState<string>('0');
  const [durationMin, setDurationMin] = useState<string>('');
  const [durationMax, setDurationMax] = useState<string>('');
  const [agreementState, setAgreementState] = useState<'pending' | 'confirmed' | 'rejected'>('pending');

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
    setPriority((prev) => (nextType === 'note' ? null : prev ?? 'medium'));

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
    const firstErrorKey =
      ERROR_FOCUS_ORDER.find((key) => errors[key]) ?? Object.keys(errors)[0];
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
    if (!title.trim()) localErrors.title = 'Заполните заголовок';
    if (!topicId) localErrors.topicId = 'Выберите тему';
    if (type !== 'note' && !deadlineOn) localErrors.deadlineOn = 'Укажите дедлайн';
    if (type === 'custom') {
      if (!buyerHandle.trim()) localErrors.buyerHandle = 'Укажите ник покупателя';
      if (!platform) localErrors.platform = 'Укажите платформу';
      const amount = parseDollarInput(amountDollars);
      if (amount.ok && amount.value == null) localErrors.amountDollars = 'Укажите сумму';
      if (!amount.ok) {
        localErrors.amountDollars = amount.error;
      } else if (amount.value != null && amount.value <= 0) {
        localErrors.amountDollars = 'Сумма должна быть больше 0';
      }
      // Pre-validate collected ≤ total here so the operator sees the error
      // inline before the server round-trip. The server validates again.
      const collected = parseDollarInput(amountCollectedDollars);
      if (amountCollectedDollars.trim() !== '') {
        if (!collected.ok) {
          localErrors.amountCollectedDollars = collected.error;
        } else if (collected.value != null && collected.value < 0) {
          localErrors.amountCollectedDollars = 'Не может быть отрицательной';
        } else if (
          amount.ok &&
          amount.value != null &&
          amount.value > 0 &&
          collected.value != null &&
          collected.value > amount.value
        ) {
          localErrors.amountCollectedDollars = 'Получено больше суммы';
        }
      }
      // Pre-validate duration min/max ordering for the same reason.
      const min = parseMinuteInput(durationMin);
      const max = parseMinuteInput(durationMax);
      if (!min.ok) localErrors.durationMinMinutes = min.error;
      if (!max.ok) localErrors.durationMaxMinutes = max.error;
      if (durationMin.trim() !== '' && durationMax.trim() !== '') {
        if (min.ok && max.ok && min.value != null && max.value != null && min.value > max.value) {
          localErrors.durationMaxMinutes = 'Максимум должен быть ≥ минимума';
        }
      }
    }
    if (type === 'content_task' && !requesterId) localErrors.requesterId = 'Выберите заказчика';

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
      const collected = parseDollarInput(amountCollectedDollars);
      const min = parseMinuteInput(durationMin);
      const max = parseMinuteInput(durationMax);
      if (!amount.ok || amount.value == null || !collected.ok || !min.ok || !max.ok) return null;
      return {
        type: 'custom' as const,
        topicId,
        title: title.trim(),
        description: description.trim() || null,
        priority: priority ?? 'medium',
        deadlineOn,
        buyerHandle: buyerHandle.trim(),
        buyerDisplayName: buyerDisplayName.trim() || null,
        platform,
        paymentModel,
        amountDollars: amount.value,
        amountCollectedDollars: collected.value ?? 0,
        durationMinMinutes: min.value,
        durationMaxMinutes: max.value,
        agreementState,
      };
    }
    if (type === 'content_task') {
      return {
        type: 'content_task' as const,
        topicId,
        title: title.trim(),
        description: description.trim() || null,
        priority: priority ?? 'medium',
        deadlineOn,
        requesterId,
        assigneeId: assigneeId || null,
      };
    }
    return {
      type: 'note' as const,
      topicId,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      deadlineOn: deadlineOn || null,
    };
  };

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: '1.25rem' }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.45rem' }}>
        <legend className="eyebrow" style={{ padding: 0, marginBottom: '0.1rem' }}>
          Тип
        </legend>
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

      <Field id="topic" label="Тема" required error={errors.topicId}>
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

      <Field id="title" label="Заголовок" required error={errors.title}>
        <input
          id="title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </Field>

      {type === 'custom' ? (
        <section
          className="panel"
          aria-labelledby="custom-section-heading"
          style={{ display: 'grid', gap: '1rem' }}
        >
          <h2 id="custom-section-heading" className="eyebrow" style={{ margin: 0 }}>
            Деньги и покупатель
          </h2>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Field id="buyerHandle" label="Ник покупателя" required error={errors.buyerHandle}>
              <input
                id="buyerHandle"
                className="input"
                value={buyerHandle}
                onChange={(e) => setBuyerHandle(e.target.value)}
                placeholder="@handle"
              />
            </Field>
            <Field id="buyerDisplayName" label="Имя">
              <input
                id="buyerDisplayName"
                className="input"
                value={buyerDisplayName}
                onChange={(e) => setBuyerDisplayName(e.target.value)}
              />
            </Field>
          </div>

          <Field id="platform" label="Платформа" required error={errors.platform}>
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
                  {p}
                </button>
              ))}
            </div>
            {platformChoice === 'Other' ? (
              <input
                style={{ marginTop: '0.5rem' }}
                className="input"
                value={platformOther}
                onChange={(e) => setPlatformOther(e.target.value)}
                placeholder="Например, X / Reddit"
              />
            ) : null}
          </Field>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Field id="paymentModel" label="Модель оплаты" required>
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
            <Field id="agreement" label="Договорённость">
              <select
                id="agreement"
                className="select"
                value={agreementState}
                onChange={(e) => setAgreementState(e.target.value as 'pending' | 'confirmed' | 'rejected')}
              >
                <option value="pending">ожидает</option>
                <option value="confirmed">подтверждено</option>
                <option value="rejected">отклонено</option>
              </select>
            </Field>
          </div>

          <div className="form-grid-2" style={{ gap: '1rem' }}>
            <Field id="amount" label="Сумма, $" required error={errors.amountDollars}>
              <input
                id="amount"
                className="input tabular"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
              />
            </Field>
            <Field id="collected" label="Получено, $" error={errors.amountCollectedDollars}>
              <input
                id="collected"
                className="input tabular"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={amountCollectedDollars}
                onChange={(e) => setAmountCollectedDollars(e.target.value)}
              />
            </Field>
          </div>

          <div className="form-grid-2" style={{ gap: '1rem' }}>
            <Field id="durMin" label="Длительность min, мин" error={errors.durationMinMinutes}>
              <input
                id="durMin"
                className="input tabular"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
              />
            </Field>
            <Field id="durMax" label="Длительность max, мин" error={errors.durationMaxMinutes}>
              <input
                id="durMax"
                className="input tabular"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={durationMax}
                onChange={(e) => setDurationMax(e.target.value)}
              />
            </Field>
          </div>
        </section>
      ) : null}

      {type === 'content_task' ? (
        <section
          className="panel"
          aria-labelledby="content-section-heading"
          style={{ display: 'grid', gap: '1rem' }}
        >
          <h2 id="content-section-heading" className="eyebrow" style={{ margin: 0 }}>
            Команда
          </h2>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
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
        </section>
      ) : null}

      <Field id="priority" label="Приоритет" required={type !== 'note'}>
        <div className="segmented" role="radiogroup" aria-label="Приоритет">
          {(type === 'note'
            ? [{ value: null, label: 'Без приоритета' }, ...PRIORITY_OPTIONS]
            : PRIORITY_OPTIONS
          ).map((p) => (
            <button
              key={p.value ?? 'none'}
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

      <Field id="deadline" label="Дедлайн" required={type !== 'note'} error={errors.deadlineOn}>
        <input
          id="deadline"
          className="input tabular"
          type="date"
          value={deadlineOn}
          onChange={(e) => setDeadlineOn(e.target.value)}
          style={{ maxWidth: '13rem' }}
        />
      </Field>

      <Field id="description" label="Описание">
        <textarea
          id="description"
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
        />
      </Field>

      <section
        aria-labelledby="attachments-title"
        className="panel-soft"
        style={{ display: 'grid', gap: '0.75rem' }}
      >
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'grid', gap: '0.2rem' }}>
            <h2 id="attachments-title" className="eyebrow" tabIndex={-1} style={{ margin: 0 }}>
              Вложения
            </h2>
            <p className="muted-2" style={{ fontSize: '0.78rem', margin: 0 }}>
              До 10 ссылок или картинок.
            </p>
          </div>
          <span className="chip chip-gray tabular">
            {attachmentCount}/{MAX_ATTACHMENTS}
          </span>
        </div>

        {urlAttachments.length > 0 ? (
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {urlAttachments.map((item, index) => (
              <div
                key={item.id}
                className="card"
                style={{
                  display: 'grid',
                  gap: '0.55rem',
                  padding: '0.65rem 0.75rem',
                  background: 'var(--color-card)',
                }}
              >
                <div style={{ display: 'grid', gap: '0.55rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
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
                      onChange={(e) => updateUrlAttachment(item.id, { caption: e.target.value })}
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
          <ul style={{ display: 'grid', gap: '0.45rem', listStyle: 'none', padding: 0, margin: 0 }}>
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${index}`}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.6rem 0.75rem',
                }}
              >
                <span className="muted" style={{ minWidth: 0, wordBreak: 'break-word' }}>
                  {file.name}
                </span>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
                  disabled={isBusy}
                >
                  Убрать
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {errors.attachments ? (
          <p role="alert" className="field-error" style={{ marginTop: 0 }}>
            {errors.attachments}
          </p>
        ) : null}

        <div className="toolbar">
          <button
            type="button"
            className="btn"
            onClick={addUrlAttachment}
            disabled={isBusy || attachmentSlots >= MAX_ATTACHMENTS}
          >
            Добавить ссылку
          </button>
          <label
            htmlFor="attachments-files"
            className="btn"
            aria-disabled={isBusy || attachmentSlots >= MAX_ATTACHMENTS}
          >
            Выбрать картинки
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

      <div
        className="toolbar"
        style={{ marginTop: '0.25rem', alignItems: 'center', gap: '1rem' }}
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
            : type === 'note'
              ? 'Создать заметку'
              : type === 'content_task'
                ? 'Создать задачу'
                : 'Создать ТЗ'}
        </button>
        <Link href="/" className="back-link" prefetch={false}>
          Отмена
        </Link>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
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
      <label htmlFor={id} className={required ? 'label label-required' : 'label'}>
        {label}
      </label>
      {childrenWithA11y}
      {error ? (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
