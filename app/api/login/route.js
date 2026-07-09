// POST /api/login — validate password and set cookie
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';

const PASSWORD = process.env.PASSWORD || '';

export async function POST(request) {
  try {
    const { password } = await request.json();

    if (!PASSWORD) {
      return NextResponse.json({ error: 'Not configured' }, { status: 500 });
    }

    if (password !== PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Hash the password as the auth token
    const hash = createHash('sha256').update(PASSWORD).digest('hex');

    const response = NextResponse.json({ ok: true });
    response.cookies.set('auth_token', hash, {
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
