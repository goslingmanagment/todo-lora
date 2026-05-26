import { redirect } from 'next/navigation';
import { getCurrentAuth } from '@/lib/auth/session';
import { Header } from '@/components/Header';
import { NewTaskForm } from './NewTaskForm';
import { getHeaderMetrics } from '@/lib/server/feed';
import { getNewTaskPreferences } from '@/lib/server/preferences';
import { listActiveTopics } from '@/lib/server/lookups';

export const dynamic = 'force-dynamic';

export default async function NewTaskPage() {
  const auth = await getCurrentAuth();
  if (!auth) redirect('/login');

  const [topicRows, metrics, preferences] = await Promise.all([
    listActiveTopics(),
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
        {/* h1 kept for accessibility / page hierarchy; the visible label is
            already in the sticky banner above (Header component), so the page
            heading itself is sr-only to keep the form above the fold. */}
        <h1 className="sr-only">Новая ТЗ</h1>
        <NewTaskForm topics={topicRows} preferences={preferences} />
      </main>
    </>
  );
}
