'use client';

// Bulk control for the per-topic <details> sections. CollapsibleDetails
// persists each topic's open/closed state under `topic-collapsed:<slug>` and
// re-reads it via a manually-dispatched StorageEvent — we write the same key
// for every visible topic and dispatch the same event so each section picks
// up the new state without a route refresh.
export function TopicCollapseControls({ slugs }: { slugs: string[] }) {
  const setAll = (open: boolean) => {
    for (const slug of slugs) {
      const key = `topic-collapsed:${slug}`;
      try {
        window.localStorage.setItem(key, open ? '1' : '0');
        window.dispatchEvent(new StorageEvent('storage', { key }));
      } catch {
        // ignore quota / private-mode failures
      }
    }
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        gap: '0.4rem',
        marginLeft: 'auto',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => setAll(true)}
        style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
      >
        Развернуть всё
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => setAll(false)}
        style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
      >
        Свернуть всё
      </button>
    </div>
  );
}
