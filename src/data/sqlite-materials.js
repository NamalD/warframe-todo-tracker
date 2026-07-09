/**
 * SQLite CRUD module for the materials_inventory table.
 *
 * Simple key-value: material_name → quantity_owned. Materials without inventory
 * exist as "not in table" (no zero-quantity rows unless explicitly recorded).
 *
 * All functions accept a better-sqlite3 Database instance as their first argument.
 *
 * This module is server-only — never import in client components.
 */
import 'server-only';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all materials as a key-value map.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {object} `{ "Polymer Bundle": 500, ... }` — empty object if none
 */
export function getAllMaterials(db) {
  const rows = db.prepare(
    'SELECT material_name, quantity FROM materials_inventory ORDER BY material_name'
  ).all();

  const result = {};
  for (const row of rows) {
    result[row.material_name] = row.quantity;
  }
  return result;
}

/**
 * Get a single material by name.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} materialName
 * @returns {object|null} `{ material_name, quantity, version, updated_at }` or null
 */
export function getMaterial(db, materialName) {
  const row = db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory WHERE material_name = ?'
  ).get(materialName);

  return row || null;
}

/**
 * Upsert a material — insert or update, always incrementing version.
 *
 * If the material does not exist, it is created with version=1.
 * If it exists, the quantity is updated and version is incremented.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} materialName
 * @param {number} quantity — must be >= 0 (enforced by CHECK constraint)
 * @returns {object} The full row: `{ material_name, quantity, version, updated_at }`
 */
export function upsertMaterial(db, materialName, quantity) {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO materials_inventory (material_name, quantity, version, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(material_name) DO UPDATE SET
       quantity = excluded.quantity,
       version = version + 1,
       updated_at = excluded.updated_at`
  ).run(materialName, quantity, now);

  // Return the full row
  return db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory WHERE material_name = ?'
  ).get(materialName);
}

/**
 * Upsert a material with optimistic concurrency control.
 *
 * If the material does not exist, it is always created with version=1
 * regardless of clientVersion.
 *
 * If the material exists, the update only succeeds when
 * `clientVersion >= serverVersion`. On success, version is incremented.
 *
 * On version conflict (`clientVersion < serverVersion`), a conflict object
 * is returned and the row is NOT modified.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} materialName
 * @param {number} quantity — must be >= 0 (enforced by CHECK constraint)
 * @param {number} clientVersion — the version the client last saw
 * @returns {object} Updated material row, or conflict object:
 *   `{ conflict: true, material_name, serverVersion, serverQuantity }`
 */
export function upsertMaterialWithVersion(db, materialName, quantity, clientVersion) {
  // Check if the material already exists
  const row = db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory WHERE material_name = ?'
  ).get(materialName);

  // New material — always accept regardless of clientVersion
  if (!row) {
    return upsertMaterial(db, materialName, quantity);
  }

  const serverVersion = row.version;

  // Conflict: client is working from a stale base
  if (clientVersion < serverVersion) {
    return {
      conflict: true,
      material_name: materialName,
      serverVersion,
      serverQuantity: row.quantity,
    };
  }

  // Update: clientVersion >= serverVersion
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE materials_inventory
     SET quantity = ?, version = version + 1, updated_at = ?
     WHERE material_name = ?`
  ).run(quantity, now, materialName);

  // Return the updated row
  return db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory WHERE material_name = ?'
  ).get(materialName);
}

/**
 * Batch upsert multiple materials in a single transaction.
 *
 * Each entry in the array runs through the same upsert logic as
 * `upsertMaterial` (always incrementing version). The entire batch
 * is atomic — on failure, no changes are persisted.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{ material_name: string, quantity: number }>} entries
 * @returns {Array<{ material_name: string }>} Results for each entry
 */
export function batchUpsert(db, entries) {
  if (entries.length === 0) return [];

  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO materials_inventory (material_name, quantity, version, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(material_name) DO UPDATE SET
       quantity = excluded.quantity,
       version = version + 1,
       updated_at = excluded.updated_at`
  );

  const operation = db.transaction((items) => {
    for (const item of items) {
      stmt.run(item.material_name, item.quantity, now);
    }
  });

  operation(entries);

  return entries.map((e) => ({ material_name: e.material_name }));
}

