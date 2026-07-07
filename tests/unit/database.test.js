import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-db-'));

beforeAll(() => {
  process.env.DATA_DIR = tmpDir;
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  delete process.env.DATA_DIR;
});

function cleanDataDir() {
  const files = fs.readdirSync(tmpDir);
  for (const f of files) {
    try { fs.unlinkSync(path.join(tmpDir, f)); } catch {}
  }
}

describe('database module', () => {
  let database;

  // Re-import the module for each test group to get a fresh state
  async function loadModule() {
    vi.resetModules();
    return await import('../../src/data/database.js?t=' + Date.now());
  }

  describe('getDb()', () => {
    beforeEach(() => {
      cleanDataDir();
    });

    it('creates a SQLite database file on first call', async () => {
      database = await loadModule();
      const db = database.getDb();
      expect(db).toBeDefined();
      expect(fs.existsSync(path.join(tmpDir, 'warframe.db'))).toBe(true);
      database.closeDb();
    });

    it('creates all expected tables', async () => {
      database = await loadModule();
      const db = database.getDb();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all().map(r => r.name);
      expect(tables).toContain('schema_version');
      expect(tables).toContain('loadouts');
      expect(tables).toContain('todos');
      expect(tables).toContain('materials_inventory');
      expect(tables).toContain('sync_meta');
      expect(tables).toContain('conflict_log');
      database.closeDb();
    });

    it('returns the same instance on subsequent calls (singleton)', async () => {
      database = await loadModule();
      const db1 = database.getDb();
      const db2 = database.getDb();
      expect(db1).toBe(db2);
      database.closeDb();
    });

    it('creates the DATA_DIR if it does not exist', async () => {
      // Use a nested dir that doesn't exist
      const nestedDir = path.join(os.tmpdir(), 'wftt-db-nested-' + Date.now());
      process.env.DATA_DIR = nestedDir;
      try {
        database = await loadModule();
        const db = database.getDb();
        expect(fs.existsSync(nestedDir)).toBe(true);
        expect(fs.existsSync(path.join(nestedDir, 'warframe.db'))).toBe(true);
        database.closeDb();
      } finally {
        try { fs.rmSync(nestedDir, { recursive: true, force: true }); } catch {}
        process.env.DATA_DIR = tmpDir;
      }
    });

    it('records schema migration in schema_version table', async () => {
      database = await loadModule();
      const db = database.getDb();
      const versions = db.prepare('SELECT * FROM schema_version ORDER BY version').all();
      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].description).toBeTruthy();
      database.closeDb();
    });

    it('creates indexes on loadouts and todos tables', async () => {
      database = await loadModule();
      const db = database.getDb();
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
      ).all().map(r => r.name);

      expect(indexes).toContain('idx_loadouts_updated_at');
      expect(indexes).toContain('idx_todos_status');
      expect(indexes).toContain('idx_todos_updated_at');
      expect(indexes).toContain('idx_conflict_log_resolved');
      database.closeDb();
    });
  });

  describe('closeDb()', () => {
    beforeEach(() => {
      cleanDataDir();
    });

    it('closes the database connection', async () => {
      database = await loadModule();
      const db = database.getDb();
      database.closeDb();
      // After close, getDb() should return a new instance
      const db2 = database.getDb();
      expect(db2).not.toBe(db);
      expect(db2.open).toBe(true);
      database.closeDb();
    });

    it('is safe to call multiple times', async () => {
      database = await loadModule();
      database.getDb();
      database.closeDb();
      expect(() => database.closeDb()).not.toThrow();
    });

    it('is safe to call without initializing', async () => {
      database = await loadModule();
      expect(() => database.closeDb()).not.toThrow();
    });
  });

  describe('migrateFromJson()', () => {
    beforeEach(() => {
      cleanDataDir();
    });

    it('migrates loadouts.json into loadouts table', async () => {
      const loadoutsData = [
        { id: 'l1', name: 'Test Build', slots: [{ name: 'Primary' }], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
        { id: 'l2', name: 'Build 2', slots: [], created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-04T00:00:00Z' },
      ];
      fs.writeFileSync(path.join(tmpDir, 'loadouts.json'), JSON.stringify(loadoutsData));

      database = await loadModule();
      const result = database.migrateFromJson();

      expect(result).toBe(true);
      const db = database.getDb();
      const rows = db.prepare('SELECT * FROM loadouts ORDER BY id').all();
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe('l1');
      expect(rows[0].name).toBe('Test Build');
      expect(rows[0].version).toBe(1);

      // data column should contain the full object as JSON
      const parsed = JSON.parse(rows[0].data);
      expect(parsed.id).toBe('l1');
      expect(parsed.slots).toHaveLength(1);
      database.closeDb();
    });

    it('migrates todos.json into todos table', async () => {
      const todosData = [
        { id: 't1', user_notes: 'Farm neurodes', status: 'in_progress', priority: 'high', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' },
        { id: 't2', user_notes: 'Build forma', status: 'pending', priority: 'medium', created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-04T00:00:00Z' },
      ];
      fs.writeFileSync(path.join(tmpDir, 'todos.json'), JSON.stringify(todosData));

      database = await loadModule();
      const result = database.migrateFromJson();

      expect(result).toBe(true);
      const db = database.getDb();
      const rows = db.prepare('SELECT * FROM todos ORDER BY id').all();
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe('t1');
      expect(rows[0].user_notes).toBe('Farm neurodes');
      expect(rows[0].status).toBe('in_progress');
      expect(rows[0].version).toBe(1);
      database.closeDb();
    });

    it('migrates materials-inventory.json into materials_inventory table', async () => {
      const materialsData = { 'Polymer Bundle': 500, 'Nano Spores': 1200, 'Morphics': 30 };
      fs.writeFileSync(path.join(tmpDir, 'materials-inventory.json'), JSON.stringify(materialsData));

      database = await loadModule();
      const result = database.migrateFromJson();

      expect(result).toBe(true);
      const db = database.getDb();
      const rows = db.prepare('SELECT * FROM materials_inventory ORDER BY material_name').all();
      expect(rows).toHaveLength(3);
      expect(rows[0].material_name).toBe('Morphics');
      expect(rows[0].quantity).toBe(30);
      expect(rows[0].version).toBe(1);
      database.closeDb();
    });

    it('migrates all JSON files in a single call', async () => {
      fs.writeFileSync(path.join(tmpDir, 'loadouts.json'), JSON.stringify([{ id: 'l1', name: 'Test' }]));
      fs.writeFileSync(path.join(tmpDir, 'todos.json'), JSON.stringify([{ id: 't1', user_notes: 'Test' }]));
      fs.writeFileSync(path.join(tmpDir, 'materials-inventory.json'), JSON.stringify({ 'Alloy Plate': 200 }));

      database = await loadModule();
      const result = database.migrateFromJson();

      expect(result).toBe(true);
      const db = database.getDb();
      expect(db.prepare('SELECT COUNT(*) as c FROM loadouts').get().c).toBe(1);
      expect(db.prepare('SELECT COUNT(*) as c FROM todos').get().c).toBe(1);
      expect(db.prepare('SELECT COUNT(*) as c FROM materials_inventory').get().c).toBe(1);
      database.closeDb();
    });

    it('renames JSON files to .migrated after successful migration', async () => {
      fs.writeFileSync(path.join(tmpDir, 'loadouts.json'), JSON.stringify([{ id: 'l1', name: 'Test' }]));
      fs.writeFileSync(path.join(tmpDir, 'todos.json'), JSON.stringify([{ id: 't1', user_notes: 'Test' }]));

      database = await loadModule();
      database.migrateFromJson();

      expect(fs.existsSync(path.join(tmpDir, 'loadouts.json'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'loadouts.json.migrated'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'todos.json'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'todos.json.migrated'))).toBe(true);
      database.closeDb();
    });

    it('returns false and does not migrate if DB already has data', async () => {
      // First, populate the DB directly
      database = await loadModule();
      const db = database.getDb();
      db.prepare("INSERT INTO loadouts (id, name, data, version) VALUES ('existing', 'Exists', '{}', 1)").run();
      database.closeDb();

      // Now put a JSON file that should NOT be migrated
      fs.writeFileSync(path.join(tmpDir, 'loadouts.json'), JSON.stringify([{ id: 'new1', name: 'New' }]));

      database = await loadModule();
      const result = database.migrateFromJson();

      expect(result).toBe(false);
      const db2 = database.getDb();
      const rows = db2.prepare('SELECT * FROM loadouts').all();
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('existing');

      // JSON file should NOT have been renamed
      expect(fs.existsSync(path.join(tmpDir, 'loadouts.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'loadouts.json.migrated'))).toBe(false);
      database.closeDb();
    });

    it('returns false when no JSON files exist', async () => {
      database = await loadModule();
      const result = database.migrateFromJson();
      expect(result).toBe(false);
      database.closeDb();
    });

    it('handles empty JSON arrays gracefully', async () => {
      fs.writeFileSync(path.join(tmpDir, 'loadouts.json'), JSON.stringify([]));
      fs.writeFileSync(path.join(tmpDir, 'todos.json'), JSON.stringify([]));
      fs.writeFileSync(path.join(tmpDir, 'materials-inventory.json'), JSON.stringify({}));

      database = await loadModule();
      const result = database.migrateFromJson();

      expect(result).toBe(true);
      const db = database.getDb();
      expect(db.prepare('SELECT COUNT(*) as c FROM loadouts').get().c).toBe(0);
      expect(db.prepare('SELECT COUNT(*) as c FROM todos').get().c).toBe(0);
      expect(db.prepare('SELECT COUNT(*) as c FROM materials_inventory').get().c).toBe(0);
      // Should still rename empty files
      expect(fs.existsSync(path.join(tmpDir, 'loadouts.json.migrated'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'todos.json.migrated'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'materials-inventory.json.migrated'))).toBe(true);
      database.closeDb();
    });

    it('uses a transaction so partial failures roll back', async () => {
      // Provide a loadouts.json that works, and a corrupt todos.json
      fs.writeFileSync(path.join(tmpDir, 'loadouts.json'), JSON.stringify([{ id: 'l1', name: 'Good' }]));
      fs.writeFileSync(path.join(tmpDir, 'todos.json'), 'NOT VALID JSON');

      database = await loadModule();

      expect(() => database.migrateFromJson()).toThrow();

      // Loadouts should NOT have been inserted due to rollback
      const db = database.getDb();
      expect(db.prepare('SELECT COUNT(*) as c FROM loadouts').get().c).toBe(0);

      // JSON files should NOT have been renamed
      expect(fs.existsSync(path.join(tmpDir, 'loadouts.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'loadouts.json.migrated'))).toBe(false);
      database.closeDb();
    });
  });

  describe('materials_inventory table constraints', () => {
    beforeEach(() => {
      cleanDataDir();
    });

    it('rejects negative quantity', async () => {
      database = await loadModule();
      const db = database.getDb();
      expect(() => {
        db.prepare('INSERT INTO materials_inventory (material_name, quantity) VALUES (?, ?)').run('Test', -1);
      }).toThrow();
      database.closeDb();
    });
  });

  describe('todos table constraints', () => {
    beforeEach(() => {
      cleanDataDir();
    });

    it('rejects invalid status values', async () => {
      database = await loadModule();
      const db = database.getDb();
      expect(() => {
        db.prepare("INSERT INTO todos (id, user_notes, status) VALUES (?, ?, ?)").run('t1', 'test', 'invalid_status');
      }).toThrow();
      database.closeDb();
    });

    it('rejects invalid priority values', async () => {
      database = await loadModule();
      const db = database.getDb();
      expect(() => {
        db.prepare("INSERT INTO todos (id, user_notes, status, priority) VALUES (?, ?, ?, ?)").run('t1', 'test', 'pending', 'urgent');
      }).toThrow();
      database.closeDb();
    });
  });
});
