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

import { getDb } from './database.ts';

// ---------------------------------------------------------------------------
// Key-to-table mapping
// ---------------------------------------------------------------------------

const KEY_TABLE_MAP: Record<string, string> = {
  loadouts: 'loadouts',
  todos: 'todos',
  'materials-inventory': 'materials_inventory',
};

// ---------------------------------------------------------------------------
// Domain-specific table helpers
// ---------------------------------------------------------------------------

function readLoadouts() {
  const db = getDb();
  const rows = db.prepare('SELECT data FROM loadouts ORDER BY id').all() as Array<{ data: string }>;
  return rows.map(r => JSON.parse(r.data));
}

function writeLoadouts(items: Record<string, unknown>[]) {
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
        (item as Record<string, unknown>).name || '',
        JSON.stringify(item),
        (item as Record<string, unknown>).created_at || new Date().toISOString(),
        (item as Record<string, unknown>).updated_at || new Date().toISOString(),
      );
    }
  });
  write();
}

function readTodos() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, craftable_item_id, linked_material_name, user_notes,
           status, priority, due_at
    FROM todos ORDER BY id
  `).all() as Array<{
    id: string;
    craftable_item_id: string | null;
    linked_material_name: string | null;
    user_notes: string;
    status: string;
    priority: string;
    due_at: string | null;
  }>;
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

function writeTodos(items: Record<string, unknown>[]) {
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
        (item as Record<string, unknown>).craftable_item_id || null,
        (item as Record<string, unknown>).linked_material_name || null,
        (item as Record<string, unknown>).user_notes || '',
        (item as Record<string, unknown>).status || 'pending',
        (item as Record<string, unknown>).priority || 'medium',
        (item as Record<string, unknown>).due_at || null,
        (item as Record<string, unknown>).created_at || new Date().toISOString(),
        (item as Record<string, unknown>).updated_at || new Date().toISOString(),
      );
    }
  });
  write();
}

function readMaterialsInventory(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(
    'SELECT material_name, quantity FROM materials_inventory'
  ).all() as Array<{ material_name: string; quantity: number }>;
  const result: Record<string, number> = {};
  for (const r of rows) {
    result[r.material_name] = r.quantity;
  }
  return result;
}

function writeMaterialsInventory(data: Record<string, number>) {
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
// Version management via sync_meta table
// ---------------------------------------------------------------------------

export class ConflictError extends Error {
  key: string;
  serverVersion: number;

  constructor(key: string, serverVersion: number) {
    super(`Version conflict for "${key}": server version is ${serverVersion}`);
    this.name = 'ConflictError';
    this.key = key;
    this.serverVersion = serverVersion;
  }
}

export function readStoreVersion(key: string): number {
  const db = getDb();
  const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(`version:${key}`) as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

export function incrementStoreVersion(key: string): number {
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

export function readStoreWithVersion(key: string, defaultValue: unknown = null): { data: unknown; version: number } {
  const data = readStore(key, defaultValue);
  const version = readStoreVersion(key);
  return { data, version };
}

export function writeStoreWithVersion(key: string, data: unknown, clientVersion: number): number {
  const currentVersion = readStoreVersion(key);
  if (clientVersion < currentVersion) {
    throw new ConflictError(key, currentVersion);
  }
  writeStore(key, data);
  const newVersion = clientVersion + 1;
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)'
  ).run(`version:${key}`, String(newVersion));
  return newVersion;
}

export function readStore(key: string, defaultValue: unknown = null): unknown {
  const table = KEY_TABLE_MAP[key];
  if (!table) return defaultValue;

  try {
    let data: unknown;
    if (table === 'loadouts') {
      data = readLoadouts();
    } else if (table === 'todos') {
      data = readTodos();
    } else if (table === 'materials_inventory') {
      data = readMaterialsInventory();
    }

    return data;
  } catch (err: unknown) {
    console.error(`[server-store readStore] ${(err as Error).message}`);
    return defaultValue;
  }
}

export function writeStore(key: string, data: unknown): void {
  const table = KEY_TABLE_MAP[key];
  if (!table) {
    throw new Error(`Unknown store key: ${key}`);
  }

  if (table === 'loadouts') {
    writeLoadouts(data as Record<string, unknown>[]);
  } else if (table === 'todos') {
    writeTodos(data as Record<string, unknown>[]);
  } else if (table === 'materials_inventory') {
    writeMaterialsInventory(data as Record<string, number>);
  }
}
