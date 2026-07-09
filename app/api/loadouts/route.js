import { getDb } from '../../../src/data/database.js';
import { getAllLoadouts, mergeNewLoadouts, createLoadout } from '../../../src/data/sqlite-loadouts.js';

/**
 * The client's local loadout model is flat (`{ id, name, slots, ... }`);
 * the server stores the nested structure (slots/requirements) in a `data`
 * JSON blob column, so this domain route's request/response bodies flatten
 * `data`'s fields back to the top level to match what loadout-repository.js
 * actually reads/writes. (This mismatch previously meant every loadout
 * pushed here got stored with empty data — slots silently discarded on
 * every sync round-trip.)
 */
function flattenLoadout({ data, ...rest }) {
  return { ...rest, ...(data || {}) };
}

export async function GET() {
  try {
    const db = getDb();
    const data = getAllLoadouts(db).map(flattenLoadout);
    return Response.json({ data });
  } catch (err) {
    console.error(`[api/loadouts GET] ${err.message}`);
    return Response.json({ error: 'Failed to read loadouts' }, { status: 500 });
  }
}

/**
 * POST /api/loadouts
 * Create a new loadout.
 *
 * Body: { name: string, data: object, [id]: string }
 * Returns the created loadout with version=1.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || !body.name) {
      return Response.json({ error: 'Expected { name, data } object' }, { status: 400 });
    }
    const db = getDb();
    const record = createLoadout(db, {
      id: body.id,
      name: body.name,
      data: body.data || {},
    });
    return Response.json(record, { status: 201 });
  } catch (err) {
    console.error(`[api/loadouts POST] ${err.message}`);
    return Response.json({ error: 'Failed to create loadout' }, { status: 500 });
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
    // Merge (insert-if-new), never a destructive replace — see #14: a
    // device's bulk push must not erase loadouts created on other devices.
    // Edits to existing loadouts go through PATCH /api/loadouts/[id].
    mergeNewLoadouts(db, data);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/loadouts PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write loadouts' }, { status: 500 });
  }
}
