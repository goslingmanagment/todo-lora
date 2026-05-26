import Link from 'next/link';
import type { Task } from '@/drizzle/schema';
import { formatCustomContentMetric, formatMediaVolume } from '@/lib/format/customContent';
import { formatMoneyDisplay } from '@/lib/format/money';
import { CONTENT_DESTINATION_LABELS_RU } from '@/lib/domain/contentDestination';
import { CONTENT_PRODUCTION_LABELS_RU } from '@/lib/domain/contentProduction';
import { AGREEMENT_LABELS_RU, STATUS_LABELS_RU, TYPE_LABELS_RU } from '@/lib/fsm/taskStatus';
import { PriorityDot } from './PriorityDot';
import { DeadlineChip } from './DeadlineChip';

export function TaskCard({
  task,
  todayIso,
  highlight,
  variant = 'default',
}: {
  task: Task;
  todayIso: string;
  highlight?: boolean;
  variant?: 'default' | 'compact';
}) {
  const isCustom = task.type === 'custom';
  const money = isCustom
    ? formatMoneyDisplay({
        paymentModel: task.paymentModel,
        amountCents: task.amountCents,
        amountCollectedCents: task.amountCollectedCents,
      })
    : null;
  const compact = variant === 'compact';
  const cardClass = [
    'card',
    compact ? 'card-compact' : null,
    isCustom ? 'card-customs' : null,
    highlight ? 'flash' : null,
  ]
    .filter(Boolean)
    .join(' ');
  const titleSize = compact ? '0.98rem' : '1.15rem';
  const dotPad = compact ? '0.3rem' : '0.45rem';

  return (
    <Link href={`/task/${task.id}`} className="task-card-link" prefetch={true}>
      <article className={cardClass} aria-label={task.title}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem' }}>
          <span style={{ paddingTop: dotPad }}>
            <PriorityDot priority={task.priority} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '0.6rem',
                flexWrap: 'wrap',
              }}
            >
              <h3
                className={compact ? 'card-title' : undefined}
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: titleSize,
                  fontWeight: 600,
                  margin: 0,
                  lineHeight: 1.25,
                  letterSpacing: '-0.015em',
                  wordBreak: 'break-word',
                  flex: '1 1 auto',
                  minWidth: 0,
                }}
              >
                {task.title}
              </h3>
              <DeadlineChip deadline={task.deadlineOn} todayIso={todayIso} />
            </div>

            {isCustom ? <CustomMeta task={task} money={money} /> : <NonCustomMeta task={task} />}

            {task.description && !compact ? (
              <p
                className="muted line-clamp-2"
                style={{ margin: '0.55rem 0 0', fontSize: '0.875rem', lineHeight: 1.5 }}
              >
                {task.description}
              </p>
            ) : null}
          </div>
        </div>
      </article>
    </Link>
  );
}

function CustomMeta({ task, money }: { task: Task; money: string | null }) {
  const buyerLabel = task.buyerHandle
    ? task.buyerDisplayName
      ? `${task.buyerDisplayName} · ${task.buyerHandle}`
      : task.buyerHandle
    : null;

  // `confirmed` + `done|delivered` paints two green chips next to each other
  // with no new information — the status chip already reads as the happy path.
  // We only keep the agreement chip when it carries an action the operator
  // still needs to take (pending or rejected).
  const showAgreement = task.agreementState != null && task.agreementState !== 'confirmed';
  const contentMetric = formatCustomContentMetric(task);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.4rem 0.55rem',
        marginTop: '0.5rem',
        fontSize: '0.85rem',
      }}
    >
      {money ? (
        <span className="tabular" style={{ color: 'var(--color-ink-2)', fontWeight: 500 }}>
          {money}
        </span>
      ) : null}
      {buyerLabel ? <span className="muted">{buyerLabel}</span> : null}
      {task.platform ? (
        <span className="muted-2" style={{ fontSize: '0.78rem' }}>
          · {task.platform}
        </span>
      ) : null}
      {contentMetric ? (
        <span className="muted-2" style={{ fontSize: '0.78rem' }}>
          · {contentMetric}
        </span>
      ) : null}
      {showAgreement ? (
        <span className={agreementChipClass(task.agreementState!)}>
          {AGREEMENT_LABELS_RU[task.agreementState!]}
        </span>
      ) : null}
      <span className={statusChipClass(task.status)}>{STATUS_LABELS_RU[task.status]}</span>
    </div>
  );
}

function NonCustomMeta({ task }: { task: Task }) {
  const volume = formatMediaVolume(task);
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.4rem',
        marginTop: '0.5rem',
        fontSize: '0.78rem',
      }}
    >
      <span className="muted-2">{TYPE_LABELS_RU[task.type]}</span>
      {task.contentDestination ? (
        <span className="muted-2">· {CONTENT_DESTINATION_LABELS_RU[task.contentDestination]}</span>
      ) : null}
      {volume ? <span className="muted-2">· {volume}</span> : null}
      {task.contentProductionStatus ? (
        <span className="chip chip-outline chip-gray">
          {CONTENT_PRODUCTION_LABELS_RU[task.contentProductionStatus]}
        </span>
      ) : null}
      <span className={statusChipClass(task.status)}>{STATUS_LABELS_RU[task.status]}</span>
    </div>
  );
}

// Map status → chip color. `draft` is intentionally lower-contrast than other
// chips so a fresh card doesn't dominate scan order, but it's still always
// visible — without it, a Custom that's "Черновик" looks identical to one
// that's "В работе".
function statusChipClass(status: Task['status']): string {
  if (status === 'in_progress') return 'chip chip-amber';
  if (status === 'done') return 'chip chip-green';
  if (status === 'delivered') return 'chip chip-green';
  if (status === 'cancelled') return 'chip chip-gray';
  return 'chip chip-draft'; // 'draft'
}

function agreementChipClass(s: 'pending' | 'confirmed' | 'rejected'): string {
  if (s === 'confirmed') return 'chip chip-green chip-outline';
  if (s === 'rejected') return 'chip chip-red chip-outline';
  return 'chip chip-amber chip-outline';
}
