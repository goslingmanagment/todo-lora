'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { clearDemoDataAction, seedDemoDataAction } from '@/lib/server/actions';
import { showToast } from '@/components/Toaster';

type PendingAction = 'seed' | 'clear' | null;

export function DemoDataControls({ demoTaskCount }: { demoTaskCount: number }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();
  const busy = isPending || pendingAction !== null;

  const seedDemo = () => {
    setPendingAction('seed');
    startTransition(async () => {
      try {
        const result = await seedDemoDataAction();
        if (!result.ok) {
          showToast(result.error, { tone: 'error' });
          return;
        }
        if (result.data.inserted > 0) {
          showToast(`Добавлено демо-задач: ${result.data.inserted}`);
        } else {
          showToast(`Демо уже загружено: ${result.data.existing}`);
        }
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  };

  const clearDemo = () => {
    if (demoTaskCount > 0 && !window.confirm('Удалить демо-задачи?')) return;

    setPendingAction('clear');
    startTransition(async () => {
      try {
        const result = await clearDemoDataAction();
        if (!result.ok) {
          showToast(result.error, { tone: 'error' });
          return;
        }
        showToast(
          result.data.deleted > 0 ? `Удалено демо-задач: ${result.data.deleted}` : 'Демо-задач нет',
        );
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  };

  return (
    <details
      aria-label="Тестовые данные"
      style={{
        fontSize: '0.78rem',
        color: 'var(--color-ink-4)',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.25rem 0.45rem',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid transparent',
        }}
      >
        Демо
        {demoTaskCount > 0 ? <span className="tabular">({demoTaskCount})</span> : null}
      </summary>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: '0.35rem',
          marginTop: '0.35rem',
        }}
      >
        <button
          type="button"
          className="btn btn-primary"
          onClick={seedDemo}
          disabled={busy}
          style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
        >
          {pendingAction === 'seed' ? 'Заполняю...' : 'Заполнить'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={clearDemo}
          disabled={busy || demoTaskCount === 0}
          style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
        >
          {pendingAction === 'clear' ? 'Очищаю...' : 'Очистить'}
        </button>
      </div>
    </details>
  );
}
