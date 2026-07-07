import { readStore, writeStore } from '../../../src/data/server-store.js';

const KEY = 'builds';

export async function GET() {
  try {
    const data = readStore(KEY, []);
    return Response.json(data);
  } catch (err) {
    console.error(`[api/builds GET] ${err.message}`);
    return Response.json({ error: 'Failed to read builds' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return Response.json({ error: 'Expected an array of builds' }, { status: 400 });
    }
    writeStore(KEY, body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/builds PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write builds' }, { status: 500 });
  }
}
