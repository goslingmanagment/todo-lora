'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  changeStatusAction,
  deleteTaskAction,
  setAgreementStateAction,
  updateTaskAction,
} from '@/lib/server/actions';
import { showToast } from '@/components/Toaster';
import { DeadlineChip } from '@/components/DeadlineChip';
import { PriorityDot } from '@/components/PriorityDot';
import { formatMoneyDisplay } from '@/lib/format/money';
import {
  AGREEMENT_LABELS_RU,
  PRIORITY_LABELS_RU,
  STATUS_LABELS_RU,
  STATUS_RULES,
  TYPE_LABELS_RU,
  allowedTargets,
} from '@/lib/fsm/taskStatus';
import type { AgreementState, ContentProductionStatus, TaskStatus } from '@/drizzle/schema/enums';
import {
  CONTENT_PRODUCTION_LABELS_RU,
  CONTENT_PRODUCTION_STATUSES,
} from '@/lib/domain/contentProduction';
import { agreementChipClass, HardDeleteDialog, UpdatedMeta } from './_primitives';
import { CustomFactsPanel, ReadonlyPanel } from './ReadonlyPanel';
import { EditPanel } from './EditPanel';
import { ImageAttachments } from './ImageAttachments';
import { UrlAttachments } from './UrlAttachments';
import { AuditLog } from './AuditLog';
import type { AttachmentDto, EventDto, TaskDto, Topic, UserOption } from './_types';

type Props = {
  task: TaskDto;
  topic: Topic | null;
  allTopics: Topic[];
  users: UserOption[];
  attachments: AttachmentDto[];
  events: EventDto[];
};

export function TaskDetail({ task, topic, allTopics, users, attachments, events }: Props) {
  // Read directly from RSC props. After every mutation we call
  // router.refresh(), so initialTask updates within ~50–200 ms; the brief
  // optimistic flash we used to do via local state isn't worth the
  // duplicated source of truth (and the lint rule that came with React 19).
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const targets = allowedTargets(task.type, task.status);
  const deliveryNeedsAgreement =
    task.type === 'custom' && task.status === 'done' && task.agreementState !== 'confirmed';
  const lastEditedByName = task.lastEditedBy
    ? users.find((u) => u.id === task.lastEditedBy)?.displayName ?? null
    : null;

  const moneyText = task.type === 'custom'
    ? formatMoneyDisplay({
        paymentModel: task.paymentModel,
        amountCents: task.amountCents,
        amountCollectedCents: task.amountCollectedCents,
      })
    : null;

  const onChangeStatus = (next: TaskStatus) => {
    startTransition(async () => {
      const res = await changeStatusAction({
        id: task.id,
        newStatus: next,
        expectedVersion: task.version,
      });
      if (res.ok) {
        showToast(`Статус: ${STATUS_LABELS_RU[next]}`);
        router.refresh();
      } else if (res.code === 'stale') {
        showToast('Задачу только что изменили. Обновляем…', { tone: 'error' });
        router.refresh();
      } else {
        showToast(res.error, { tone: 'error' });
      }
    });
  };

  const onSetAgreement = (next: AgreementState) => {
    startTransition(async () => {
      const res = await setAgreementStateAction({
        id: task.id,
        agreementState: next,
        expectedVersion: task.version,
      });
      if (res.ok) {
        router.refresh();
      } else if (res.code === 'stale') {
        showToast('Задачу только что изменили. Обновляем…', { tone: 'error' });
        router.refresh();
      } else {
        showToast(res.error, { tone: 'error' });
      }
    });
  };

  const onSetProductionStatus = (next: ContentProductionStatus) => {
    startTransition(async () => {
      const res = await updateTaskAction({
        id: task.id,
        expectedVersion: task.version,
        contentProductionStatus: next,
      });
      if (res.ok) {
        showToast(`Продакшн: ${CONTENT_PRODUCTION_LABELS_RU[next]}`);
        router.refresh();
      } else if (res.code === 'stale') {
        showToast('Задачу только что изменили. Обновляем…', { tone: 'error' });
        router.refresh();
      } else {
        showToast(res.error, { tone: 'error' });
      }
    });
  };

  const onConfirmHardDelete = () => {
    startTransition(async () => {
      const res = await deleteTaskAction({
        id: task.id,
        expectedVersion: task.version,
      });
      if (res.ok) {
        // Task is gone — go back to the feed before the page tries to
        // re-render against a missing row.
        showToast('Задача удалена');
        router.push('/');
        router.refresh();
        return;
      }
      if (res.code === 'stale') {
        showToast('Задачу только что изменили. Обновляем…', { tone: 'error' });
        setConfirmingDelete(false);
        router.refresh();
        return;
      }
      showToast(res.error, { tone: 'error' });
    });
  };

  return (
    <>
      <Link href="/" className="back-link" prefetch={false}>
        ← К ленте
      </Link>

      <header
        style={{
          marginTop: '0.6rem',
          marginBottom: '1.25rem',
          paddingBottom: '0.9rem',
          borderBottom: '1px solid var(--color-line)',
        }}
      >
        <p className="eyebrow" style={{ margin: 0 }}>
          {TYPE_LABELS_RU[task.type]}
          {topic ? ` · ${topic.name}` : ''}
        </p>
        <h1
          className="section-title"
          style={{
            fontSize: '1.85rem',
            margin: '0.3rem 0 0.4rem',
            wordBreak: 'break-word',
          }}
        >
          {task.title}
        </h1>
        <UpdatedMeta updatedAtIso={task.updatedAtIso} lastEditedByName={lastEditedByName} />
        <div
          className="toolbar"
          style={{ alignItems: 'center', gap: '0.55rem', marginTop: '0.45rem' }}
        >
          <PriorityDot priority={task.priority} />
          <span className={statusHeaderChipClass(task.status)}>
            {STATUS_LABELS_RU[task.status]}
          </span>
          {task.priority ? (
            <span className="muted-2" style={{ fontSize: '0.78rem' }}>
              {PRIORITY_LABELS_RU[task.priority]}
            </span>
          ) : null}
          <DeadlineChip deadline={task.deadlineOn} />
          {task.type === 'custom' && task.agreementState ? (
            <span className={agreementChipClass(task.agreementState)}>
              {AGREEMENT_LABELS_RU[task.agreementState]}
            </span>
          ) : null}
        </div>
      </header>

      <section style={{ marginBottom: '1.5rem' }} aria-label="Действия">
        <p className="eyebrow" style={{ margin: '0 0 0.55rem' }}>
          Статус
        </p>
        <div className="toolbar" style={{ gap: '0.5rem' }}>
          {targets.map((next) => {
            const disabledByReadiness = next === 'delivered' && deliveryNeedsAgreement;
            const rule = STATUS_RULES.find((r) => r.from === task.status && r.to === next);
            const isPrimary = rule?.kind === 'forward' || rule?.kind === 'reopen';
            const isCancel = next === 'cancelled';
            const className = isPrimary
              ? 'btn btn-primary'
              : isCancel
              ? 'btn btn-quiet'
              : 'btn';
            return (
              <button
                key={next}
                type="button"
                className={className}
                onClick={() => onChangeStatus(next)}
                disabled={isPending || disabledByReadiness}
                title={disabledByReadiness ? 'Сначала подтвердите договорённость' : undefined}
                style={
                  isCancel
                    ? { color: 'var(--color-state-red)', borderColor: 'var(--color-line)' }
                    : undefined
                }
              >
                {STATUS_LABELS_RU[next]}
              </button>
            );
          })}
          {targets.length === 0 ? (
            <span className="muted-2" style={{ fontSize: '0.85rem' }}>
              Финальный статус.
            </span>
          ) : null}
        </div>
        {deliveryNeedsAgreement ? (
          <p className="muted-2" style={{ margin: '0.45rem 0 0', fontSize: '0.85rem' }}>
            Чтобы доставить Custom, сначала подтвердите договорённость.
          </p>
        ) : null}

        {task.type === 'custom' ? (
          <div style={{ marginTop: '1rem' }}>
            <p className="eyebrow" style={{ margin: '0 0 0.55rem' }}>
              Договорённость
            </p>
            <div className="segmented" role="radiogroup" aria-label="Договорённость">
              {(['pending', 'confirmed', 'rejected'] as AgreementState[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  className="segmented-item"
                  aria-checked={task.agreementState === s}
                  onClick={() => onSetAgreement(s)}
                  disabled={isPending}
                >
                  {AGREEMENT_LABELS_RU[s]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {task.type === 'custom' ? (
        <CustomFactsPanel task={task} moneyText={moneyText} />
      ) : null}

      {task.type === 'content_task' ? (
        <ContentWorkflowPanel
          productionStatus={task.contentProductionStatus ?? 'planned'}
          isPending={isPending}
          onSetProductionStatus={onSetProductionStatus}
        />
      ) : null}

      <section style={{ marginBottom: '1.5rem' }} aria-label="Детали">
        {editing ? (
          <EditPanel
            task={task}
            allTopics={allTopics}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              router.refresh();
            }}
            onStale={() => router.refresh()}
            isPending={isPending}
            startTransition={startTransition}
          />
        ) : (
          <>
            <ReadonlyPanel task={task} topic={topic} />
            <button
              type="button"
              className="btn"
              style={{ marginTop: '1rem' }}
              onClick={() => setEditing(true)}
            >
              Редактировать
            </button>
          </>
        )}
      </section>

      <section aria-labelledby="images-heading" style={{ marginTop: '1.25rem' }}>
        <ImageAttachments
          taskId={task.id}
          attachments={attachments.filter((a) => a.kind === 'image')}
          onChanged={() => router.refresh()}
        />
      </section>

      <section aria-labelledby="urls-heading" style={{ marginTop: '1.5rem' }}>
        <UrlAttachments
          taskId={task.id}
          attachments={attachments.filter((a) => a.kind === 'url')}
          onChanged={() => router.refresh()}
        />
      </section>

      <section aria-label="История" style={{ marginTop: '2rem' }}>
        <AuditLog events={events} />
      </section>

      <section className="danger-zone" aria-labelledby="danger-zone-title">
        <div>
          <h2 id="danger-zone-title">Опасная зона</h2>
          <p>Удаление окончательное: вложения и история тоже стираются.</p>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setConfirmingDelete(true)}
          disabled={isPending}
          style={{ fontSize: '0.85rem' }}
        >
          Удалить навсегда
        </button>
      </section>

      {confirmingDelete ? (
        <HardDeleteDialog
          taskTitle={task.title}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={onConfirmHardDelete}
          isPending={isPending}
        />
      ) : null}
    </>
  );
}

function statusHeaderChipClass(status: TaskStatus): string {
  if (status === 'in_progress') return 'chip chip-amber';
  if (status === 'done' || status === 'delivered') return 'chip chip-green';
  if (status === 'cancelled') return 'chip chip-gray';
  return 'chip chip-draft';
}

function ContentWorkflowPanel({
  productionStatus,
  isPending,
  onSetProductionStatus,
}: {
  productionStatus: ContentProductionStatus;
  isPending: boolean;
  onSetProductionStatus: (next: ContentProductionStatus) => void;
}) {
  return (
    <section
      className="panel"
      aria-labelledby="content-workflow-heading"
      style={{ marginBottom: '1.5rem', display: 'grid', gap: '0.9rem' }}
    >
      <div>
        <h2 id="content-workflow-heading" className="eyebrow" style={{ margin: '0 0 0.55rem' }}>
          Продакшн
        </h2>
        <div className="segmented production-segmented" role="radiogroup" aria-label="Продакшн">
          {CONTENT_PRODUCTION_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              role="radio"
              className="segmented-item"
              aria-checked={productionStatus === status}
              onClick={() => onSetProductionStatus(status)}
              disabled={isPending}
            >
              {CONTENT_PRODUCTION_LABELS_RU[status]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
