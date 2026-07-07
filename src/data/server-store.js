/**
 * Server-side SQLite-backed data persistence.
 *
 * Each domain key maps to a table in the warframe.db SQLite database:
 *   loadouts           → loadouts
 *   todos              → todos
 *   materials-inventory → materials_inventory
 *
 * Replaces the legacy JSON file persistence. SQLite provides atomicity
 * and concurrency safety natively, so no advisory locking or temp-file
 * rename logic is needed.
 *
 * This module is Node.js-only — never imported from client components.
 */

import { getDb } from './database.js';

// ---------------------------------------------------------------------------
// Key-to-table mapping
// ---------------------------------------------------------------------------

const KEY_TABLE_MAP = {
  loadouts: 'loadouts',
  todos: 'todos',
  'materials-inventory': 'materials_inventory',
};

// ---------------------------------------------------------------------------
// Domain-specific table helpers
// ---------------------------------------------------------------------------

/**
 * Read all loadouts from the loadouts table.
 * Each row's `data` column is a JSON blob of the full loadout object.
 */
function readLoadouts() {
  const db = getDb();
  const rows = db.prepare('SELECT data FROM loadouts ORDER BY id').all();
  return rows.map(r => JSON.parse(r.data));
}

/**
 * Write all loadouts, replacing existing data in a single transaction.
 */
function writeLoadouts(items) {
  const db = getDb();
  const write = db.transaction(() => {
    db.prepare('DELETE FROM loadouts').run();
    if (items.length === 0) return;

    const stmt = db.prepare(`
      INSERT INTO loadouts (id, name, data, version, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `);
    for (const item of items) {
      stmt.run(
        item.id,
        item.name || '',
        JSON.stringify(item),
        item.created_at || new Date().toISOString(),
        item.updated_at || new Date().toISOString(),
      );
    }
  });
  write();
}

/**
 * Read all todos, reconstructing objects from normalized columns.
 * Metadata fields (version, created_at, updated_at) are internal to
 * the SQLite schema and omitted from the returned objects for backward
 * compatibility with the legacy JSON API shape.
 */
function readTodos() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, craftable_item_id, linked_material_name, user_notes,
           status, priority, due_at
    FROM todos ORDER BY id
  `).all();
  return rows.map(r => ({
    id: r.id,
    craftable_item_id: r.craftable_item_id,
    linked_material_name: r.linked_material_name,
    user_notes: r.user_notes,
    status: r.status,
    priority: r.priority,
    due_at: r.due_at,
  }));
}

/**
 * Write all todos, replacing existing data in a single transaction.
 */
function writeTodos(items) {
  const db = getDb();
  const write = db.transaction(() => {
    db.prepare('DELETE FROM todos').run();
    if (items.length === 0) return;

    const stmt = db.prepare(`
      INSERT INTO todos
        (id, craftable_item_id, linked_material_name, user_notes,
         status, priority, due_at, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    for (const item of items) {
      stmt.run(
        item.id,
        item.craftable_item_id || null,
        item.linked_material_name || null,
        item.user_notes || '',
        item.status || 'pending',
        item.priority || 'medium',
        item.due_at || null,
        item.created_at || new Date().toISOString(),
        item.updated_at || new Date().toISOString(),
      );
    }
  });
  write();
}

/**
 * Read materials inventory as a flat object { material_name: quantity }.
 */
function readMaterialsInventory() {
  const db = getDb();
  const rows = db.prepare(
    'SELECT material_name, quantity FROM materials_inventory'
  ).all();
  const result = {};
  for (const r of rows) {
    result[r.material_name] = r.quantity;
  }
  return result;
}

/**
 * Write materials inventory, replacing existing data in a single transaction.
 */
function writeMaterialsInventory(data) {
  const db = getDb();
  const write = db.transaction(() => {
    db.prepare('DELETE FROM materials_inventory').run();
    const entries = Object.entries(data);
    if (entries.length === 0) return;

    const stmt = db.prepare(`
      INSERT INTO materials_inventory (material_name, quantity, version, updated_at)
      VALUES (?, ?, 1, ?)
    `);
    for (const [materialName, quantity] of entries) {
      stmt.run(materialName, quantity, new Date().toISOString());
    }
  });
  write();
}

// ---------------------------------------------------------------------------
// Public API (same signature as legacy JSON store)
// ---------------------------------------------------------------------------

/**
 * Read data for a given domain key.
 * Returns the parsed value or defaultValue if the table is empty
 * or the key is not recognised.
 */
// ---------------------------------------------------------------------------
// Version management via sync_meta table
// ---------------------------------------------------------------------------

/**
 * Custom error thrown when a write is rejected due to a version conflict.
 */
export class ConflictError extends Error {
  /**
   * @param {string} key - The store key that conflicted
   * @param {number} serverVersion - The current version on the server
   */
  constructor(key, serverVersion) {
    super(`Version conflict for "${key}": server version is ${serverVersion}`);
    this.name = 'ConflictError';
    this.key = key;
    this.serverVersion = serverVersion;
  }
}

/**
 * Read the current version counter for a store key from sync_meta.
 * Returns 0 if no prior write has been recorded for this key.
 */
export function readStoreVersion(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(`version:${key}`);
  return row ? parseInt(row.value, 10) : 0;
}

/**
 * Increment the version counter for a store key and return the new value.
 */
export function incrementStoreVersion(key) {
  const db = getDb();
  const versionKey = `version:${key}`;
  const current = readStoreVersion(key);
  const newVersion = current + 1;
  db.prepare(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)'
  ).run(versionKey, String(newVersion));
  return newVersion;
}

// ---------------------------------------------------------------------------
// Version-aware public API
// ---------------------------------------------------------------------------

/**
 * Read data and its current version for a given domain key.
 * Returns `{ data, version }` where `version` is the domain-level
 * version counter used for conflict resolution.
 */
export function readStoreWithVersion(key, defaultValue = null) {
  const data = readStore(key, defaultValue);
  const version = readStoreVersion(key);
  return { data, version };
}

/**
 * Write data for a given domain key with version validation.
 *
 * Compares the client-supplied version against the server's current version.
 * Uses last-writer-wins (LWW) with strict ordering:
 *   - If clientVersion >= storedVersion: accept the write, increment counter
 *   - If clientVersion < storedVersion:  throw ConflictError with current version
 *
 * @param {string} key - Store key (loadouts, todos, materials-inventory)
 * @param {*} data - Data to write
 * @param {number} clientVersion - Version the client believes it has
 * @returns {number} The new version after the write
 * @throws {ConflictError} If client version is behind the server
 */
export function writeStoreWithVersion(key, data, clientVersion) {
  const currentVersion = readStoreVersion(key);
  if (clientVersion < currentVersion) {
    throw new ConflictError(key, currentVersion);
  }
  writeStore(key, data);
  // New version is clientVersion + 1, so the version counter always
  // advances relative to the client's known state (even if the client's
  // version was ahead of the server's).
  const newVersion = clientVersion + 1;
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)'
  ).run(`version:${key}`, String(newVersion));
  return newVersion;
}

export function readStore(key, defaultValue = null) {
  const table = KEY_TABLE_MAP[key];
  if (!table) return defaultValue;

  try {
    let data;
    if (table === 'loadouts') {
      data = readLoadouts();
    } else if (table === 'todos') {
      data = readTodos();
    } else if (table === 'materials_inventory') {
      data = readMaterialsInventory();
    }

    return data;
  } catch (err) {
    console.error(`[server-store readStore] ${err.message}`);
    return defaultValue;
  }
}

/**
 * Write data for a given domain key.
 * Uses SQLite transactions for atomicity and concurrency safety.
 *
 * @throws {Error} If the key is not a recognised domain key.
 */
export function writeStore(key, data) {
  const table = KEY_TABLE_MAP[key];
  if (!table) {
    throw new Error(`Unknown store key: ${key}`);
  }

  if (table === 'loadouts') {
    writeLoadouts(data);
  } else if (table === 'todos') {
    writeTodos(data);
  } else if (table === 'materials_inventory') {
    writeMaterialsInventory(data);
  }
}
