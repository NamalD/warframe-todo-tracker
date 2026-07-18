// middleware.js — protect all app routes behind a password check
// Runs on the Edge runtime: use Web Crypto, not node:crypto.
import { NextResponse } from 'next/server';

const PASSWORD = process.env.PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

function hexToBytes(hex) {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Verify a signed session cookie.
 * Cookie format: `sessionId.timestamp.signature`
 * Signature = HMAC-SHA256(sessionId + '.' + timestamp, SESSION_SECRET)
 */
async function verifySession(cookie) {
  if (!cookie || !SESSION_SECRET) return null;

  const parts = cookie.split('.');
  if (parts.length !== 3) return null;

  const [sessionId, timestamp, signature] = parts;

  // Check expiry (30 days from timestamp)
  const issued = parseInt(timestamp, 10);
  if (isNaN(issued)) return null;
  if (Date.now() - issued > 30 * 24 * 60 * 60 * 1000) return null;

  const signatureBytes = hexToBytes(signature);
  if (!signatureBytes) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(`${sessionId}.${timestamp}`)
  );
  if (!valid) return null;

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
  const session = await verifySession(cookie);

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
