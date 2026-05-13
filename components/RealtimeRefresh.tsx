'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

type TaskEventPayload = {
  taskId?: string;
  topicId?: string | null;
  reason?: string;
  at?: number;
};

/**
 * Client mounts an `EventSource` to /api/realtime/feed.
 *
 * - Feed pages mount this without `taskId` and refresh on every event.
 * - Detail pages pass `taskId` so unrelated events do not trigger a refresh
 *   (per brief P0.2 acceptance: editing task B should not refresh a window
 *   showing task A).
 *
 * On focus / SSE reconnect we always do one defensive refresh because we may
 * have missed events while the tab was away (§9.2).
 */
export function RealtimeRefresh({
  debounceMs = 350,
  taskId,
}: {
  debounceMs?: number;
  /** When set, only events for this task trigger a router.refresh(). */
  taskId?: string;
}) {
  const router = useRouter();
  const lastRefresh = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskIdRef = useRef(taskId);
  useEffect(() => {
    taskIdRef.current = taskId;
  }, [taskId]);

  const trigger = () => {
    const now = Date.now();
    const sinceLast = now - lastRefresh.current;
    if (sinceLast >= debounceMs) {
      lastRefresh.current = now;
      router.refresh();
      return;
    }
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      lastRefresh.current = Date.now();
      router.refresh();
    }, debounceMs - sinceLast);
  };

  useEffect(() => {
    let es: EventSource | null = null;
    let backoff = 1000;
    let cancelled = false;

    const onTask = (e: MessageEvent) => {
      const scopeId = taskIdRef.current;
      if (!scopeId) {
        trigger();
        return;
      }
      let payload: TaskEventPayload | null = null;
      try {
        payload = JSON.parse(e.data) as TaskEventPayload;
      } catch {
        // Malformed payload — fall through and refresh to stay correct.
        trigger();
        return;
      }
      if (payload.taskId === scopeId) trigger();
    };

    const connect = () => {
      if (cancelled) return;
      es = new EventSource('/api/realtime/feed');
      es.addEventListener('open', () => {
        backoff = 1000;
      });
      es.addEventListener('task', onTask);
      es.addEventListener('error', () => {
        es?.close();
        if (cancelled) return;
        const wait = Math.min(backoff, 15_000);
        backoff = Math.min(backoff * 2, 15_000);
        setTimeout(() => {
          // Reconnect with a defensive refresh — we may have missed events.
          trigger();
          connect();
        }, wait);
      });
    };

    connect();

    const onFocus = () => trigger();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      es?.close();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (pending.current) clearTimeout(pending.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
