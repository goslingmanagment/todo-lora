import { redirect } from 'next/navigation';
import { getCurrentAuth } from '@/lib/auth/session';
import { Header } from '@/components/Header';
import { NewTaskForm } from './NewTaskForm';
import { getHeaderMetrics } from '@/lib/server/feed';
import { getNewTaskPreferences } from '@/lib/server/preferences';
import { listActiveTopics, listActiveUserOptions } from '@/lib/server/lookups';

export const dynamic = 'force-dynamic';

export default async function NewTaskPage() {
  const auth = await getCurrentAuth();
  if (!auth) redirect('/login');

  const [topicRows, userRows, metrics, preferences] = await Promise.all([
    listActiveTopics(),
    listActiveUserOptions(),
    getHeaderMetrics(),
    getNewTaskPreferences(auth.user.id),
  ]);

  return (
    <>
      <Header
        userName={auth.user.displayName}
        outstandingDollars={Math.round(metrics.outstandingCustomCents / 100)}
        subtitle="Новая ТЗ"
        showOutstanding={false}
        showCreate={false}
      />
      <main className="app-shell" id="main">
        <header
          style={{
            paddingBottom: '1rem',
            marginBottom: '1.25rem',
            borderBottom: '1px solid var(--color-line)',
          }}
        >
          <p className="eyebrow" style={{ margin: 0 }}>
            Создатель · {auth.user.displayName}
          </p>
          <h1
            className="section-title"
            style={{
              fontSize: '1.85rem',
              margin: '0.25rem 0 0',
              fontWeight: 500,
            }}
          >
            Новая ТЗ
          </h1>
        </header>
        <NewTaskForm
          topics={topicRows}
          users={userRows}
          currentUserId={auth.user.id}
          preferences={preferences}
        />
      </main>
    </>
  );
}
