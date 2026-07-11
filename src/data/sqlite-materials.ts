/**
 * SQLite CRUD module for the materials_inventory table.
 *
 * Simple key-value: material_name → quantity_owned. Materials without inventory
 * exist as "not in table" (no zero-quantity rows unless explicitly recorded).
 *
 * This module is server-only — never import in client components.
 */
import 'server-only';
import type { Database } from 'better-sqlite3';

interface MaterialRow {
  material_name: string;
  quantity: number;
  version: number;
  updated_at: string;
}

interface BatchEntry {
  material_name: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAllMaterials(db: Database): Record<string, number> {
  const rows = db.prepare(
    'SELECT material_name, quantity FROM materials_inventory ORDER BY material_name'
  ).all() as Array<{ material_name: string; quantity: number }>;

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.material_name] = row.quantity;
  }
  return result;
}

export function getAllMaterialVersions(db: Database): Record<string, number> {
  const rows = db.prepare(
    'SELECT material_name, version FROM materials_inventory ORDER BY material_name'
  ).all() as Array<{ material_name: string; version: number }>;

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.material_name] = row.version;
  }
  return result;
}

export function getMaterial(db: Database, materialName: string): MaterialRow | null {
  const row = db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory WHERE material_name = ?'
  ).get(materialName) as MaterialRow | undefined;

  return row || null;
}

export function upsertMaterial(db: Database, materialName: string, quantity: number): MaterialRow {
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO materials_inventory (material_name, quantity, version, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(material_name) DO UPDATE SET
       quantity = excluded.quantity,
       version = version + 1,
       updated_at = excluded.updated_at`
  ).run(materialName, quantity, now);

  return db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory WHERE material_name = ?'
  ).get(materialName) as MaterialRow;
}

export function upsertMaterialWithVersion(
  db: Database,
  materialName: string,
  quantity: number,
  clientVersion: number
): MaterialRow | { conflict: true; material_name: string; serverVersion: number; serverQuantity: number } {
  const row = db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory WHERE material_name = ?'
  ).get(materialName) as MaterialRow | undefined;

  if (!row) {
    return upsertMaterial(db, materialName, quantity);
  }

  const serverVersion = row.version;

  if (clientVersion < serverVersion) {
    return {
      conflict: true,
      material_name: materialName,
      serverVersion,
      serverQuantity: row.quantity,
    };
  }

  const now = new Date().toISOString();

  db.prepare(
    `UPDATE materials_inventory
     SET quantity = ?, version = version + 1, updated_at = ?
     WHERE material_name = ?`
  ).run(quantity, now, materialName);

  return db.prepare(
    'SELECT material_name, quantity, version, updated_at FROM materials_inventory WHERE material_name = ?'
  ).get(materialName) as MaterialRow;
}

export function batchUpsert(db: Database, entries: BatchEntry[]): Array<{ material_name: string }> {
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

  const operation = db.transaction((items: BatchEntry[]) => {
    for (const item of items) {
      stmt.run(item.material_name, item.quantity, now);
    }
  });

  operation(entries);

  return entries.map((e) => ({ material_name: e.material_name }));
}
