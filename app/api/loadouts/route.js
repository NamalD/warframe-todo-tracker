import { readStore, writeStore } from '../../../src/data/server-store.js';

const KEY = 'loadouts';

export async function GET() {
  try {
    const data = readStore(KEY, []);
    return Response.json(data);
  } catch (err) {
    console.error(`[api/loadouts GET] ${err.message}`);
    return Response.json({ error: 'Failed to read loadouts' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return Response.json({ error: 'Expected an array of loadouts' }, { status: 400 });
    }
    writeStore(KEY, body);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/loadouts PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write loadouts' }, { status: 500 });
  }
}
