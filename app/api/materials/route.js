import { getDb } from '../../../src/data/database.js';
import { getAllMaterials, replaceAllMaterials } from '../../../src/data/sqlite-materials.js';

export async function GET() {
  try {
    const db = getDb();
    const data = getAllMaterials(db);
    return Response.json({ data });
  } catch (err) {
    console.error(`[api/materials GET] ${err.message}`);
    return Response.json({ error: 'Failed to read materials inventory' }, { status: 500 });
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
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return Response.json({ error: 'Expected data to be an object (inventory map)' }, { status: 400 });
    }
    const db = getDb();
    replaceAllMaterials(db, data);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/materials PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write materials inventory' }, { status: 500 });
  }
}
