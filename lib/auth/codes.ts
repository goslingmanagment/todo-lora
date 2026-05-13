/**
 * Login code utilities — argon2id hashing + constant-time matching.
 *
 * Codes are short URL-safe strings shown ONCE at provisioning time
 * (§8.1 / §8.2). Only the hash is stored.
 */
import { hash, verify } from '@node-rs/argon2';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a fresh login code. Default 10 chars, no easily-confused glyphs.
 */
export function generateLoginCode(length = 10): string {
  const buf = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[buf[i]! % ALPHABET.length];
  }
  return out;
}

const argonOpts = {
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashLoginCode(code: string): Promise<string> {
  return hash(code, argonOpts);
}

export async function verifyLoginCode(code: string, storedHash: string): Promise<boolean> {
  try {
    return await verify(storedHash, code);
  } catch {
    return false;
  }
}

/** Constant-time equality guard for opaque tokens. */
export function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
