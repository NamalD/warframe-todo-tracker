/**
 * SQLite CRUD for builds (flat version-tracked storage).
 */
import type { Database } from 'better-sqlite3';

export function getAllBuilds(db: Database) {
  return db.prepare('SELECT id, data, version, created_at, updated_at FROM builds ORDER BY created_at').all();
}

export function getBuildById(db: Database, id: string) {
  return db.prepare('SELECT id, data, version, created_at, updated_at FROM builds WHERE id = ?').get(id);
}

export function createBuild(db: Database, id: string, data: unknown) {
  db.prepare(
    'INSERT INTO builds (id, data, version) VALUES (?, ?, 1)'
  ).run(id, typeof data === 'string' ? data : JSON.stringify(data));
  return getBuildById(db, id);
}

export function updateBuild(db: Database, id: string, data: unknown, clientVersion = 0) {
  const existing = getBuildById(db, id);
  if (!existing) return createBuild(db, id, data);

  if (clientVersion > 0 && (existing as Record<string, unknown>).version as number > clientVersion) {
    return { conflict: true, server: existing };
  }

  const version = ((existing as Record<string, unknown>).version as number) + 1;
  db.prepare(
    "UPDATE builds SET data = ?, version = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(typeof data === 'string' ? data : JSON.stringify(data), version, id);
  return getBuildById(db, id);
}

export function deleteBuild(db: Database, id: string) {
  db.prepare('DELETE FROM builds WHERE id = ?').run(id);
}
