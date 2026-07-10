// middleware.js — protect all app routes behind a password check
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PASSWORD = process.env.PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

/**
 * Verify a signed session cookie.
 * Cookie format: `sessionId.timestamp.signature`
 * Signature = HMAC-SHA256(sessionId + '.' + timestamp, SESSION_SECRET)
 */
function verifySession(cookie) {
  if (!cookie || !SESSION_SECRET) return null;

  const parts = cookie.split('.');
  if (parts.length !== 3) return null;

  const [sessionId, timestamp, signature] = parts;

  // Check expiry (30 days from timestamp)
  const issued = parseInt(timestamp, 10);
  if (isNaN(issued)) return null;
  if (Date.now() - issued > 30 * 24 * 60 * 60 * 1000) return null;

  // Verify signature
  const expected = createHmac('sha256', SESSION_SECRET)
    .update(`${sessionId}.${timestamp}`)
    .digest('hex');

  try {
    const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return null;
  } catch {
    return null;
  }

  return { sessionId, issued };
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public paths without auth
  const PUBLIC_PREFIXES = ['/login', '/api/login', '/data/', '/_next/', '/favicon.ico'];
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // If no password is configured, allow all access
  if (!PASSWORD) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get('auth_token')?.value;
  const session = verifySession(cookie);

  if (!session) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico|data).*)',
};
