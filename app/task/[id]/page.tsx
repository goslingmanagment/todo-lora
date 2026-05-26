import { notFound, redirect } from 'next/navigation';
import { getCurrentAuth } from '@/lib/auth/session';
import { Header } from '@/components/Header';
import { TaskDetail } from './TaskDetail';
import { getHeaderMetrics } from '@/lib/server/feed';
import { RealtimeRefresh } from '@/components/RealtimeRefresh';
import { getTaskDetailData } from '@/lib/server/task-detail';

export const dynamic = 'force-dynamic';

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentAuth();
  if (!auth) redirect('/login');
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [detail, metrics] = await Promise.all([getTaskDetailData(id), getHeaderMetrics()]);
  if (!detail) notFound();
  const { task } = detail;

  return (
    <>
      <Header
        userName={auth.user.displayName}
        outstandingDollars={Math.round(metrics.outstandingCustomCents / 100)}
      />
      <RealtimeRefresh taskId={task.id} />
      <main className="app-shell" id="main">
        <TaskDetail
          task={{
            ...task,
            version: task.version,
            updatedAtIso: task.updatedAt.toISOString(),
            createdAtIso: task.createdAt.toISOString(),
            deadlineOn: task.deadlineOn,
            lastEditedBy: task.lastEditedBy,
          }}
          topic={detail.topic}
          allTopics={detail.allTopics}
          users={detail.allUsers}
          attachments={detail.attachments.map((a) => ({
            id: a.id,
            kind: a.kind,
            url: a.url,
            previewUrl: a.previewUrl,
            mimeType: a.mimeType,
            originalName: a.originalName,
            caption: a.caption,
          }))}
          events={detail.events.map((e) => ({
            id: e.id,
            eventType: e.eventType,
            payload: e.payload as Record<string, unknown> | null,
            createdAtIso: e.createdAt.toISOString(),
            actorName: e.actorName ?? '—',
          }))}
        />
      </main>
    </>
  );
}

function isUuid(s: string) {
  return /^[0-9a-f-]{36}$/i.test(s);
}
