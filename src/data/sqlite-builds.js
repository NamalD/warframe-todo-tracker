// ---------------------------------------------------------------------------
// sqlite-builds.js — SQLite CRUD for builds (flat version-tracked storage)
// ---------------------------------------------------------------------------

/** @param {import('better-sqlite3').Database} db */
export function getAllBuilds(db) {
  return db.prepare('SELECT id, data, version, created_at, updated_at FROM builds ORDER BY created_at').all();
}

/** @param {import('better-sqlite3').Database} db */
export function getBuildById(db, id) {
  return db.prepare('SELECT id, data, version, created_at, updated_at FROM builds WHERE id = ?').get(id);
}

/** @param {import('better-sqlite3').Database} db */
export function createBuild(db, id, data) {
  db.prepare(
    'INSERT INTO builds (id, data, version) VALUES (?, ?, 1)'
  ).run(id, typeof data === 'string' ? data : JSON.stringify(data));
  return getBuildById(db, id);
}

/** @param {import('better-sqlite3').Database} db */
export function updateBuild(db, id, data, clientVersion = 0) {
  const existing = getBuildById(db, id);
  if (!existing) return createBuild(db, id, data);

  if (clientVersion > 0 && existing.version > clientVersion) {
    return { conflict: true, server: existing };
  }

  const version = existing.version + 1;
  db.prepare(
    "UPDATE builds SET data = ?, version = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(typeof data === 'string' ? data : JSON.stringify(data), version, id);
  return getBuildById(db, id);
}

/** @param {import('better-sqlite3').Database} db */
export function deleteBuild(db, id) {
  db.prepare('DELETE FROM builds WHERE id = ?').run(id);
}
