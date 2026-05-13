import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, SESSION_TTL_MS, sessionCookieOptions } from '@/lib/auth/cookie-config';

const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/health',
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/realtime') /* SSE handler does its own auth */ ||
    PUBLIC_PATHS.has(pathname)
  ) {
    return NextResponse.next();
  }

  // We deliberately don't validate the session here — the cookie's HMAC is
  // checked in route handlers / pages via `getCurrentAuth()`. This middleware
  // only redirects unauthenticated browsers away from app pages so that the
  // /login bounce is fast.
  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Rolling refresh of the cookie's `expires` attribute. RSC cannot write
  // cookies, so this is the one place where active users get their session
  // window extended. HMAC isn't verified here — `getCurrentAuth()` rejects
  // tampered cookies at the page/route level.
  const response = NextResponse.next();
  response.cookies.set(
    COOKIE_NAME,
    cookie.value,
    sessionCookieOptions(new Date(Date.now() + SESSION_TTL_MS)),
  );
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
