/**
 * Server-side login flow. Iterates over active users and verifies the
 * submitted code in constant time per user. For 5 users this is trivially
 * fast (§8.1).
 */
import { eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/drizzle/schema/auth';
import { verifyLoginCode } from '@/lib/auth/codes';
import { createSessionFor, getRequestIp } from '@/lib/auth/session';
import { checkRateLimit, recordFailure, recordSuccess } from '@/lib/auth/rate-limit';
import { headers } from 'next/headers';

export type LoginOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'rate_limited'; retryAfterMs?: number };

export async function attemptLogin(rawCode: string): Promise<LoginOutcome> {
  const ip = await getRequestIp();
  const decision = checkRateLimit(ip);
  if (!decision.ok) {
    return { ok: false, reason: 'rate_limited', retryAfterMs: decision.retryAfterMs };
  }

  const code = rawCode.trim();
  if (code.length === 0) {
    recordFailure(ip);
    return { ok: false, reason: 'invalid' };
  }

  const candidates = await db
    .select({ id: users.id, hash: users.loginCodeHash })
    .from(users)
    .where(isNull(users.disabledAt));

  let matchedId: string | null = null;
  for (const c of candidates) {
    if (!c.hash) continue;
    const ok = await verifyLoginCode(code, c.hash);
    if (ok && !matchedId) matchedId = c.id;
    // Iterate fully to give consistent timing across user counts.
  }

  if (!matchedId) {
    recordFailure(ip);
    return { ok: false, reason: 'invalid' };
  }

  recordSuccess(ip);
  const ua = (await headers()).get('user-agent');
  await createSessionFor(matchedId, { ip, userAgent: ua });
  return { ok: true, userId: matchedId };
}

export async function getLoginUserById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).limit(1);
}
