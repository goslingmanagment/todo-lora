/**
 * Cookie constants shared between session.ts (Node runtime) and middleware.ts
 * (Edge runtime). Kept in its own module so middleware can import without
 * pulling in pg / drizzle.
 */
export const COOKIE_NAME = 'todo_lora_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  expires: Date;
};

export function sessionCookieOptions(expiresAt: Date): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}
