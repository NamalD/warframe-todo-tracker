// @ts-nocheck
import { getDb } from '../../../../src/data/database';
import { getLoadoutById, updateLoadout, deleteLoadout } from '../../../../src/data/sqlite-loadouts';

/**
 * GET /api/loadouts/[id]
 * Returns a single loadout by ID, or 404 if not found.
 */
export async function GET(_request, { params }) {
  try {
    const { id } = params;
    const db = getDb();
    const record = getLoadoutById(db, id);
    if (!record) {
      return Response.json({ error: 'Loadout not found' }, { status: 404 });
    }
    return Response.json(record);
  } catch (err) {
    console.error(`[api/loadouts/[id] GET] ${err.message}`);
    return Response.json({ error: 'Failed to read loadout' }, { status: 500 });
  }
}

/**
 * PATCH /api/loadouts/[id]
 * Update a loadout with version-based conflict detection.
 *
 * Body: { data: {...}, clientVersion: <number> }
 * Returns the updated loadout on success, 409 on conflict, 404 if not found.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();

    if (!body || typeof body !== 'object' || !('data' in body) || !('clientVersion' in body)) {
      return Response.json(
        { error: 'Expected { data, clientVersion } object' },
        { status: 400 },
      );
    }

    const db = getDb();

    // Check if record exists
    const existing = getLoadoutById(db, id);
    if (!existing) {
      return Response.json({ error: 'Loadout not found' }, { status: 404 });
    }

    const result = updateLoadout(db, id, body.data, body.clientVersion);

    if (result && result.conflict) {
      return Response.json(
        {
          conflict: true,
          record_id: id,
          server_version: result.serverVersion,
          server_data: result.serverData,
        },
        { status: 409 },
      );
    }

    return Response.json(result);
  } catch (err) {
    console.error(`[api/loadouts/[id] PATCH] ${err.message}`);
    return Response.json({ error: 'Failed to update loadout' }, { status: 500 });
  }
}

/**
 * DELETE /api/loadouts/[id]
 * Delete a loadout with version-based conflict detection.
 *
 * Body: { clientVersion: <number> }
 * Returns { ok: true } on success, 409 on conflict, 404 if not found.
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();

    if (!body || typeof body !== 'object' || !('clientVersion' in body)) {
      return Response.json(
        { error: 'Expected { clientVersion } object' },
        { status: 400 },
      );
    }

    const db = getDb();

    const result = deleteLoadout(db, id, body.clientVersion);

    if (result.notFound) {
      return Response.json({ error: 'Loadout not found' }, { status: 404 });
    }

    if (result.conflict) {
      return Response.json(
        {
          conflict: true,
          record_id: id,
          server_version: result.serverVersion,
          server_data: result.serverData,
        },
        { status: 409 },
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/loadouts/[id] DELETE] ${err.message}`);
    return Response.json({ error: 'Failed to delete loadout' }, { status: 500 });
  }
}
