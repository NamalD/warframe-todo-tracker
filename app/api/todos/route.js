import { readStore, writeStore } from '../../../src/data/server-store.js';

const KEY = 'todos';

export async function GET() {
  try {
    const data = readStore(KEY, []);
    return Response.json(data);
  } catch (err) {
    console.error(`[api/todos GET] ${err.message}`);
    return Response.json({ error: 'Failed to read todos' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return Response.json({ error: 'Expected an array of todos' }, { status: 400 });
    }
    writeStore(KEY, body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/todos PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write todos' }, { status: 500 });
  }
}
