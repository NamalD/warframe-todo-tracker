// @ts-nocheck
import { getDb } from '../../../src/data/database';
import { getAllMaterials, getAllMaterialVersions, batchUpsert, upsertMaterialWithVersion } from '../../../src/data/sqlite-materials';

export async function GET() {
  try {
    const db = getDb();
    const data = getAllMaterials(db);
    // versions lets clients send an up-to-date clientVersion on PATCH — see #117
    const versions = getAllMaterialVersions(db);
    return Response.json({ data, versions });
  } catch (err) {
    console.error(`[api/materials GET] ${err.message}`);
    return Response.json({ error: 'Failed to read materials inventory' }, { status: 500 });
  }
}

/**
 * PATCH /api/materials
 * Upsert a single material with version-based conflict detection.
 *
 * Body: { material_name: string, quantity: number, clientVersion: number }
 * Returns the updated material row on success, 409 on conflict.
 */
export async function PATCH(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || !body.material_name || !('quantity' in body) || !('clientVersion' in body)) {
      return Response.json(
        { error: 'Expected { material_name, quantity, clientVersion } object' },
        { status: 400 },
      );
    }
    const db = getDb();
    const result = upsertMaterialWithVersion(db, body.material_name, body.quantity, body.clientVersion);
    if (result && result.conflict) {
      return Response.json(
        {
          conflict: true,
          record_id: body.material_name,
          server_version: result.serverVersion,
          server_quantity: result.serverQuantity,
        },
        { status: 409 },
      );
    }
    return Response.json(result);
  } catch (err) {
    console.error(`[api/materials PATCH] ${err.message}`);
    return Response.json({ error: 'Failed to update material' }, { status: 500 });
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
    // Merge (upsert per key), never a destructive replace — see #14: a
    // device's bulk push must not erase materials only set on other devices.
    const entries = Object.entries(data).map(([material_name, quantity]) => ({ material_name, quantity }));
    batchUpsert(db, entries);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/materials PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write materials inventory' }, { status: 500 });
  }
}
