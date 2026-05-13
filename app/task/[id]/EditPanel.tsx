'use client';

import { useState } from 'react';
import type { useTransition } from 'react';
import { updateTaskAction } from '@/lib/server/actions';
import { showToast } from '@/components/Toaster';
import type { CustomContentKind, PaymentModel, TaskPriority } from '@/drizzle/schema/enums';
import { parseCountInput, parseDollarInput, parseMinuteInput } from '@/lib/domain/inputs';
import { FieldError } from './_primitives';
import type { TaskDto, Topic, UserOption } from './_types';

export function EditPanel({
  task,
  allTopics,
  users,
  activeUsers,
  onCancel,
  onSaved,
  onStale,
  isPending,
  startTransition,
}: {
  task: TaskDto;
  allTopics: Topic[];
  users: UserOption[];
  activeUsers: UserOption[];
  onCancel: () => void;
  onSaved: () => void;
  onStale: () => void;
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [topicId, setTopicId] = useState(task.topicId);
  const [priority, setPriority] = useState<TaskPriority | null>(task.priority);
  const [deadlineOn, setDeadlineOn] = useState(task.deadlineOn ?? '');

  // custom-only
  const [buyerHandle, setBuyerHandle] = useState(task.buyerHandle ?? '');
  const [buyerDisplayName, setBuyerDisplayName] = useState(task.buyerDisplayName ?? '');
  const [platform, setPlatform] = useState(task.platform ?? '');
  const [contentKind, setContentKind] = useState<CustomContentKind>(
    task.contentKind ??
      (task.photoCountMin != null || task.photoCountMax != null ? 'photo' : 'video'),
  );
  const [paymentModel, setPaymentModel] = useState<PaymentModel>(task.paymentModel ?? 'full');
  const [amountDollars, setAmountDollars] = useState(
    task.amountCents != null ? String(Math.round(task.amountCents / 100)) : '',
  );
  const [amountCollectedDollars, setAmountCollectedDollars] = useState(
    task.amountCollectedCents != null ? String(Math.round(task.amountCollectedCents / 100)) : '0',
  );
  const [durationMin, setDurationMin] = useState(
    task.durationMinSeconds != null ? String(Math.round(task.durationMinSeconds / 60)) : '',
  );
  const [durationMax, setDurationMax] = useState(
    task.durationMaxSeconds != null ? String(Math.round(task.durationMaxSeconds / 60)) : '',
  );
  const [photoCountMin, setPhotoCountMin] = useState(
    task.photoCountMin != null ? String(task.photoCountMin) : '',
  );
  const [photoCountMax, setPhotoCountMax] = useState(
    task.photoCountMax != null ? String(task.photoCountMax) : '',
  );

  const [requesterId, setRequesterId] = useState(task.requesterId ?? '');
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const patch: Record<string, unknown> = {
      id: task.id,
      expectedVersion: task.version,
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      topicId,
      priority,
      deadlineOn: deadlineOn || null,
    };
    if (task.type === 'custom') {
      const amount = parseDollarInput(amountDollars);
      const collected = parseDollarInput(amountCollectedDollars);
      const localErrors: Record<string, string> = {};
      if (!amount.ok) localErrors.amountDollars = amount.error;
      if (!collected.ok) localErrors.amountCollectedDollars = collected.error;

      let durationMinValue: number | null = null;
      let durationMaxValue: number | null = null;
      let photoCountMinValue: number | null = null;
      let photoCountMaxValue: number | null = null;

      if (contentKind === 'video') {
        const min = parseMinuteInput(durationMin);
        const max = parseMinuteInput(durationMax);
        if (!min.ok) localErrors.durationMinMinutes = min.error;
        if (!max.ok) localErrors.durationMaxMinutes = max.error;
        if (min.ok) durationMinValue = min.value;
        if (max.ok) durationMaxValue = max.value;
      } else {
        const min = parseCountInput(photoCountMin);
        const max = parseCountInput(photoCountMax);
        if (!min.ok) {
          localErrors.photoCountMin = min.error;
        } else if (min.value == null) {
          localErrors.photoCountMin = 'Укажите количество фото';
        }
        if (!max.ok) localErrors.photoCountMax = max.error;
        if (min.ok && min.value != null) photoCountMinValue = min.value;
        if (max.ok) photoCountMaxValue = max.value ?? photoCountMinValue;
      }

      if (Object.keys(localErrors).length > 0) {
        setErrors(localErrors);
        return;
      }
      if (!amount.ok || !collected.ok) return;
      Object.assign(patch, {
        buyerHandle: buyerHandle.trim(),
        buyerDisplayName: buyerDisplayName.trim() || null,
        platform: platform.trim(),
        contentKind,
        paymentModel,
        amountDollars: amount.value,
        amountCollectedDollars: collected.value,
        durationMinMinutes: durationMinValue,
        durationMaxMinutes: durationMaxValue,
        photoCountMin: photoCountMinValue,
        photoCountMax: photoCountMaxValue,
      });
    }
    if (task.type === 'content_task') {
      Object.assign(patch, {
        requesterId: requesterId || null,
        assigneeId: assigneeId || null,
      });
    }
    startTransition(async () => {
      const res = await updateTaskAction(patch);
      if (res.ok) {
        showToast('Сохранено');
        onSaved();
      } else if (res.code === 'stale') {
        // Concurrent edit landed between load and save. Refetch fresh task
        // state so the user can decide what to keep, but keep the form open
        // with their unsaved changes intact (per brief P0.1 acceptance).
        showToast('Задачу только что изменили. Обновляем…', { tone: 'error' });
        onStale();
      } else {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        showToast(res.error, { tone: 'error' });
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="panel" style={{ display: 'grid', gap: '0.95rem' }}>
      <h2 className="eyebrow" style={{ margin: 0 }}>
        Редактировать
      </h2>

      <div>
        <label htmlFor="ed-title" className="label label-required">
          Заголовок
        </label>
        <input
          id="ed-title"
          className="input"
          aria-invalid={errors.title ? 'true' : undefined}
          aria-describedby={errors.title ? 'ed-title-error' : undefined}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
        <FieldError id="ed-title-error" error={errors.title} />
      </div>

      <div>
        <label htmlFor="ed-topic" className="label">
          Тема
        </label>
        <select
          id="ed-topic"
          className="select"
          aria-invalid={errors.topicId ? 'true' : undefined}
          aria-describedby={errors.topicId ? 'ed-topic-error' : undefined}
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
        >
          {allTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <FieldError id="ed-topic-error" error={errors.topicId} />
      </div>

      <div className="form-grid-2" style={{ gap: '0.85rem' }}>
        <div>
          <label htmlFor="ed-priority" className="label">
            Приоритет
          </label>
          <select
            id="ed-priority"
            className="select"
            value={priority ?? ''}
            onChange={(e) => setPriority((e.target.value || null) as TaskPriority | null)}
          >
            <option value="">— не указан —</option>
            <option value="high">Высокий</option>
            <option value="medium">Средний</option>
            <option value="low">Низкий</option>
          </select>
        </div>
        <div>
          <label htmlFor="ed-deadline" className="label">
            Дедлайн
          </label>
          <input
            id="ed-deadline"
            className="input tabular"
            type="date"
            aria-invalid={errors.deadlineOn ? 'true' : undefined}
            aria-describedby={errors.deadlineOn ? 'ed-deadline-error' : undefined}
            value={deadlineOn}
            onChange={(e) => setDeadlineOn(e.target.value)}
          />
          <FieldError id="ed-deadline-error" error={errors.deadlineOn} />
        </div>
      </div>

      {task.type === 'custom' ? (
        <>
          <div className="form-grid-2" style={{ gap: '0.85rem' }}>
            <div>
              <label htmlFor="ed-buyer" className="label">
                Покупатель
              </label>
              <input
                id="ed-buyer"
                className="input"
                aria-invalid={errors.buyerHandle ? 'true' : undefined}
                aria-describedby={errors.buyerHandle ? 'ed-buyer-error' : undefined}
                value={buyerHandle}
                onChange={(e) => setBuyerHandle(e.target.value)}
              />
              <FieldError id="ed-buyer-error" error={errors.buyerHandle} />
            </div>
            <div>
              <label htmlFor="ed-buyerName" className="label">
                Имя покупателя
              </label>
              <input
                id="ed-buyerName"
                className="input"
                value={buyerDisplayName}
                onChange={(e) => setBuyerDisplayName(e.target.value)}
              />
            </div>
          </div>
          <div className="form-grid-2" style={{ gap: '0.85rem' }}>
            <div>
              <label htmlFor="ed-platform" className="label">
                Платформа
              </label>
              <input
                id="ed-platform"
                className="input"
                aria-invalid={errors.platform ? 'true' : undefined}
                aria-describedby={errors.platform ? 'ed-platform-error' : undefined}
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              />
              <FieldError id="ed-platform-error" error={errors.platform} />
            </div>
            <div>
              <label htmlFor="ed-payment" className="label">
                Модель
              </label>
              <select
                id="ed-payment"
                className="select"
                value={paymentModel}
                onChange={(e) => setPaymentModel(e.target.value as PaymentModel)}
              >
                <option value="full">Full</option>
                <option value="unlock">Unlock</option>
              </select>
            </div>
          </div>
          <div className="form-grid-2" style={{ gap: '0.85rem' }}>
            <div>
              <label htmlFor="ed-amount" className="label">
                Сумма, $
              </label>
              <input
                id="ed-amount"
                className="input tabular"
                type="text"
                inputMode="numeric"
                aria-invalid={errors.amountDollars ? 'true' : undefined}
                aria-describedby={errors.amountDollars ? 'ed-amount-error' : undefined}
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
              />
              <FieldError id="ed-amount-error" error={errors.amountDollars} />
            </div>
            <div>
              <label htmlFor="ed-collected" className="label">
                Получено, $
              </label>
              <input
                id="ed-collected"
                className="input tabular"
                type="text"
                inputMode="numeric"
                aria-invalid={errors.amountCollectedDollars ? 'true' : undefined}
                aria-describedby={errors.amountCollectedDollars ? 'ed-collected-error' : undefined}
                value={amountCollectedDollars}
                onChange={(e) => setAmountCollectedDollars(e.target.value)}
              />
              <FieldError id="ed-collected-error" error={errors.amountCollectedDollars} />
            </div>
          </div>
          <div className="form-grid-2" style={{ gap: '0.85rem' }}>
            <div>
              <label htmlFor="ed-content-kind" className="label">
                Формат
              </label>
              <select
                id="ed-content-kind"
                className="select"
                value={contentKind}
                onChange={(e) => setContentKind(e.target.value as CustomContentKind)}
              >
                <option value="video">Видео</option>
                <option value="photo">Фото</option>
              </select>
            </div>
          </div>
          {contentKind === 'video' ? (
            <div className="form-grid-2" style={{ gap: '0.85rem' }}>
              <div>
                <label htmlFor="ed-min" className="label">
                  Длительность min, мин
                </label>
                <input
                  id="ed-min"
                  className="input tabular"
                  type="text"
                  inputMode="numeric"
                  aria-invalid={errors.durationMinMinutes ? 'true' : undefined}
                  aria-describedby={errors.durationMinMinutes ? 'ed-min-error' : undefined}
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                />
                <FieldError id="ed-min-error" error={errors.durationMinMinutes} />
              </div>
              <div>
                <label htmlFor="ed-max" className="label">
                  Длительность max, мин
                </label>
                <input
                  id="ed-max"
                  className="input tabular"
                  type="text"
                  inputMode="numeric"
                  aria-invalid={errors.durationMaxMinutes ? 'true' : undefined}
                  aria-describedby={errors.durationMaxMinutes ? 'ed-max-error' : undefined}
                  value={durationMax}
                  onChange={(e) => setDurationMax(e.target.value)}
                />
                <FieldError id="ed-max-error" error={errors.durationMaxMinutes} />
              </div>
            </div>
          ) : (
            <div className="form-grid-2" style={{ gap: '0.85rem' }}>
              <div>
                <label htmlFor="ed-photo-min" className="label">
                  Фото min
                </label>
                <input
                  id="ed-photo-min"
                  className="input tabular"
                  type="text"
                  inputMode="numeric"
                  aria-invalid={errors.photoCountMin ? 'true' : undefined}
                  aria-describedby={errors.photoCountMin ? 'ed-photo-min-error' : undefined}
                  value={photoCountMin}
                  onChange={(e) => setPhotoCountMin(e.target.value)}
                />
                <FieldError id="ed-photo-min-error" error={errors.photoCountMin} />
              </div>
              <div>
                <label htmlFor="ed-photo-max" className="label">
                  Фото max
                </label>
                <input
                  id="ed-photo-max"
                  className="input tabular"
                  type="text"
                  inputMode="numeric"
                  aria-invalid={errors.photoCountMax ? 'true' : undefined}
                  aria-describedby={errors.photoCountMax ? 'ed-photo-max-error' : undefined}
                  value={photoCountMax}
                  onChange={(e) => setPhotoCountMax(e.target.value)}
                  placeholder="если пусто, равно min"
                />
                <FieldError id="ed-photo-max-error" error={errors.photoCountMax} />
              </div>
            </div>
          )}
        </>
      ) : null}

      {task.type === 'content_task' ? (
        <div className="form-grid-2" style={{ gap: '0.85rem' }}>
          <div>
            <label htmlFor="ed-req" className="label">
              Заказчик
            </label>
            <select
              id="ed-req"
              className="select"
              aria-invalid={errors.requesterId ? 'true' : undefined}
              aria-describedby={errors.requesterId ? 'ed-req-error' : undefined}
              value={requesterId}
              onChange={(e) => setRequesterId(e.target.value)}
            >
              <option value="">— не указан —</option>
              {selectedInactiveUser(activeUsers, users, requesterId).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
            <FieldError id="ed-req-error" error={errors.requesterId} />
          </div>
          <div>
            <label htmlFor="ed-asg" className="label">
              Исполнитель
            </label>
            <select
              id="ed-asg"
              className="select"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">— не указан —</option>
              {selectedInactiveUser(activeUsers, users, assigneeId).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div>
        <label htmlFor="ed-desc" className="label">
          Описание
        </label>
        <textarea
          id="ed-desc"
          className="textarea"
          aria-invalid={errors.description ? 'true' : undefined}
          aria-describedby={errors.description ? 'ed-desc-error' : undefined}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <FieldError id="ed-desc-error" error={errors.description} />
      </div>

      <div className="toolbar" style={{ alignItems: 'center', gap: '1rem' }}>
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button type="button" className="back-link" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function selectedInactiveUser(
  activeUsers: UserOption[],
  allUsers: UserOption[],
  userId: string,
): UserOption[] {
  if (!userId || activeUsers.some((u) => u.id === userId)) return activeUsers;
  const current = allUsers.find((u) => u.id === userId);
  return current ? [current, ...activeUsers] : activeUsers;
}
