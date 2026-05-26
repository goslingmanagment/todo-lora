'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { createTaskAction, createUrlAttachmentAction } from '@/lib/server/actions';
import { showToast } from '@/components/Toaster';
import type { NewTaskPreferences } from '@/lib/server/preferences';
import { useImageUpload } from '@/lib/client/useImageUpload';
import { ATTACHMENT_LIMIT as MAX_ATTACHMENTS } from '@/lib/domain/attachmentPolicy';
import {
  payPresetSummary,
  presetCollected,
  type CustomPayStatus,
} from '@/lib/domain/customTaskInput';
import {
  CONTENT_TASK_PRESETS,
  chooseContentTopicId,
  contentTopics,
  defaultContentDestinationForTopic,
  topicIdForContentPreset,
  type ContentTaskPreset,
} from '@/lib/domain/contentWorkflow';
import { buildNewTaskPayload } from '@/lib/domain/newTaskPayload';
import { parseDollarInput } from '@/lib/domain/inputs';
import type { ContentDestination, CustomContentKind } from '@/drizzle/schema/enums';
import {
  NewTaskMainPane,
  NewTaskSidebar,
  TypeTabs,
  type PlatformChoice,
  type PriorityValue,
  type TabKey,
  type TopicOption,
  type UrlAttachmentDraft,
} from './NewTaskFormSections';

type Props = {
  topics: TopicOption[];
  preferences: NewTaskPreferences;
};

type PayStatus = CustomPayStatus;

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
  attachments: 'attachments-title',
  description: 'description',
  contentPhotoCount: 'contentPhotoCount',
  contentDuration: 'contentDuration',
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
  'deadlineOn',
  'description',
  'contentPhotoCount',
  'contentDuration',
  'attachments',
];

function newUrlDraft(): UrlAttachmentDraft {
  const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return { id, url: '', caption: '' };
}

function isKnownPlatform(value: string | null | undefined): value is 'Fansly' | 'OnlyFans' {
  return value === 'Fansly' || value === 'OnlyFans';
}

export function NewTaskForm({ topics, preferences }: Props) {
  const customsTopicId = topics.find((t) => t.slug === 'customs')?.id ?? topics[0]?.id ?? '';
  const contentTopicOptions = contentTopics(topics);
  const contentTopicId =
    chooseContentTopicId(topics, preferences.content_task?.topicId) ?? topics[0]?.id ?? '';
  // Custom-type tasks always belong to the "customs" topic — the type itself
  // already declares the category, so the sidebar hides the topic switcher
  // and we don't honour the saved preference here.
  const initialTopicId = customsTopicId;
  const preferredPlatform = preferences.custom?.platform;

  const [type, setType] = useState<TabKey>('custom');

  const defaultTopicFor = (t: TabKey): string => {
    if (t === 'custom') return customsTopicId;
    return contentTopicId;
  };

  // Shared
  const [title, setTitle] = useState('');
  const [topicId, setTopicId] = useState<string>(initialTopicId);
  const [priority, setPriority] = useState<PriorityValue | null>('medium');
  const [deadlineOn, setDeadlineOn] = useState<string>('');
  // For content_task; custom uses brief/clothing/notes instead.
  const [description, setDescription] = useState('');
  const [contentPhotoCountText, setContentPhotoCountText] = useState('');
  const [contentDurationText, setContentDurationText] = useState('');
  const [contentDestination, setContentDestination] = useState<ContentDestination>(
    defaultContentDestinationForTopic(topics, contentTopicId),
  );

  // Custom — buyer
  const [buyerHandle, setBuyerHandle] = useState('');
  const [buyerDisplayName, setBuyerDisplayName] = useState('');
  const [platformChoice, setPlatformChoice] = useState<PlatformChoice>(
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

  const [selectedContentPresetId, setSelectedContentPresetId] = useState<string | null>(null);

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
    setPriority((prev) => prev ?? 'medium');

    if (nextType === 'custom') {
      setTopicId(defaultTopicFor(nextType));
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
      return;
    }

    const nextTopicId = defaultTopicFor(nextType);
    setTopicId(nextTopicId);
    setContentDestination(defaultContentDestinationForTopic(topics, nextTopicId));
    setSelectedContentPresetId(null);
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
    const result = buildNewTaskPayload({
      type,
      title,
      topicId,
      priority,
      deadlineOn,
      description,
      contentPhotoCountText,
      contentDurationText,
      contentDestination,
      buyerHandle,
      buyerDisplayName,
      platform,
      paymentModel,
      amountDollars,
      payStatus,
      customCollectedDollars,
      contentKind,
      durationText,
      photoCountText,
      briefDescription,
      clothingDescription,
      notesDescription,
      urlAttachments,
      files,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return null;
    }
    return result.payload;
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const setTopicFromSidebar = (value: string) => {
    setTopicId(value);
    if (type === 'content_task') {
      setContentDestination(defaultContentDestinationForTopic(topics, value));
      setSelectedContentPresetId(null);
    }
  };

  const applyContentPreset = (preset: ContentTaskPreset) => {
    const presetTopicId = topicIdForContentPreset(topics, preset);
    if (presetTopicId) setTopicId(presetTopicId);
    setSelectedContentPresetId(preset.id);
    setTitle(preset.title);
    setDescription(preset.description);
    setContentPhotoCountText(preset.photoCountText);
    setContentDurationText(preset.durationText);
    setContentDestination(preset.destination);
    setErrors((prev) => {
      const {
        title: _title,
        description: _description,
        contentPhotoCount: _contentPhotoCount,
        contentDuration: _contentDuration,
        contentDestination: _contentDestination,
        topicId: _topicId,
        ...rest
      } = prev;
      return rest;
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: '1.1rem' }}>
      <TypeTabs type={type} onChange={switchTaskType} />
      {type === 'custom' && errors.topicId ? (
        <p id="topic" role="alert" tabIndex={-1} className="field-error" style={{ margin: 0 }}>
          {errors.topicId}
        </p>
      ) : null}

      <div className={`task-form-grid task-form-grid-${type}`}>
        <NewTaskMainPane
          type={type}
          title={title}
          setTitle={setTitle}
          errors={errors}
          contentPresets={CONTENT_TASK_PRESETS}
          selectedContentPresetId={selectedContentPresetId}
          onApplyContentPreset={applyContentPreset}
          contentKind={contentKind}
          briefDescription={briefDescription}
          setBriefDescription={setBriefDescription}
          clothingDescription={clothingDescription}
          setClothingDescription={setClothingDescription}
          notesDescription={notesDescription}
          setNotesDescription={setNotesDescription}
          description={description}
          setDescription={setDescription}
          attachmentCount={attachmentCount}
          attachmentSlots={attachmentSlots}
          urlAttachments={urlAttachments}
          files={files}
          isBusy={isBusy}
          hydrated={hydrated}
          onAddUrlAttachment={addUrlAttachment}
          onUpdateUrlAttachment={updateUrlAttachment}
          onRemoveUrlAttachment={removeUrlAttachment}
          onRemoveFile={removeFile}
          onFilesSelected={onFilesSelected}
        />
        <NewTaskSidebar
          type={type}
          topics={type === 'content_task' ? contentTopicOptions : topics}
          errors={errors}
          topicId={topicId}
          setTopicId={setTopicFromSidebar}
          platformChoice={platformChoice}
          setPlatformChoice={setPlatformChoice}
          platformOther={platformOther}
          setPlatformOther={setPlatformOther}
          buyerHandle={buyerHandle}
          setBuyerHandle={setBuyerHandle}
          buyerDisplayName={buyerDisplayName}
          setBuyerDisplayName={setBuyerDisplayName}
          paymentModel={paymentModel}
          setPaymentModel={setPaymentModel}
          amountDollars={amountDollars}
          setAmountDollars={setAmountDollars}
          payStatus={payStatus}
          setPayStatus={setPayStatus}
          customCollectedDollars={customCollectedDollars}
          setCustomCollectedDollars={setCustomCollectedDollars}
          paySummary={paySummaryDerived}
          contentKind={contentKind}
          setContentKind={setContentKind}
          durationText={durationText}
          setDurationText={setDurationText}
          photoCountText={photoCountText}
          setPhotoCountText={setPhotoCountText}
          contentPhotoCountText={contentPhotoCountText}
          setContentPhotoCountText={setContentPhotoCountText}
          contentDurationText={contentDurationText}
          setContentDurationText={setContentDurationText}
          deadlineOn={deadlineOn}
          setDeadlineOn={setDeadlineOn}
          priority={priority}
          setPriority={setPriority}
        />
      </div>
    </form>
  );
}
