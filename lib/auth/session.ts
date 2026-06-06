/**
 * Session management — Postgres-backed sessions, signed http-only cookies.
 *
 * Schema is Better-Auth-compatible (table `sessions` with `id`/`token`/`user_id`/
 * `expires_at`) so we can swap in Better-Auth's auth-handler later if/when the
 * team needs additional auth methods. For now the code-based login is direct.
 */
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users, type Session, type User } from '@/drizzle/schema/auth';
import { getConfig } from '@/lib/env';
import { COOKIE_NAME, SESSION_TTL_MS, sessionCookieOptions } from './cookie-config';

const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

type HeaderGetter = Pick<Headers, 'get'>;

export type SessionUser = Pick<User, 'id' | 'displayName' | 'name' | 'email' | 'disabledAt'>;

export type AuthContext = {
  user: SessionUser;
  session: Session;
};

function signSessionToken(rawId: string): string {
  const secret = getConfig().betterAuthSecret;
  const sig = createHmac('sha256', secret).update(rawId).digest('base64url');
  return `${rawId}.${sig}`;
}

function verifySessionToken(token: string): string | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const rawId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', getConfig().betterAuthSecret)
    .update(rawId)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? rawId : null;
}

function newSessionId(): string {
  return randomBytes(24).toString('base64url');
}

export async function createSessionFor(
  userId: string,
  request?: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; session: Session }> {
  const id = newSessionId();
  const token = signSessionToken(id);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const [session] = await db
    .insert(sessions)
    .values({
      id,
      userId,
      token: id,
      expiresAt,
      ipAddress: request?.ip ?? null,
      userAgent: request?.userAgent ?? null,
    })
    .returning();
  if (!session) throw new Error('Could not create session');
  await setSessionCookie(token, expiresAt);
  return { token, session };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, sessionCookieOptions(expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getCurrentAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  if (!cookie) return null;
  const sessionId = verifySessionToken(cookie.value);
  if (!sessionId) return null;

  const now = new Date();
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now), isNull(users.disabledAt)))
    .limit(1);

  const found = rows[0];
  if (!found) return null;

  // Rolling refresh of the DB-side expiry. The cookie's expires attribute is
  // refreshed in middleware (Edge runtime can write cookies; RSC cannot).
  const updatedAt = found.session.updatedAt ?? found.session.createdAt;
  if (updatedAt && now.getTime() - new Date(updatedAt).getTime() > SESSION_REFRESH_AFTER_MS) {
    const newExpiry = new Date(now.getTime() + SESSION_TTL_MS);
    await db
      .update(sessions)
      .set({ expiresAt: newExpiry, updatedAt: now })
      .where(eq(sessions.id, sessionId));
  }

  return {
    user: {
      id: found.user.id,
      displayName: found.user.displayName,
      name: found.user.name,
      email: found.user.email,
      disabledAt: found.user.disabledAt,
    },
    session: found.session,
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getCurrentAuth();
  if (!ctx) throw new AuthRequiredError();
  return ctx;
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME);
  if (cookie) {
    const id = verifySessionToken(cookie.value);
    if (id) {
      await db.delete(sessions).where(eq(sessions.id, id));
    }
  }
  await clearSessionCookie();
}

export async function invalidateAllSessionsFor(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function getRequestIp(): Promise<string> {
  const h = await headers();
  return deriveRequestIp(h);
}

export function deriveRequestIp(h: HeaderGetter): string {
  const realIp = h.get('x-real-ip')?.trim();
  if (realIp && isIP(realIp)) return realIp;

  // Do not use X-Forwarded-For for rate limiting here: without an explicitly
  // trusted edge proxy, clients can choose the leading value themselves.
  return 'local';
}

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

export const __cookieName = COOKIE_NAME;
export const __ttlMs = SESSION_TTL_MS;
export const __sign = signSessionToken;
export const __verify = verifySessionToken;
