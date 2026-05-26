'use client';

import { Fact, LinkifiedText } from './_primitives';
import { formatDateRu } from '@/lib/format/dates';
import {
  customContentKindLabel,
  formatCustomContentMetric,
  formatMediaVolume,
  resolvedCustomContentKind,
} from '@/lib/format/customContent';
import { CONTENT_DESTINATION_LABELS_RU } from '@/lib/domain/contentDestination';
import { CONTENT_PRODUCTION_LABELS_RU } from '@/lib/domain/contentProduction';
import type { TaskDto, Topic } from './_types';

export function ReadonlyPanel({
  task,
  topic,
}: {
  task: TaskDto;
  topic: Topic | null;
}) {
  const mediaVolume = formatMediaVolume(task);
  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      {task.description ? (
        <div>
          <p className="eyebrow" style={{ margin: '0 0 0.35rem' }}>
            Описание
          </p>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--color-ink-2)' }}>
            <LinkifiedText value={task.description} />
          </p>
        </div>
      ) : null}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem 1.25rem',
          margin: 0,
        }}
      >
        <Fact label={task.type === 'content_task' ? 'Категория' : 'Тема'}>
          {topic?.name ?? '—'}
        </Fact>
        <Fact label="Дедлайн" tabular>
          {formatDateRu(task.deadlineOn) ?? '—'}
        </Fact>
        {task.type === 'content_task' ? (
          <>
            <Fact label="Назначение">
              {task.contentDestination
                ? CONTENT_DESTINATION_LABELS_RU[task.contentDestination]
                : '—'}
            </Fact>
            <Fact label="Продакшн">
              {task.contentProductionStatus
                ? CONTENT_PRODUCTION_LABELS_RU[task.contentProductionStatus]
                : '—'}
            </Fact>
            {mediaVolume ? (
              <Fact label="Объем" tabular>
                {mediaVolume}
              </Fact>
            ) : null}
          </>
        ) : null}
      </dl>
    </div>
  );
}

export function CustomFactsPanel({ task, moneyText }: { task: TaskDto; moneyText: string | null }) {
  const contentKind = resolvedCustomContentKind(task);
  const contentMetric = formatCustomContentMetric(task);
  const buyerLabel = task.buyerHandle
    ? task.buyerDisplayName
      ? `${task.buyerDisplayName} · ${task.buyerHandle}`
      : task.buyerHandle
    : null;
  return (
    <section
      className="panel"
      aria-labelledby="custom-facts-heading"
      style={{ marginBottom: '1.5rem', display: 'grid', gap: '0.75rem' }}
    >
      <h2 id="custom-facts-heading" className="eyebrow" style={{ margin: 0 }}>
        Деньги и покупатель
      </h2>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem 1.25rem',
          margin: 0,
        }}
      >
        {moneyText ? (
          <Fact label="Сумма" tabular>
            {moneyText}
          </Fact>
        ) : null}
        <Fact label="Формат">{customContentKindLabel(contentKind)}</Fact>
        {task.platform ? <Fact label="Платформа">{task.platform}</Fact> : null}
        {buyerLabel ? <Fact label="Покупатель">{buyerLabel}</Fact> : null}
        {contentMetric ? (
          <Fact label={contentKind === 'photo' ? 'Количество' : 'Длительность'} tabular>
            {contentMetric}
          </Fact>
        ) : null}
      </dl>
    </section>
  );
}
