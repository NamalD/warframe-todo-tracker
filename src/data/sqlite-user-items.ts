/**
 * SQLite CRUD for per-item user flags
 * (is_user_tracked, track_incarnon_install, incarnon_installed).
 */
import type { Database } from 'better-sqlite3';

interface UserItemRow {
  item_id: string;
  is_user_tracked: number;
  track_incarnon_install: number;
  incarnon_installed: number;
  version: number;
  updated_at: string;
}

interface UserItemData {
  item_id: string;
  is_user_tracked: boolean;
  track_incarnon_install: boolean;
  incarnon_installed: boolean;
  version: number;
  updated_at: string;
}

export function getUserItemData(db: Database, itemId: string): UserItemData | null {
  const row = db.prepare('SELECT * FROM user_item_data WHERE item_id = ?').get(itemId) as UserItemRow | undefined;
  if (!row) return null;
  return {
    item_id: row.item_id,
    is_user_tracked: !!row.is_user_tracked,
    track_incarnon_install: !!row.track_incarnon_install,
    incarnon_installed: !!row.incarnon_installed,
    version: row.version,
    updated_at: row.updated_at,
  };
}

export function getAllUserItemData(db: Database): Record<string, Omit<UserItemData, 'item_id' | 'updated_at'>> {
  const rows = db.prepare('SELECT * FROM user_item_data').all() as UserItemRow[];
  const result: Record<string, Omit<UserItemData, 'item_id' | 'updated_at'>> = {};
  for (const row of rows) {
    result[row.item_id] = {
      is_user_tracked: !!row.is_user_tracked,
      track_incarnon_install: !!row.track_incarnon_install,
      incarnon_installed: !!row.incarnon_installed,
      version: row.version,
    };
  }
  return result;
}

interface UserItemFields {
  is_user_tracked?: boolean;
  track_incarnon_install?: boolean;
  incarnon_installed?: boolean;
}

export function upsertUserItemData(db: Database, itemId: string, fields: UserItemFields, clientVersion = 0): UserItemData | { conflict: boolean; server: UserItemData } {
  const existing = getUserItemData(db, itemId);
  if (existing) {
    if (clientVersion > 0 && existing.version > clientVersion) {
      return { conflict: true, server: existing };
    }
    const version = existing.version + 1;
    db.prepare(`
      UPDATE user_item_data SET
        is_user_tracked = COALESCE(?, is_user_tracked),
        track_incarnon_install = COALESCE(?, track_incarnon_install),
        incarnon_installed = COALESCE(?, incarnon_installed),
        version = ?,
        updated_at = datetime('now')
      WHERE item_id = ?
    `).run(
      fields.is_user_tracked != null ? (fields.is_user_tracked ? 1 : 0) : null,
      fields.track_incarnon_install != null ? (fields.track_incarnon_install ? 1 : 0) : null,
      fields.incarnon_installed != null ? (fields.incarnon_installed ? 1 : 0) : null,
      version,
      itemId,
    );
  } else {
    const version = 1;
    db.prepare(`
      INSERT INTO user_item_data (item_id, is_user_tracked, track_incarnon_install, incarnon_installed, version)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      itemId,
      fields.is_user_tracked ? 1 : 0,
      fields.track_incarnon_install ? 1 : 0,
      fields.incarnon_installed ? 1 : 0,
      version,
    );
  }
  return getUserItemData(db, itemId) as UserItemData;
}

export function deleteUserItemData(db: Database, itemId: string): void {
  db.prepare('DELETE FROM user_item_data WHERE item_id = ?').run(itemId);
}
