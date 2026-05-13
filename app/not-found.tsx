import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      className="app-shell"
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.85rem',
            fontWeight: 500,
            margin: '0 0 0.6rem',
          }}
        >
          Страница не найдена.
        </h1>
        <p className="muted" style={{ margin: '0 0 1.5rem' }}>
          Такой задачи нет или её удалили.
        </p>
        <Link href="/" className="btn">
          На главную
        </Link>
      </div>
    </main>
  );
}
