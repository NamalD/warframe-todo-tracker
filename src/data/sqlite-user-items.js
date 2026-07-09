// ---------------------------------------------------------------------------
// sqlite-user-items.js — SQLite CRUD for per-item user flags
// (is_user_tracked, track_incarnon_install, incarnon_installed)
// ---------------------------------------------------------------------------

/** @param {import('better-sqlite3').Database} db */
export function getUserItemData(db, itemId) {
  const row = db.prepare('SELECT * FROM user_item_data WHERE item_id = ?').get(itemId);
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

/** @param {import('better-sqlite3').Database} db */
export function getAllUserItemData(db) {
  const rows = db.prepare('SELECT * FROM user_item_data').all();
  const result = {};
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

/** @param {import('better-sqlite3').Database} db */
export function upsertUserItemData(db, itemId, fields, clientVersion = 0) {
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
  return getUserItemData(db, itemId);
}

/** @param {import('better-sqlite3').Database} db */
export function deleteUserItemData(db, itemId) {
  db.prepare('DELETE FROM user_item_data WHERE item_id = ?').run(itemId);
}
