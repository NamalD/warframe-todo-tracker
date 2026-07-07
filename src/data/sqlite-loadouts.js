/**
 * SQLite CRUD module for the loadouts table.
 *
 * Loadouts store their full nested structure (slots, requirements, materials)
 * as a JSON blob in the 'data' column. All functions accept a better-sqlite3
 * Database instance as their first argument.
 *
 * This module is server-only — never import in client components.
 */
import 'server-only';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse the `data` JSON column — if it's already a plain object (from
 * better-sqlite3's deserialization of a TEXT column the caller already parsed),
 * return it as-is. Otherwise try JSON.parse.
 */
function parseData(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Serialize a value to JSON for the `data` column.
 * If it's already a string (pre-serialized), store it directly.
 */
function serializeData(val) {
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

/**
 * Map a raw SQLite row to the API shape with parsed data.
 */
function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    data: parseData(row.data),
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all loadouts from the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<object>} Array of loadout objects with parsed `data`
 */
export function getAllLoadouts(db) {
  const rows = db.prepare(
    'SELECT id, name, data, version, created_at, updated_at FROM loadouts ORDER BY created_at'
  ).all();
  return rows.map(mapRow);
}

/**
 * Get a single loadout by its ID.
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @returns {object|null} Loadout object with parsed `data`, or null
 */
export function getLoadoutById(db, id) {
  const row = db.prepare(
    'SELECT id, name, data, version, created_at, updated_at FROM loadouts WHERE id = ?'
  ).get(id);
  return mapRow(row);
}

/**
 * Create a new loadout.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} params
 * @param {string} [params.id] - Optional explicit ID; auto-generated if omitted
 * @param {string} params.name - Loadout display name
 * @param {object} params.data - The loadout's nested structure (slots, etc.)
 * @returns {object} The created loadout with version=1 and timestamps
 */
export function createLoadout(db, { id, name, data }) {
  const loadoutId = id || crypto.randomUUID();
  const now = new Date().toISOString();
  const serialized = serializeData(data);

  db.prepare(
    `INSERT INTO loadouts (id, name, data, version, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).run(loadoutId, name, serialized, now, now);

  return {
    id: loadoutId,
    name,
    data: parseData(data),
    version: 1,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update a loadout with optimistic concurrency control.
 *
 * If `clientVersion >= serverVersion` the update succeeds, the row's version
 * is incremented by 1, and the full updated record is returned.
 *
 * If the loadout has been modified by another client (`clientVersion <
 * serverVersion`), returns a conflict object with the current server state.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @param {object} data - New data payload
 * @param {number} clientVersion - The version the client last saw
 * @returns {object} Updated loadout, or `{ conflict, serverVersion, serverData, serverId }`
 * @throws {Error} If the ID does not exist
 */
export function updateLoadout(db, id, data, clientVersion) {
  // First, fetch the current row
  const row = db.prepare(
    'SELECT id, name, data, version, created_at, updated_at FROM loadouts WHERE id = ?'
  ).get(id);

  if (!row) {
    throw new Error(`Loadout not found: ${id}`);
  }

  const serverVersion = row.version;

  // Conflict: client is working from a stale base
  if (clientVersion < serverVersion) {
    return {
      conflict: true,
      serverVersion,
      serverData: parseData(row.data),
      serverId: row.id,
    };
  }

  // Update: clientVersion >= serverVersion
  const now = new Date().toISOString();
  const serialized = serializeData(data);

  db.prepare(
    `UPDATE loadouts
     SET data = ?, version = version + 1, updated_at = ?
     WHERE id = ?`
  ).run(serialized, now, id);

  // Return the updated record
  const updatedRow = db.prepare(
    'SELECT id, name, data, version, created_at, updated_at FROM loadouts WHERE id = ?'
  ).get(id);

  return mapRow(updatedRow);
}

/**
 * Delete a loadout with optimistic concurrency control.
 *
 * If `clientVersion >= serverVersion` the delete succeeds.
 * If the loadout has been modified by another client, returns a conflict.
 * If the ID does not exist, returns `{ notFound: true }`.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @param {number} clientVersion - The version the client last saw
 * @returns {object} `{ success: true }`, or `{ conflict, serverVersion, serverData, serverId }`,
 *   or `{ notFound: true }`
 */
export function deleteLoadout(db, id, clientVersion) {
  const row = db.prepare(
    'SELECT id, data, version FROM loadouts WHERE id = ?'
  ).get(id);

  if (!row) {
    return { notFound: true };
  }

  const serverVersion = row.version;

  // Conflict: client is working from a stale base
  if (clientVersion < serverVersion) {
    return {
      conflict: true,
      serverVersion,
      serverData: parseData(row.data),
      serverId: row.id,
    };
  }

  // Delete: clientVersion >= serverVersion
  db.prepare('DELETE FROM loadouts WHERE id = ?').run(id);

  return { success: true };
}

/**
 * Atomically replace all loadouts with a new set.
 *
 * Phase 1 bulk compat — no individual version checks. All rows are deleted
 * and the new set inserted in a single transaction. Each inserted row gets
 * version=1 and current timestamps.
 *
 * On failure, the transaction rolls back and old rows are preserved.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{ id: string, name: string, data: object }>} loadouts
 */
export function replaceAllLoadouts(db, loadouts) {
  // Validate that every item has an id — SQLite allows NULL in TEXT PK,
  // which would silently break the atomic-replace contract
  for (const item of loadouts) {
    if (!item.id) {
      throw new Error(`replaceAllLoadouts: every item must have an id (missing in: ${JSON.stringify(item)})`);
    }
  }

  const now = new Date().toISOString();

  const operation = db.transaction((items) => {
    db.prepare('DELETE FROM loadouts').run();

    const stmt = db.prepare(
      `INSERT INTO loadouts (id, name, data, version, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    );

    for (const item of items) {
      stmt.run(item.id, item.name || '', serializeData(item.data || {}), now, now);
    }
  });

  operation(loadouts);
}
