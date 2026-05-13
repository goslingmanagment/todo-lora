const FALLBACK_PATH = '/';
const APP_ORIGIN = 'http://todo-lora.local';

export function sanitizeLoginNext(value: unknown, fallback = FALLBACK_PATH): string {
  if (typeof value !== 'string') return fallback;
  const raw = value.trim();
  if (raw.length === 0) return fallback;
  if (!raw.startsWith('/')) return fallback;

  const decoded = decodeForValidation(raw);
  if (!decoded) return fallback;
  for (const candidate of [raw, decoded]) {
    if (!isSafeAppRelativePath(candidate)) return fallback;
  }

  try {
    const url = new URL(raw, APP_ORIGIN);
    if (url.origin !== APP_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function decodeForValidation(value: string): string | null {
  let decoded = value;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch {
      return null;
    }
  }
  return decoded;
}

function isSafeAppRelativePath(value: string): boolean {
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value, APP_ORIGIN);
    return url.origin === APP_ORIGIN;
  } catch {
    return false;
  }
}
