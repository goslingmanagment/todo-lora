'use client';

import { summarizePayload, translateEventType } from './_primitives';
import type { EventDto } from './_types';

export function AuditLog({ events }: { events: EventDto[] }) {
  return (
    <details className="panel-soft">
      <summary
        className="eyebrow"
        style={{ cursor: 'pointer', listStyle: 'none', padding: '0.05rem 0.1rem' }}
      >
        История · {events.length}
      </summary>
      <ol style={{ marginTop: '0.75rem', paddingLeft: '1rem', display: 'grid', gap: '0.4rem' }}>
        {events.map((e) => (
          <li key={e.id} style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>
            <span className="muted-2 tabular" style={{ marginRight: '0.4rem' }}>
              {new Date(e.createdAtIso).toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
              })}
            </span>
            <strong style={{ fontWeight: 500 }}>{e.actorName}</strong>{' '}
            — {translateEventType(e.eventType)}
            {e.payload && Object.keys(e.payload).length > 0 ? (
              <span className="muted-2" style={{ marginLeft: '0.3rem' }}>
                {summarizePayload(e.payload)}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
