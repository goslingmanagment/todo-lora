'use client';

import Link from 'next/link';
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import {
  ACCEPTED_IMAGE_MIMES,
  ATTACHMENT_LIMIT as MAX_ATTACHMENTS,
} from '@/lib/domain/attachmentPolicy';
import type { CustomContentKind } from '@/drizzle/schema/enums';
import type { CustomPayStatus } from '@/lib/domain/customTaskInput';
import type { NewTaskUrlAttachment } from '@/lib/domain/newTaskPayload';

export type TopicOption = { id: string; name: string; slug: string };
export type UserOption = { id: string; displayName: string };
export type TabKey = 'custom' | 'content_task';
export type PriorityValue = 'low' | 'medium' | 'high';
export type PayStatus = CustomPayStatus;
export type PlatformChoice = 'Fansly' | 'OnlyFans' | 'Other';
export type UrlAttachmentDraft = NewTaskUrlAttachment & { id: string };

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

export function TypeTabs({
  type,
  onChange,
}: {
  type: TabKey;
  onChange: (nextType: TabKey) => void;
}) {
  return (
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
            onClick={() => onChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function NewTaskMainPane({
  type,
  title,
  setTitle,
  errors,
  contentKind,
  briefDescription,
  setBriefDescription,
  clothingDescription,
  setClothingDescription,
  notesDescription,
  setNotesDescription,
  description,
  setDescription,
  attachmentCount,
  attachmentSlots,
  urlAttachments,
  files,
  isBusy,
  hydrated,
  onAddUrlAttachment,
  onUpdateUrlAttachment,
  onRemoveUrlAttachment,
  onRemoveFile,
  onFilesSelected,
}: {
  type: TabKey;
  title: string;
  setTitle: (value: string) => void;
  errors: Record<string, string>;
  contentKind: CustomContentKind;
  briefDescription: string;
  setBriefDescription: (value: string) => void;
  clothingDescription: string;
  setClothingDescription: (value: string) => void;
  notesDescription: string;
  setNotesDescription: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  attachmentCount: number;
  attachmentSlots: number;
  urlAttachments: UrlAttachmentDraft[];
  files: File[];
  isBusy: boolean;
  hydrated: boolean;
  onAddUrlAttachment: () => void;
  onUpdateUrlAttachment: (id: string, patch: Partial<Omit<UrlAttachmentDraft, 'id'>>) => void;
  onRemoveUrlAttachment: (id: string) => void;
  onRemoveFile: (index: number) => void;
  onFilesSelected: (files: File[]) => void;
}) {
  return (
    <div className="task-form-main">
      {type === 'content_task' ? (
        <ContentTitleField title={title} setTitle={setTitle} error={errors.title} />
      ) : null}

      {type === 'custom' ? (
        <CustomDescriptionFields
          contentKind={contentKind}
          briefDescription={briefDescription}
          setBriefDescription={setBriefDescription}
          clothingDescription={clothingDescription}
          setClothingDescription={setClothingDescription}
          notesDescription={notesDescription}
          setNotesDescription={setNotesDescription}
        />
      ) : (
        <ContentDescriptionField description={description} setDescription={setDescription} />
      )}

      <AttachmentsSection
        attachmentCount={attachmentCount}
        attachmentSlots={attachmentSlots}
        urlAttachments={urlAttachments}
        files={files}
        error={errors.attachments}
        isBusy={isBusy}
        onAddUrlAttachment={onAddUrlAttachment}
        onUpdateUrlAttachment={onUpdateUrlAttachment}
        onRemoveUrlAttachment={onRemoveUrlAttachment}
        onRemoveFile={onRemoveFile}
        onFilesSelected={onFilesSelected}
      />

      <SubmitRow type={type} hydrated={hydrated} isBusy={isBusy} />
    </div>
  );
}

function ContentTitleField({
  title,
  setTitle,
  error,
}: {
  title: string;
  setTitle: (value: string) => void;
  error?: string;
}) {
  return (
    <>
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
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? 'title-error' : undefined}
      />
      {error ? (
        <p id="title-error" role="alert" className="field-error" style={{ marginTop: 0 }}>
          {error}
        </p>
      ) : null}
    </>
  );
}

function CustomDescriptionFields({
  contentKind,
  briefDescription,
  setBriefDescription,
  clothingDescription,
  setClothingDescription,
  notesDescription,
  setNotesDescription,
}: {
  contentKind: CustomContentKind;
  briefDescription: string;
  setBriefDescription: (value: string) => void;
  clothingDescription: string;
  setClothingDescription: (value: string) => void;
  notesDescription: string;
  setNotesDescription: (value: string) => void;
}) {
  return (
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
  );
}

function ContentDescriptionField({
  description,
  setDescription,
}: {
  description: string;
  setDescription: (value: string) => void;
}) {
  return (
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
  );
}

function AttachmentsSection({
  attachmentCount,
  attachmentSlots,
  urlAttachments,
  files,
  error,
  isBusy,
  onAddUrlAttachment,
  onUpdateUrlAttachment,
  onRemoveUrlAttachment,
  onRemoveFile,
  onFilesSelected,
}: {
  attachmentCount: number;
  attachmentSlots: number;
  urlAttachments: UrlAttachmentDraft[];
  files: File[];
  error?: string;
  isBusy: boolean;
  onAddUrlAttachment: () => void;
  onUpdateUrlAttachment: (id: string, patch: Partial<Omit<UrlAttachmentDraft, 'id'>>) => void;
  onRemoveUrlAttachment: (id: string) => void;
  onRemoveFile: (index: number) => void;
  onFilesSelected: (files: File[]) => void;
}) {
  return (
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
        <UrlAttachmentList
          items={urlAttachments}
          isBusy={isBusy}
          onUpdate={onUpdateUrlAttachment}
          onRemove={onRemoveUrlAttachment}
        />
      ) : null}

      {files.length > 0 ? (
        <FileAttachmentList files={files} isBusy={isBusy} onRemove={onRemoveFile} />
      ) : null}

      {error ? (
        <p role="alert" className="field-error" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
          {error}
        </p>
      ) : null}

      <div className="toolbar">
        <button
          type="button"
          className="btn"
          aria-label="Добавить ссылку"
          onClick={onAddUrlAttachment}
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
  );
}

function UrlAttachmentList({
  items,
  isBusy,
  onUpdate,
  onRemove,
}: {
  items: UrlAttachmentDraft[];
  isBusy: boolean;
  onUpdate: (id: string, patch: Partial<Omit<UrlAttachmentDraft, 'id'>>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.5rem' }}>
      {items.map((item, index) => (
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
                onChange={(e) => onUpdate(item.id, { url: e.target.value })}
                placeholder="https://..."
              />
            </Field>
            <Field id={`url-caption-${index}`} label="Подпись">
              <input
                id={`url-caption-${index}`}
                className="input"
                value={item.caption}
                onChange={(e) => onUpdate(item.id, { caption: e.target.value })}
              />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => onRemove(item.id)}
              disabled={isBusy}
            >
              Убрать ссылку
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FileAttachmentList({
  files,
  isBusy,
  onRemove,
}: {
  files: File[];
  isBusy: boolean;
  onRemove: (index: number) => void;
}) {
  return (
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
            onClick={() => onRemove(index)}
            disabled={isBusy}
          >
            Убрать
          </button>
        </li>
      ))}
    </ul>
  );
}

function SubmitRow({
  type,
  hydrated,
  isBusy,
}: {
  type: TabKey;
  hydrated: boolean;
  isBusy: boolean;
}) {
  return (
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
      <button type="submit" className="btn btn-primary" disabled={isBusy} style={{ minWidth: 160 }}>
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
  );
}

export function NewTaskSidebar({
  type,
  topics,
  users,
  errors,
  topicId,
  setTopicId,
  platformChoice,
  setPlatformChoice,
  platformOther,
  setPlatformOther,
  buyerHandle,
  setBuyerHandle,
  buyerDisplayName,
  setBuyerDisplayName,
  paymentModel,
  setPaymentModel,
  amountDollars,
  setAmountDollars,
  payStatus,
  setPayStatus,
  customCollectedDollars,
  setCustomCollectedDollars,
  paySummary,
  contentKind,
  setContentKind,
  durationText,
  setDurationText,
  photoCountText,
  setPhotoCountText,
  deadlineOn,
  setDeadlineOn,
  priority,
  setPriority,
  requesterId,
  setRequesterId,
  assigneeId,
  setAssigneeId,
}: {
  type: TabKey;
  topics: TopicOption[];
  users: UserOption[];
  errors: Record<string, string>;
  topicId: string;
  setTopicId: (value: string) => void;
  platformChoice: PlatformChoice;
  setPlatformChoice: (value: PlatformChoice) => void;
  platformOther: string;
  setPlatformOther: (value: string) => void;
  buyerHandle: string;
  setBuyerHandle: (value: string) => void;
  buyerDisplayName: string;
  setBuyerDisplayName: (value: string) => void;
  paymentModel: 'full' | 'unlock';
  setPaymentModel: (value: 'full' | 'unlock') => void;
  amountDollars: string;
  setAmountDollars: (value: string) => void;
  payStatus: PayStatus;
  setPayStatus: (value: PayStatus) => void;
  customCollectedDollars: string;
  setCustomCollectedDollars: (value: string) => void;
  paySummary: { text: string; warn: boolean } | null;
  contentKind: CustomContentKind;
  setContentKind: (value: CustomContentKind) => void;
  durationText: string;
  setDurationText: (value: string) => void;
  photoCountText: string;
  setPhotoCountText: (value: string) => void;
  deadlineOn: string;
  setDeadlineOn: (value: string) => void;
  priority: PriorityValue | null;
  setPriority: (value: PriorityValue | null) => void;
  requesterId: string;
  setRequesterId: (value: string) => void;
  assigneeId: string;
  setAssigneeId: (value: string) => void;
}) {
  return (
    <aside className="task-form-side" aria-label="Метаданные задачи">
      {type !== 'custom' ? (
        <TopicPicker
          topics={topics}
          topicId={topicId}
          setTopicId={setTopicId}
          error={errors.topicId}
        />
      ) : null}

      {type === 'custom' ? (
        <>
          <CustomDetailsSection
            platformChoice={platformChoice}
            setPlatformChoice={setPlatformChoice}
            platformOther={platformOther}
            setPlatformOther={setPlatformOther}
            buyerHandle={buyerHandle}
            setBuyerHandle={setBuyerHandle}
            buyerDisplayName={buyerDisplayName}
            setBuyerDisplayName={setBuyerDisplayName}
            errors={errors}
          />
          <CustomPaymentSection
            paymentModel={paymentModel}
            setPaymentModel={setPaymentModel}
            amountDollars={amountDollars}
            setAmountDollars={setAmountDollars}
            payStatus={payStatus}
            setPayStatus={setPayStatus}
            customCollectedDollars={customCollectedDollars}
            setCustomCollectedDollars={setCustomCollectedDollars}
            paySummary={paySummary}
            errors={errors}
          />
          <CustomTimingSection
            contentKind={contentKind}
            setContentKind={setContentKind}
            durationText={durationText}
            setDurationText={setDurationText}
            photoCountText={photoCountText}
            setPhotoCountText={setPhotoCountText}
            deadlineOn={deadlineOn}
            setDeadlineOn={setDeadlineOn}
            priority={priority}
            setPriority={setPriority}
            errors={errors}
          />
        </>
      ) : null}

      {type === 'content_task' ? (
        <>
          <ContentTeamSection
            users={users}
            requesterId={requesterId}
            setRequesterId={setRequesterId}
            assigneeId={assigneeId}
            setAssigneeId={setAssigneeId}
            error={errors.requesterId}
          />
          <ContentTimingSection
            deadlineOn={deadlineOn}
            setDeadlineOn={setDeadlineOn}
            priority={priority}
            setPriority={setPriority}
            deadlineError={errors.deadlineOn}
          />
        </>
      ) : null}
    </aside>
  );
}

function TopicPicker({
  topics,
  topicId,
  setTopicId,
  error,
}: {
  topics: TopicOption[];
  topicId: string;
  setTopicId: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="task-form-side-section">
      <h4>Тема</h4>
      <Field id="topic" label="" hideLabel error={error}>
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
  );
}

function CustomDetailsSection({
  platformChoice,
  setPlatformChoice,
  platformOther,
  setPlatformOther,
  buyerHandle,
  setBuyerHandle,
  buyerDisplayName,
  setBuyerDisplayName,
  errors,
}: {
  platformChoice: PlatformChoice;
  setPlatformChoice: (value: PlatformChoice) => void;
  platformOther: string;
  setPlatformOther: (value: string) => void;
  buyerHandle: string;
  setBuyerHandle: (value: string) => void;
  buyerDisplayName: string;
  setBuyerDisplayName: (value: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="task-form-side-section">
      <h4>Детали</h4>
      <div className="task-form-side-stack">
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
  );
}

function CustomPaymentSection({
  paymentModel,
  setPaymentModel,
  amountDollars,
  setAmountDollars,
  payStatus,
  setPayStatus,
  customCollectedDollars,
  setCustomCollectedDollars,
  paySummary,
  errors,
}: {
  paymentModel: 'full' | 'unlock';
  setPaymentModel: (value: 'full' | 'unlock') => void;
  amountDollars: string;
  setAmountDollars: (value: string) => void;
  payStatus: PayStatus;
  setPayStatus: (value: PayStatus) => void;
  customCollectedDollars: string;
  setCustomCollectedDollars: (value: string) => void;
  paySummary: { text: string; warn: boolean } | null;
  errors: Record<string, string>;
}) {
  return (
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
            <Field id="customCollected" label="Получено, $" error={errors.amountCollectedDollars}>
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
          {paySummary ? (
            <p className={`pay-summary${paySummary.warn ? ' warn' : ''}`}>{paySummary.text}</p>
          ) : (
            <p className="pay-summary muted-2">Укажите сумму выше</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomTimingSection({
  contentKind,
  setContentKind,
  durationText,
  setDurationText,
  photoCountText,
  setPhotoCountText,
  deadlineOn,
  setDeadlineOn,
  priority,
  setPriority,
  errors,
}: {
  contentKind: CustomContentKind;
  setContentKind: (value: CustomContentKind) => void;
  durationText: string;
  setDurationText: (value: string) => void;
  photoCountText: string;
  setPhotoCountText: (value: string) => void;
  deadlineOn: string;
  setDeadlineOn: (value: string) => void;
  priority: PriorityValue | null;
  setPriority: (value: PriorityValue | null) => void;
  errors: Record<string, string>;
}) {
  return (
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

          <DeadlineField
            deadlineOn={deadlineOn}
            setDeadlineOn={setDeadlineOn}
            error={errors.deadlineOn}
          />
        </div>

        <PriorityField priority={priority} setPriority={setPriority} />
      </div>
    </div>
  );
}

function ContentTeamSection({
  users,
  requesterId,
  setRequesterId,
  assigneeId,
  setAssigneeId,
  error,
}: {
  users: UserOption[];
  requesterId: string;
  setRequesterId: (value: string) => void;
  assigneeId: string;
  setAssigneeId: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="task-form-side-section">
      <h4>Команда</h4>
      <div className="task-form-side-stack">
        <Field id="requester" label="Заказчик" required error={error}>
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
  );
}

function ContentTimingSection({
  deadlineOn,
  setDeadlineOn,
  priority,
  setPriority,
  deadlineError,
}: {
  deadlineOn: string;
  setDeadlineOn: (value: string) => void;
  priority: PriorityValue | null;
  setPriority: (value: PriorityValue | null) => void;
  deadlineError?: string;
}) {
  return (
    <div className="task-form-side-section">
      <h4>Тайминг</h4>
      <div className="task-form-side-stack">
        <DeadlineField
          deadlineOn={deadlineOn}
          setDeadlineOn={setDeadlineOn}
          error={deadlineError}
        />
        <PriorityField priority={priority} setPriority={setPriority} />
      </div>
    </div>
  );
}

function DeadlineField({
  deadlineOn,
  setDeadlineOn,
  error,
}: {
  deadlineOn: string;
  setDeadlineOn: (value: string) => void;
  error?: string;
}) {
  return (
    <Field id="deadline" label="Дедлайн" required error={error}>
      <input
        id="deadline"
        className="input tabular"
        type="date"
        value={deadlineOn}
        onChange={(e) => setDeadlineOn(e.target.value)}
      />
    </Field>
  );
}

function PriorityField({
  priority,
  setPriority,
}: {
  priority: PriorityValue | null;
  setPriority: (value: PriorityValue | null) => void;
}) {
  return (
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
