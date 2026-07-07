import { getDb } from '../../../src/data/database.js';
import { getAllLoadouts, replaceAllLoadouts } from '../../../src/data/sqlite-loadouts.js';

export async function GET() {
  try {
    const db = getDb();
    const data = getAllLoadouts(db);
    return Response.json({ data });
  } catch (err) {
    console.error(`[api/loadouts GET] ${err.message}`);
    return Response.json({ error: 'Failed to read loadouts' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || !('data' in body) || !('version' in body)) {
      return Response.json(
        { error: 'Expected { data, version } object' },
        { status: 400 },
      );
    }
    const { data } = body;
    if (!Array.isArray(data)) {
      return Response.json({ error: 'Expected data to be an array of loadouts' }, { status: 400 });
    }
    const db = getDb();
    replaceAllLoadouts(db, data);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/loadouts PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write loadouts' }, { status: 500 });
  }
}
