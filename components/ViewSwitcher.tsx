'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import type { FilterValue, ViewValue } from '@/lib/validation/schemas';
import { buildFeedHref } from '@/lib/feed/url';

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
} as const;

const ICONS: Record<ViewValue, ReactNode> = {
  grid: (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="1.5" y="2.5" width="5" height="11" rx="1" />
      <rect x="9.5" y="2.5" width="5" height="11" rx="1" />
    </svg>
  ),
  kanban: (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="1.5" y="2.5" width="3.5" height="11" rx="0.8" />
      <rect x="6.25" y="2.5" width="3.5" height="7" rx="0.8" />
      <rect x="11" y="2.5" width="3.5" height="9" rx="0.8" />
    </svg>
  ),
  sidebar: (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <line x1="6" y1="2.5" x2="6" y2="13.5" />
    </svg>
  ),
  cockpit: (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <line x1="8" y1="2.5" x2="8" y2="13.5" />
      <line x1="1.5" y1="8" x2="14.5" y2="8" />
    </svg>
  ),
  calendar: (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="1.5" y="3.5" width="13" height="10" rx="1" />
      <line x1="1.5" y1="6.5" x2="14.5" y2="6.5" />
      <line x1="5" y1="1.8" x2="5" y2="4.2" strokeLinecap="round" />
      <line x1="11" y1="1.8" x2="11" y2="4.2" strokeLinecap="round" />
    </svg>
  ),
};

const VIEWS: Array<{ key: ViewValue; label: string }> = [
  { key: 'grid', label: '2 колонки' },
  { key: 'kanban', label: 'Канбан' },
  { key: 'sidebar', label: 'Сайдбар' },
  { key: 'cockpit', label: 'Командный центр' },
  { key: 'calendar', label: 'Календарь' },
];

export function ViewSwitcher({
  active,
  filter,
  urgent,
  search,
  topic,
}: {
  active: ViewValue;
  filter: FilterValue;
  urgent: boolean;
  search?: string;
  topic?: string;
}) {
  const buildHref = (next: ViewValue) =>
    buildFeedHref({ view: next, filter, urgent, search, topic });

  const activeLabel = VIEWS.find((v) => v.key === active)?.label ?? '2 колонки';
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (!el?.open) return;
      if (!el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Close on navigation (active view changed via menu).
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [active]);

  const closeMenu = () => {
    if (ref.current) ref.current.open = false;
  };

  return (
    <details ref={ref} className="view-dropdown">
      <summary className="view-dropdown-trigger" aria-label="Сменить вид ленты">
        <span className="view-dropdown-icon">{ICONS[active]}</span>
        <span className="view-dropdown-key">Вид:</span>
        <span className="view-dropdown-value">{activeLabel}</span>
        <span className="view-dropdown-chev" aria-hidden>
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </span>
      </summary>
      <div className="view-dropdown-menu">
        {VIEWS.map((v) => {
          const isActive = v.key === active;
          return (
            <Link
              key={v.key}
              href={buildHref(v.key)}
              aria-current={isActive ? 'page' : undefined}
              prefetch={false}
              className="view-dropdown-item"
              onClick={closeMenu}
            >
              <span className="view-dropdown-icon">{ICONS[v.key]}</span>
              <span>{v.label}</span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}
