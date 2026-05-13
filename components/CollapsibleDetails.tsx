'use client';

import {
  useCallback,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';

function subscribeToStorage(callback: () => void): () => void {
  // Storage events only fire from *other* tabs, but subscribing keeps the
  // value in sync if the user collapses the same section in another tab.
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function CollapsibleDetails({
  storageKey,
  defaultOpen = true,
  className,
  style,
  children,
}: {
  storageKey: string;
  defaultOpen?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);

  // On the server (and on the first client render before hydration completes)
  // we return null so the section renders with `defaultOpen` — matching SSR
  // output and avoiding a hydration mismatch. After hydration, useSyncExternalStore
  // re-reads from localStorage and may collapse the section.
  const stored = useSyncExternalStore(subscribeToStorage, getSnapshot, () => null);
  const open = stored === null ? defaultOpen : stored !== '0';

  return (
    <details
      open={open}
      onToggle={(e) => {
        try {
          window.localStorage.setItem(storageKey, e.currentTarget.open ? '1' : '0');
          // Manually dispatch a storage event so useSyncExternalStore re-reads
          // — same-tab writes don't fire the native `storage` event.
          window.dispatchEvent(new StorageEvent('storage', { key: storageKey }));
        } catch {
          // Persistence failed (quota, private mode) — current session still toggles via the DOM.
        }
      }}
      className={className}
      style={style}
    >
      {children}
    </details>
  );
}
