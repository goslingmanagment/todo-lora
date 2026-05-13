import { redirect } from 'next/navigation';
import { getCurrentAuth } from '@/lib/auth/session';
import { sanitizeLoginNext } from '@/lib/auth/redirect';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const auth = await getCurrentAuth();
  if (auth) redirect('/');
  const sp = await searchParams;
  const next = sanitizeLoginNext(sp.next);
  return (
    <main
      className="app-shell"
      style={{
        minHeight: '70vh',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '2.4rem',
            fontWeight: 500,
            letterSpacing: '-0.015em',
            margin: '0 0 0.4rem',
          }}
        >
          todo-lora
        </h1>
        <p className="muted" style={{ margin: '0 0 2rem', fontSize: '0.9rem' }}>
          Внутренний таск-трекер.
        </p>
        <LoginForm next={next} />
        <p
          className="muted-2"
          style={{ marginTop: '2rem', fontSize: '0.78rem' }}
        >
          Код входа выдаёт владелец агентства. Если потеряли — попросите новый.
        </p>
      </div>
    </main>
  );
}
