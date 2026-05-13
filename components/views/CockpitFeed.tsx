import Link from 'next/link';
import type { Task } from '@/drizzle/schema';
import { diffDaysIso, deadlineState } from '@/lib/format/dates';
import { formatMoneyDisplay } from '@/lib/format/money';
import {
  AGREEMENT_LABELS_RU,
  STATUS_LABELS_RU,
} from '@/lib/fsm/taskStatus';
import { PriorityDot } from '@/components/PriorityDot';
import type { FeedResult } from '@/lib/server/feed';

const HERO_LIMIT = 3;
const COMPACT_LIMIT = 4;

function focusScore(t: Task, todayIso: string): number {
  let score = 0;
  if (t.deadlineOn && t.deadlineOn < todayIso) score -= 1000;
  if (t.priority === 'high') score -= 100;
  else if (t.priority === 'medium') score -= 10;
  score += t.deadlineOn ? diffDaysIso(t.deadlineOn, todayIso) : 9999;
  return score;
}

function topicNameById(feed: FeedResult, topicId: string): string {
  return feed.sections.find((s) => s.topic.id === topicId)?.topic.name ?? '';
}

export function CockpitFeed({
  feed,
  outstandingDollars,
  highlightTaskId,
}: {
  feed: FeedResult;
  outstandingDollars: number;
  highlightTaskId?: string | null;
}) {
  const todayIso = feed.todayIso;
  const allActive = feed.sections.flatMap((s) => s.active);
  const sortedFocus = [...allActive].sort(
    (a, b) => focusScore(a, todayIso) - focusScore(b, todayIso),
  );
  const heroes = sortedFocus.slice(0, HERO_LIMIT);
  const heroIds = new Set(heroes.map((t) => t.id));

  const totals = feed.totals;

  return (
    <>
      <div className="kpi-row">
        <div className="kpi kpi-alert">
          <div className="kpi-label">Просрочено</div>
          <div className="kpi-value tabular">{totals.overdue}</div>
          <div className="kpi-delta">из {totals.active} активных</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Сегодня</div>
          <div className="kpi-value tabular">{totals.todayDue}</div>
          <div className="kpi-delta">{totals.thisWeekDue} на этой неделе</div>
        </div>
        <div className="kpi kpi-money">
          <div className="kpi-label">Ожидается</div>
          <div className="kpi-value tabular">
            ${outstandingDollars.toLocaleString('en-US')}
          </div>
          <div className="kpi-delta">по customs</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Срочные</div>
          <div className="kpi-value tabular">{totals.urgent}</div>
          <div className="kpi-delta">высокий приоритет</div>
        </div>
      </div>

      <div className="cockpit-grid">
        <div>
          <h2 className="cockpit-pane-title">
            В фокусе сейчас
            <span className="lnk">приоритет · дедлайн</span>
          </h2>
          {heroes.length === 0 ? (
            <p className="muted">Ничего срочного.</p>
          ) : (
            <div className="cockpit-hero-list">
              {heroes.map((t) => (
                <HeroCard
                  key={t.id}
                  task={t}
                  todayIso={todayIso}
                  topicName={topicNameById(feed, t.topicId)}
                  highlight={t.id === highlightTaskId}
                />
              ))}
            </div>
          )}
        </div>

        <aside>
          <h2 className="cockpit-pane-title">Сводка по разделам</h2>
          {feed.sections.map((section) => {
            if (section.active.length === 0) return null;
            const remaining = section.active.filter((t) => !heroIds.has(t.id));
            const shown = remaining.slice(0, COMPACT_LIMIT);
            const overflow = remaining.length - shown.length;
            return (
              <div className="cockpit-compact" key={section.topic.id}>
                <header>
                  <h4>{section.topic.name}</h4>
                  <span className="n">{section.active.length}</span>
                </header>
                {shown.length === 0 ? (
                  <p className="muted-2" style={{ fontSize: '0.82rem', margin: 0 }}>
                    Всё в фокусе сверху.
                  </p>
                ) : (
                  shown.map((t) => (
                    <CompactRow
                      key={t.id}
                      task={t}
                      todayIso={todayIso}
                      highlight={t.id === highlightTaskId}
                    />
                  ))
                )}
                {overflow > 0 ? (
                  <div
                    className="muted-2"
                    style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}
                  >
                    + ещё {overflow}
                  </div>
                ) : null}
              </div>
            );
          })}
        </aside>
      </div>
    </>
  );
}

function HeroCard({
  task,
  todayIso,
  topicName,
  highlight,
}: {
  task: Task;
  todayIso: string;
  topicName: string;
  highlight?: boolean;
}) {
  const dl = deadlineState(task.deadlineOn ?? null, todayIso);
  const isOverdue = dl.kind === 'overdue';
  const className = `cockpit-hero${isOverdue ? ' cockpit-hero-urgent' : ''}${
    highlight ? ' flash' : ''
  }`;
  const isCustom = task.type === 'custom';
  const money = isCustom
    ? formatMoneyDisplay({
        paymentModel: task.paymentModel,
        amountCents: task.amountCents,
        amountCollectedCents: task.amountCollectedCents,
      })
    : null;
  const buyerLabel = task.buyerHandle
    ? task.buyerDisplayName
      ? `${task.buyerDisplayName} · ${task.buyerHandle}`
      : task.buyerHandle
    : null;

  return (
    <Link href={`/task/${task.id}`} prefetch={true} className={className}>
      <div className="row1" style={{ marginBottom: '0.4rem' }}>
        <PriorityDot priority={task.priority} />
        {dl.kind !== 'none' ? (
          <span className={dlChipClass(dl.kind)}>{dl.label}</span>
        ) : null}
        <span className="muted-2" style={{ fontSize: '0.78rem' }}>
          {topicName}
        </span>
      </div>
      <h3>{task.title}</h3>
      <div className="row1">
        {money ? (
          <span
            className="tabular"
            style={{ fontWeight: 500, color: 'var(--color-ink-2)' }}
          >
            {money}
          </span>
        ) : null}
        {buyerLabel ? <span className="muted">{buyerLabel}</span> : null}
        {task.platform ? (
          <span className="muted-2" style={{ fontSize: '0.78rem' }}>
            · {task.platform}
          </span>
        ) : null}
        {task.agreementState && task.agreementState !== 'confirmed' ? (
          <span className={agreementChip(task.agreementState)}>
            {AGREEMENT_LABELS_RU[task.agreementState]}
          </span>
        ) : null}
        <span className={statusChip(task.status)}>
          {STATUS_LABELS_RU[task.status]}
        </span>
      </div>
      {task.description ? <p>{task.description}</p> : null}
    </Link>
  );
}

function CompactRow({
  task,
  todayIso,
  highlight,
}: {
  task: Task;
  todayIso: string;
  highlight?: boolean;
}) {
  const dl = deadlineState(task.deadlineOn ?? null, todayIso);
  let dClass = 'd';
  if (dl.kind === 'overdue') dClass = 'd d-red';
  else if (dl.kind === 'imminent') dClass = 'd d-amber';
  return (
    <Link
      href={`/task/${task.id}`}
      prefetch={true}
      className={`cockpit-cl-row${highlight ? ' flash' : ''}`}
    >
      <PriorityDot priority={task.priority} />
      <span className="t">{task.title}</span>
      <span className={dClass}>
        {dl.kind === 'none' ? 'без дедлайна' : dl.label}
      </span>
    </Link>
  );
}

function dlChipClass(kind: 'overdue' | 'imminent' | 'comfortable' | 'none'): string {
  if (kind === 'overdue') return 'chip chip-red';
  if (kind === 'imminent') return 'chip chip-amber';
  return 'chip chip-green';
}

function statusChip(status: Task['status']): string {
  if (status === 'in_progress') return 'chip chip-amber';
  if (status === 'done' || status === 'delivered') return 'chip chip-green';
  if (status === 'cancelled') return 'chip chip-gray';
  return 'chip chip-draft';
}

function agreementChip(s: 'pending' | 'confirmed' | 'rejected'): string {
  if (s === 'confirmed') return 'chip chip-green chip-outline';
  if (s === 'rejected') return 'chip chip-red chip-outline';
  return 'chip chip-amber chip-outline';
}
