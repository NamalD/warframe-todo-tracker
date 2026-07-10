/**
 * Sync endpoint for multi-device data synchronisation.
 *
 * GET /api/sync?since=<ISO-timestamp>
 *   Returns all data (loadouts, todos, materials_inventory) plus a
 *   server_timestamp. When ?since= is provided, only records updated
 *   after that timestamp are returned.
 *
 * POST /api/sync
 *   Accepts { device_id, loadouts, todos, materials_inventory }
 *   and processes batch upserts with per-record version checking.
 *   Returns { accepted, conflicts, server_timestamp }.
 */
import { getDb } from '../../../src/data/database';
import {
  getAllLoadouts,
  getLoadoutById,
  updateLoadout,
  createLoadout,
} from '../../../src/data/sqlite-loadouts';
import {
  getAllTodos,
  getTodoById,
  updateTodo,
  createTodo,
} from '../../../src/data/sqlite-todos';
import {
  upsertMaterial,
  upsertMaterialWithVersion,
} from '../../../src/data/sqlite-materials';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filter an array of records to only those with updated_at > since.
 */
function filterSince(records, since) {
  if (!since) return records;
  const sinceDate = new Date(since).getTime();
  return records.filter((r) => {
    const updatedAt = r.updated_at ? new Date(r.updated_at).getTime() : 0;
    return updatedAt > sinceDate;
  });
}

/**
 * Process a batch of loadout records for sync.
 *
 * For each record:
 *   - If the record exists server-side, attempt an update with version check
 *   - If the record doesn't exist, create it
 *
 * The record is expected to have a nested `data` property (the full loadout
 * data blob). `clientVersion` is read from the record.
 */
function processLoadoutBatch(db, records) {
  const accepted = [];
  const conflicts = [];

  for (const record of records) {
    const id = record.id;
    const clientVersion = record.clientVersion || 0;

    const existing = getLoadoutById(db, id);

    if (existing) {
      // Attempt update with version check
      const result = updateLoadout(db, id, record.data || record, clientVersion);
      if (result && result.conflict) {
        conflicts.push({
          record_id: id,
          table: 'loadouts',
          server_version: result.serverVersion,
          server_data: result.serverData,
        });
      } else {
        accepted.push(id);
      }
    } else {
      // Create new record
      try {
        createLoadout(db, {
          id: record.id,
          name: record.name || '',
          data: record.data || {},
        });
        accepted.push(id);
      } catch (err) {
        conflicts.push({
          record_id: id,
          table: 'loadouts',
          error: err.message,
        });
      }
    }
  }

  return { accepted, conflicts };
}

/**
 * Process a batch of todo records for sync.
 */
function processTodoBatch(db, records) {
  const accepted = [];
  const conflicts = [];

  for (const record of records) {
    const id = record.id;
    const clientVersion = record.clientVersion || 0;

    const existing = getTodoById(db, id);

    if (existing) {
      const result = updateTodo(db, id, record, clientVersion);
      if (result && result.conflict) {
        conflicts.push({
          record_id: id,
          table: 'todos',
          server_version: result.serverVersion,
          server_data: result.serverData,
        });
      } else {
        accepted.push(id);
      }
    } else {
      try {
        createTodo(db, record);
        accepted.push(id);
      } catch (err) {
        conflicts.push({
          record_id: id,
          table: 'todos',
          error: err.message,
        });
      }
    }
  }

  return { accepted, conflicts };
}

/**
 * Process a materials inventory object (key-value map).
 */
function processMaterialsBatch(db, materialsObj) {
  const accepted = [];
  const conflicts = [];

  if (!materialsObj || typeof materialsObj !== 'object') {
    return { accepted, conflicts };
  }

  for (const [materialName, entry] of Object.entries(materialsObj)) {
    let quantity;
    let clientVersion = 0;

    // entry can be { quantity, clientVersion } or just a number
    if (typeof entry === 'object' && entry !== null) {
      quantity = entry.quantity;
      clientVersion = entry.clientVersion || 0;

      // Check existing for version conflict
      const existing = db.prepare(
        'SELECT material_name, version FROM materials_inventory WHERE material_name = ?'
      ).get(materialName);

      if (existing && clientVersion < existing.version) {
        conflicts.push({
          record_id: materialName,
          table: 'materials_inventory',
          server_version: existing.version,
        });
        continue;
      }

      const result = upsertMaterialWithVersion(db, materialName, quantity, clientVersion);
      if (result && result.conflict) {
        conflicts.push({
          record_id: materialName,
          table: 'materials_inventory',
          server_version: result.serverVersion,
        });
        continue;
      }
    } else {
      quantity = typeof entry === 'number' ? entry : 0;
      upsertMaterial(db, materialName, quantity);
    }
    accepted.push(materialName);
  }

  return { accepted, conflicts };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/sync
 *
 * Query params:
 *   since - ISO timestamp; if provided, only records updated after this time
 *           are returned.
 *
 * Returns:
 *   { loadouts: [...], todos: [...], materials_inventory: {...}, server_timestamp }
 */
export async function GET(request) {
  try {
    const db = getDb();
    const url = new URL(request.url);
    const since = url.searchParams.get('since') || null;

    const loadouts = filterSince(getAllLoadouts(db), since);

    let todos;
    if (since) {
      const sinceDate = new Date(since).toISOString();
      todos = db.prepare(
        `SELECT id, craftable_item_id, linked_material_name, user_notes,
                status, priority, due_at, version, created_at, updated_at
         FROM todos WHERE updated_at > ? ORDER BY created_at`
      ).all(sinceDate);
    } else {
      todos = getAllTodos(db);
    }

    let materials;
    if (since) {
      const sinceDate = new Date(since).toISOString();
      materials = getAllMaterialsSince(db, sinceDate);
    } else {
      materials = getAllMaterialsAsRecord(db);
    }

    const serverTimestamp = new Date().toISOString();

    return Response.json({
      loadouts,
      todos,
      materials_inventory: materials,
      server_timestamp: serverTimestamp,
    });
  } catch (err) {
    console.error(`[api/sync GET] ${err.message}`);
    return Response.json({ error: 'Failed to read sync data' }, { status: 500 });
  }
}

/**
 * Helper to get materials as a detailed record object.
 */
function getAllMaterialsAsRecord(db) {
  const rows = db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory ORDER BY material_name'
  ).all();

  const result = {};
  for (const row of rows) {
    result[row.material_name] = {
      quantity: row.quantity,
      version: row.version,
      updated_at: row.updated_at,
    };
  }
  return result;
}

/**
 * Get materials updated after a given timestamp.
 */
function getAllMaterialsSince(db, sinceIso) {
  const rows = db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory WHERE updated_at > ? ORDER BY material_name'
  ).all(sinceIso);

  const result = {};
  for (const row of rows) {
    result[row.material_name] = {
      quantity: row.quantity,
      version: row.version,
      updated_at: row.updated_at,
    };
  }
  return result;
}

/**
 * POST /api/sync
 *
 * Body: {
 *   device_id: string,
 *   loadouts: Array<{ id, ..., clientVersion }>,
 *   todos: Array<{ id, ..., clientVersion }>,
 *   materials_inventory: { "material_name": { quantity, clientVersion } }
 * }
 *
 * Returns:
 *   {
 *     accepted: { loadouts: [ids], todos: [ids], materials_inventory: [names] },
 *     conflicts: { loadouts: [...], todos: [...], materials_inventory: [...] },
 *     server_timestamp: "..."
 *   }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const db = getDb();
    const serverTimestamp = new Date().toISOString();

    // Process loadouts
    const loadoutResult = Array.isArray(body.loadouts)
      ? processLoadoutBatch(db, body.loadouts)
      : { accepted: [], conflicts: [] };

    // Process todos
    const todoResult = Array.isArray(body.todos)
      ? processTodoBatch(db, body.todos)
      : { accepted: [], conflicts: [] };

    // Process materials
    const materialResult = processMaterialsBatch(db, body.materials_inventory);

    return Response.json({
      accepted: {
        loadouts: loadoutResult.accepted,
        todos: todoResult.accepted,
        materials_inventory: materialResult.accepted,
      },
      conflicts: {
        loadouts: loadoutResult.conflicts,
        todos: todoResult.conflicts,
        materials_inventory: materialResult.conflicts,
      },
      server_timestamp: serverTimestamp,
    });
  } catch (err) {
    console.error(`[api/sync POST] ${err.message}`);
    return Response.json({ error: 'Failed to process sync' }, { status: 500 });
  }
}
