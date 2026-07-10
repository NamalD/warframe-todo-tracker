/**
 * SQLite CRUD module for the loadouts table.
 *
 * Loadouts store their full nested structure (slots, requirements, materials)
 * as a JSON blob in the 'data' column.
 *
 * This module is server-only — never import in client components.
 */
import 'server-only';
import type { Database } from 'better-sqlite3';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface LoadoutRow {
  id: string;
  name: string;
  data: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface LoadoutData {
  id: string;
  name: string;
  data: unknown;
  version: number;
  created_at: string;
  updated_at: string;
}

function parseData(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw as string);
  } catch {
    return raw;
  }
}

function serializeData(val: unknown): string {
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function mapRow(row: LoadoutRow | null): LoadoutData | null {
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

export function getAllLoadouts(db: Database): LoadoutData[] {
  const rows = db.prepare(
    'SELECT id, name, data, version, created_at, updated_at FROM loadouts ORDER BY created_at'
  ).all() as LoadoutRow[];
  return rows.map(mapRow).filter((r): r is LoadoutData => r !== null);
}

export function getLoadoutById(db: Database, id: string): LoadoutData | null {
  const row = db.prepare(
    'SELECT id, name, data, version, created_at, updated_at FROM loadouts WHERE id = ?'
  ).get(id) as LoadoutRow | undefined;
  return mapRow(row || null);
}

export function createLoadout(db: Database, { id, name, data }: { id?: string; name: string; data: unknown }): LoadoutData {
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

export function updateLoadout(
  db: Database,
  id: string,
  data: unknown,
  clientVersion: number
): LoadoutData | { conflict: true; serverVersion: number; serverData: unknown; serverId: string } {
  const row = db.prepare(
    'SELECT id, name, data, version, created_at, updated_at FROM loadouts WHERE id = ?'
  ).get(id) as LoadoutRow | undefined;

  if (!row) {
    throw new Error(`Loadout not found: ${id}`);
  }

  const serverVersion = row.version;

  if (clientVersion < serverVersion) {
    const device_id = 'unknown';
    db.prepare('INSERT INTO conflict_log (table_name, record_id, client_version, server_version, device_id) VALUES (?, ?, ?, ?, ?)').run(
      'loadouts', id, clientVersion, serverVersion, device_id
    );
    return {
      conflict: true,
      serverVersion,
      serverData: parseData(row.data),
      serverId: row.id,
    };
  }

  const now = new Date().toISOString();
  const serialized = serializeData(data);

  db.prepare(
    `UPDATE loadouts
     SET data = ?, version = version + 1, updated_at = ?
     WHERE id = ?`
  ).run(serialized, now, id);

  const updatedRow = db.prepare(
    'SELECT id, name, data, version, created_at, updated_at FROM loadouts WHERE id = ?'
  ).get(id) as LoadoutRow;

  return mapRow(updatedRow) as LoadoutData;
}

export function deleteLoadout(
  db: Database,
  id: string,
  clientVersion: number
): { success: true } | { conflict: true; serverVersion: number; serverData: unknown; serverId: string } | { notFound: true } {
  const row = db.prepare(
    'SELECT id, data, version FROM loadouts WHERE id = ?'
  ).get(id) as { id: string; data: string; version: number } | undefined;

  if (!row) {
    return { notFound: true };
  }

  const serverVersion = row.version;

  if (clientVersion < serverVersion) {
    const device_id = 'unknown';
    db.prepare('INSERT INTO conflict_log (table_name, record_id, client_version, server_version, device_id) VALUES (?, ?, ?, ?, ?)').run(
      'loadouts', id, clientVersion, serverVersion, device_id
    );
    return {
      conflict: true,
      serverVersion,
      serverData: parseData(row.data),
      serverId: row.id,
    };
  }

  db.prepare('DELETE FROM loadouts WHERE id = ?').run(id);

  return { success: true };
}

export function mergeNewLoadouts(db: Database, loadouts: Array<{ id: string; name: string; data?: unknown;[key: string]: unknown }>): void {
  for (const item of loadouts) {
    if (!item.id) {
      throw new Error(`mergeNewLoadouts: every item must have an id (missing in: ${JSON.stringify(item)})`);
    }
  }

  const now = new Date().toISOString();

  const operation = db.transaction((items: typeof loadouts) => {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO loadouts (id, name, data, version, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    );

    for (const item of items) {
      const { id, name, created_at, updated_at, data, ...rest } = item;
      const itemData = 'data' in item ? (data || {}) : rest;
      stmt.run(id, name || '', serializeData(itemData), now, now);
    }
  });

  operation(loadouts);
}
