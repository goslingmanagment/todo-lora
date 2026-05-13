import Link from 'next/link';
import { logoutAction } from '@/lib/server/actions';

// Six terracotta/cream-adjacent muted tones. Keeps the dot inside the
// Anthropic/Claude palette family (§6.9) — no neon, no high-saturation.
const USER_DOT_PALETTE = [
  '#b56b4c',
  '#c8a26a',
  '#8a8472',
  '#9b6f6b',
  '#6e8273',
  '#7d6f96',
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function UserDot({ name }: { name: string }) {
  const color = USER_DOT_PALETTE[hashName(name) % USER_DOT_PALETTE.length];
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '0.55rem',
        height: '0.55rem',
        borderRadius: '50%',
        background: color,
        border: '1px solid color-mix(in srgb, var(--color-ink) 25%, transparent)',
        flex: '0 0 auto',
      }}
    />
  );
}

export function Header({
  userName,
  outstandingDollars,
  subtitle,
  showOutstanding = true,
  showCreate = true,
}: {
  userName: string;
  outstandingDollars: number;
  subtitle?: string;
  showOutstanding?: boolean;
  showCreate?: boolean;
}) {
  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: 'color-mix(in srgb, var(--color-paper) 88%, transparent)',
          backdropFilter: 'saturate(150%) blur(6px)',
          WebkitBackdropFilter: 'saturate(150%) blur(6px)',
          borderBottom: '1px solid var(--color-line)',
        }}
      >
        <div
          className="app-shell"
          style={{
            paddingTop: '0.6rem',
            paddingBottom: '0.6rem',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem 0.85rem',
          }}
        >
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 500,
              fontSize: '1.4rem',
              color: 'var(--color-ink)',
              textDecoration: 'none',
              letterSpacing: '-0.015em',
              lineHeight: 1,
            }}
          >
            todo-lora
          </Link>
          <span
            className="muted-2"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.78rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {subtitle ? <>{subtitle} · </> : null}
            <UserDot name={userName} />
            {userName}
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0 }} aria-hidden="true" />
          {showOutstanding && outstandingDollars > 0 ? (
            <span
              className="chip chip-amber tabular"
              title="Сумма ожидаемой оплаты по Customs, которые ещё требуют внимания"
            >
              ожидается ${outstandingDollars.toLocaleString('en-US')}
            </span>
          ) : null}
          {showCreate ? (
            <Link
              href="/new"
              className="btn btn-primary hide-on-mobile"
              prefetch={true}
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
            >
              + Новая ТЗ
            </Link>
          ) : null}
          <form action={logoutAction}>
            <button
              type="submit"
              className="btn btn-quiet"
              aria-label="Выйти"
              style={{ padding: '0.4rem 0.7rem', fontSize: '0.85rem' }}
            >
              Выйти
            </button>
          </form>
        </div>
      </header>
      {showCreate ? (
        <Link
          href="/new"
          className="fab"
          prefetch={true}
          aria-label="Создать новую задачу"
        >
          + Новая ТЗ
        </Link>
      ) : null}
    </>
  );
}
