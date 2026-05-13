'use client';

import { Fact, LinkifiedText } from './_primitives';
import { formatDateRu } from '@/lib/format/dates';
import type { TaskDto, Topic, UserOption } from './_types';

export function ReadonlyPanel({
  task,
  topic,
  users,
}: {
  task: TaskDto;
  topic: Topic | null;
  users: UserOption[];
}) {
  const requester = users.find((u) => u.id === task.requesterId);
  const assignee = users.find((u) => u.id === task.assigneeId);
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
        <Fact label="Тема">{topic?.name ?? '—'}</Fact>
        <Fact label="Дедлайн" tabular>
          {formatDateRu(task.deadlineOn) ?? '—'}
        </Fact>
        {task.type === 'content_task' ? (
          <>
            <Fact label="Заказчик">{requester?.displayName ?? '—'}</Fact>
            <Fact label="Исполнитель">{assignee?.displayName ?? '—'}</Fact>
          </>
        ) : null}
      </dl>
    </div>
  );
}

export function CustomFactsPanel({
  task,
  moneyText,
}: {
  task: TaskDto;
  moneyText: string | null;
}) {
  const min =
    task.durationMinSeconds != null ? Math.round(task.durationMinSeconds / 60) : null;
  const max =
    task.durationMaxSeconds != null ? Math.round(task.durationMaxSeconds / 60) : null;
  const duration =
    min != null && max != null
      ? min === max ? `${min} мин` : `${min}–${max} мин`
      : min != null ? `${min} мин`
      : max != null ? `${max} мин`
      : null;
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
        {moneyText ? <Fact label="Сумма" tabular>{moneyText}</Fact> : null}
        {task.platform ? <Fact label="Платформа">{task.platform}</Fact> : null}
        {buyerLabel ? <Fact label="Покупатель">{buyerLabel}</Fact> : null}
        {duration ? <Fact label="Длительность" tabular>{duration}</Fact> : null}
      </dl>
    </section>
  );
}
