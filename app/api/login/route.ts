// @ts-nocheck
// POST /api/login — validate password, create signed session cookie
import { NextResponse } from 'next/server';
import { randomUUID, createHmac } from 'node:crypto';

const PASSWORD = process.env.PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

/**
 * Create a signed session cookie.
 * Format: `sessionId.timestamp.signature`
 */
function signSession(sessionId) {
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', SESSION_SECRET)
    .update(`${sessionId}.${timestamp}`)
    .digest('hex');
  return `${sessionId}.${timestamp}.${signature}`;
}

export async function POST(request) {
  try {
    const { password } = await request.json();

    if (!PASSWORD) {
      return NextResponse.json({ error: 'Not configured' }, { status: 500 });
    }

    if (password !== PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Generate a unique session ID and sign it
    const sessionId = randomUUID();
    const signedToken = signSession(sessionId);

    const response = NextResponse.json({ ok: true });
    response.cookies.set('auth_token', signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (err) {
    console.error('[api/login]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
