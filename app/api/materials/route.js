import { readStoreWithVersion, writeStoreWithVersion, ConflictError } from '../../../src/data/server-store.js';

const KEY = 'materials-inventory';

export async function GET() {
  try {
    const { data, version } = readStoreWithVersion(KEY, {});
    return Response.json({ data, version });
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
    const { data, version } = body;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return Response.json({ error: 'Expected data to be an object (inventory map)' }, { status: 400 });
    }
    const newVersion = writeStoreWithVersion(KEY, data, version);
    return Response.json({ ok: true, version: newVersion });
  } catch (err) {
    if (err instanceof ConflictError) {
      return Response.json(
        { error: err.message, currentVersion: err.serverVersion },
        { status: 409 },
      );
    }
    console.error(`[api/materials PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write materials inventory' }, { status: 500 });
  }
}
