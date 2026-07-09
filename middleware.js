// middleware.js — protect all app routes behind a password check
import { NextResponse } from 'next/server';

const VALID_AUTH_HASH = process.env.AUTH_HASH || '';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public paths without auth
  const PUBLIC_PREFIXES = ['/login', '/api/login', '/data/', '/_next/', '/favicon.ico'];
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get('auth_token')?.value;

  // If no password is configured, allow all access
  if (!VALID_AUTH_HASH) {
    return NextResponse.next();
  }

  if (!cookie || cookie !== VALID_AUTH_HASH) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico|data).*)',
};
