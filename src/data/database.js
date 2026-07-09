/**
 * SQLite database module for Warframe TODO Tracker.
 *
 * Provides synchronous getDb()/closeDb() lifecycle and a migrateFromJson()
 * one-shot migration from legacy JSON files to SQLite.
 *
 * This module is server-only — never import in client components.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import 'server-only';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function resolveDataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

// ---------------------------------------------------------------------------
// Schema DDL — follows Daedalus architecture spec
// ---------------------------------------------------------------------------

const INITIAL_SCHEMA_SQL = String.raw`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- LOADOUTS
-- Each loadout stores its full nested structure (slots,
-- requirements, materials) as a JSON blob in 'data'.
-- ============================================================
CREATE TABLE IF NOT EXISTS loadouts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    data        TEXT NOT NULL DEFAULT '{}',
    version     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_loadouts_updated_at ON loadouts(updated_at);

-- ============================================================
-- TODOS
-- Flat document, fully normalized columns.
-- ============================================================
CREATE TABLE IF NOT EXISTS todos (
    id                  TEXT PRIMARY KEY,
    craftable_item_id   TEXT,
    linked_material_name TEXT,
    user_notes          TEXT DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','in_progress','completed','abandoned','blocked')),
    priority            TEXT DEFAULT 'medium'
                        CHECK(priority IN ('low','medium','high')),
    due_at              TEXT,
    version             INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_updated_at ON todos(updated_at);

-- ============================================================
-- MATERIALS INVENTORY
-- Simple key-value: material_name → quantity_owned.
-- ============================================================
CREATE TABLE IF NOT EXISTS materials_inventory (
    material_name   TEXT PRIMARY KEY,
    quantity        INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    version         INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SYNC METADATA
-- Key-value store for sync-related bookkeeping.
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_meta (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

-- ============================================================
-- CONFLICT LOG
-- Records conflicts resolved via last-writer-wins.
-- ============================================================
CREATE TABLE IF NOT EXISTS conflict_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name      TEXT NOT NULL,
    record_id       TEXT NOT NULL,
    client_version  INTEGER NOT NULL,
    server_version  INTEGER NOT NULL,
    device_id       TEXT NOT NULL,
    resolved_at     TEXT NOT NULL DEFAULT (datetime('now')),
    details         TEXT
);

CREATE INDEX IF NOT EXISTS idx_conflict_log_resolved ON conflict_log(resolved_at);
`;

// ---------------------------------------------------------------------------
// Migration definitions — ordered list for future migrations
// ---------------------------------------------------------------------------

const MIGRATIONS = [
  { version: 1, description: 'Initial SQLite schema — migrated from JSON files', sql: INITIAL_SCHEMA_SQL },
  {
    version: 2,
    description: 'Add "blocked" to valid todo statuses',
    sql: `BEGIN TRANSACTION;
      CREATE TABLE todos_new (
        id                  TEXT PRIMARY KEY,
        craftable_item_id   TEXT,
        linked_material_name TEXT,
        user_notes          TEXT DEFAULT '',
        status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','in_progress','completed','abandoned','blocked')),
        priority            TEXT DEFAULT 'medium'
                            CHECK(priority IN ('low','medium','high')),
        due_at              TEXT,
        version             INTEGER NOT NULL DEFAULT 0,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO todos_new SELECT * FROM todos;
      DROP TABLE todos;
      ALTER TABLE todos_new RENAME TO todos;
      CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
      CREATE INDEX IF NOT EXISTS idx_todos_updated_at ON todos(updated_at);
      COMMIT;`,
  },
];

// ---------------------------------------------------------------------------
// Singleton database handle
// ---------------------------------------------------------------------------

let db = null;

/**
 * Apply any pending schema migrations to the database.
 * Runs each migration in sequence, recording the version on success.
 */
function applyMigrations(database) {
  // Bootstrap schema_version table first
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT NOT NULL
    );
  `);

  const currentVersion = database.prepare(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_version'
  ).get().version;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      database.exec(migration.sql);
      database.prepare(
        'INSERT INTO schema_version (version, description) VALUES (?, ?)'
      ).run(migration.version, migration.description);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get (or create) the singleton SQLite database connection.
 * On first call, ensures the DATA_DIR exists, opens the database,
 * enables WAL mode, and runs any pending schema migrations.
 *
 * @returns {Database} better-sqlite3 Database instance
 */
export function getDb() {
  if (db) return db;

  const dataDir = resolveDataDir();
  const dbPath = path.join(dataDir, 'warframe.db');
  fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  applyMigrations(db);

  return db;
}

/**
 * Close the database connection.
 * Safe to call multiple times or before getDb() has been called.
 */
export function closeDb() {
  if (db) {
    try { db.close(); } catch { /* already closed */ }
    db = null;
  }
}

/**
 * Migrate data from legacy JSON files (loadouts.json, todos.json,
 * materials-inventory.json) into SQLite tables.
 *
 * Only runs if the database is empty (no records in loadouts, todos,
 * or materials_inventory). Runs in a transaction — on failure, all
 * changes are rolled back and JSON files remain untouched.
 *
 * On success, each JSON file is renamed to .migrated as a backup.
 *
 * @returns {boolean} true if data was migrated, false otherwise
 */
export function migrateFromJson() {
  const database = getDb();

  // Only migrate if DB is empty
  const loadoutCount = database.prepare('SELECT COUNT(*) AS count FROM loadouts').get().count;
  const todoCount = database.prepare('SELECT COUNT(*) AS count FROM todos').get().count;
  const materialCount = database.prepare('SELECT COUNT(*) AS count FROM materials_inventory').get().count;

  if (loadoutCount > 0 || todoCount > 0 || materialCount > 0) {
    return false;
  }

  // Detect which JSON files exist
  const jsonFiles = [
    { key: 'loadouts', table: 'loadouts', isMap: false },
    { key: 'todos', table: 'todos', isMap: false },
    { key: 'materials-inventory', table: 'materials_inventory', isMap: true },
  ];

  const dataDir = resolveDataDir();
  const existing = jsonFiles.filter(({ key }) =>
    fs.existsSync(path.join(dataDir, `${key}.json`))
  );

  if (existing.length === 0) {
    return false;
  }

  // Run migration in a single transaction (DB operations only)
  const migrate = database.transaction(() => {
    for (const { key, table, isMap } of existing) {
      const filePath = path.join(dataDir, `${key}.json`);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      if (table === 'loadouts') {
        const stmt = database.prepare(`
          INSERT OR REPLACE INTO loadouts (id, name, data, version, created_at, updated_at)
          VALUES (?, ?, ?, 1, ?, ?)
        `);
        for (const row of data) {
          stmt.run(
            row.id,
            row.name || '',
            JSON.stringify(row),
            row.created_at || new Date().toISOString(),
            row.updated_at || new Date().toISOString(),
          );
        }
      } else if (table === 'todos') {
        const stmt = database.prepare(`
          INSERT OR REPLACE INTO todos
            (id, craftable_item_id, linked_material_name, user_notes, status, priority, due_at, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `);
        for (const row of data) {
          stmt.run(
            row.id,
            row.craftable_item_id || null,
            row.linked_material_name || null,
            row.user_notes || '',
            row.status || 'pending',
            row.priority || 'medium',
            row.due_at || null,
            row.created_at || new Date().toISOString(),
            row.updated_at || new Date().toISOString(),
          );
        }
      } else if (table === 'materials_inventory') {
        const stmt = database.prepare(`
          INSERT OR REPLACE INTO materials_inventory (material_name, quantity, version, updated_at)
          VALUES (?, ?, 1, ?)
        `);
        for (const [materialName, quantity] of Object.entries(data)) {
          stmt.run(materialName, quantity, new Date().toISOString());
        }
      }
    }
  });

  // Execute the transaction — if it throws, SQLite rolls back and we bail
  migrate();

  // All DB operations succeeded — now rename the JSON files
  const renamed = [];
  try {
    for (const { key } of existing) {
      const filePath = path.join(dataDir, `${key}.json`);
      fs.renameSync(filePath, filePath + '.migrated');
      renamed.push(key);
    }
  } catch (renameErr) {
    // Rename failure is non-fatal — data is already in SQLite
    console.error('Database migration: JSON files migrated to SQLite, ' +
      `but rename failed for some files: ${renamed.length}/${existing.length} renamed. ` +
      `Error: ${renameErr.message}`);
  }
  return true;
}
