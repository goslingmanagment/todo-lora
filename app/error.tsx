'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
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
          Что-то пошло не так.
        </h1>
        <p className="muted" style={{ margin: '0 0 1.5rem' }}>
          Попробуйте обновить страницу. Если ошибка повторяется, перезапустите сервер.
        </p>
        <button className="btn btn-primary" onClick={() => reset()}>
          Обновить
        </button>
        {process.env.NODE_ENV !== 'production' ? (
          <pre
            className="muted-2"
            style={{
              marginTop: '2rem',
              whiteSpace: 'pre-wrap',
              fontSize: '0.78rem',
              textAlign: 'left',
            }}
          >
            {error.message}
          </pre>
        ) : null}
      </div>
    </main>
  );
}
