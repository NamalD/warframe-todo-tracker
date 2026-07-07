import { readStore, writeStore } from '../../../src/data/server-store.js';

const KEY = 'materials-inventory';

export async function GET() {
  try {
    const data = readStore(KEY, {});
    return Response.json(data);
  } catch (err) {
    console.error(`[api/materials GET] ${err.message}`);
    return Response.json({ error: 'Failed to read materials inventory' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return Response.json({ error: 'Expected an object (inventory map)' }, { status: 400 });
    }
    writeStore(KEY, body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/materials PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write materials inventory' }, { status: 500 });
  }
}
