import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-loadouts-'));

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

describe('sqlite-loadouts module', () => {
  let database;
  let loadouts;
  let db;

  async function loadModules() {
    vi.resetModules();
    database = await import('../../src/data/database.js?t=' + Date.now());
    loadouts = await import('../../src/data/sqlite-loadouts.js?t=' + Date.now());
    db = database.getDb();
  }

  beforeEach(async () => {
    cleanDataDir();
    await loadModules();
  });

  afterEach(() => {
    database.closeDb();
  });

  // -----------------------------------------------------------------------
  // getAllLoadouts
  // -----------------------------------------------------------------------

  describe('getAllLoadouts()', () => {
    it('returns an empty array when the table is empty', () => {
      const result = loadouts.getAllLoadouts(db);
      expect(result).toEqual([]);
    });

    it('returns all loadouts with parsed data JSON', () => {
      db.prepare(
        "INSERT INTO loadouts (id, name, data, version, created_at, updated_at) VALUES (?, ?, ?, 1, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')"
      ).run('l1', 'Build A', JSON.stringify({ slots: [{ name: 'Primary' }] }));
      db.prepare(
        "INSERT INTO loadouts (id, name, data, version, created_at, updated_at) VALUES (?, ?, ?, 2, '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z')"
      ).run('l2', 'Build B', JSON.stringify({ slots: [{ name: 'Secondary' }] }));

      const result = loadouts.getAllLoadouts(db);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('l1');
      expect(result[0].name).toBe('Build A');
      expect(result[0].version).toBe(1);
      expect(result[0].data).toEqual({ slots: [{ name: 'Primary' }] });
      expect(result[0].created_at).toBe('2026-01-01T00:00:00Z');
      expect(result[0].updated_at).toBe('2026-01-02T00:00:00Z');

      expect(result[1].id).toBe('l2');
      expect(result[1].name).toBe('Build B');
      expect(result[1].data).toEqual({ slots: [{ name: 'Secondary' }] });
    });

    it('handles a loadout with empty JSON data', () => {
      db.prepare(
        "INSERT INTO loadouts (id, name, data, version, created_at, updated_at) VALUES (?, ?, '{}', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
      ).run('l1', 'Empty Build');

      const result = loadouts.getAllLoadouts(db);
      expect(result).toHaveLength(1);
      expect(result[0].data).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // getLoadoutById
  // -----------------------------------------------------------------------

  describe('getLoadoutById()', () => {
    it('returns null for a non-existent ID', () => {
      const result = loadouts.getLoadoutById(db, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns the loadout with parsed data JSON', () => {
      db.prepare(
        "INSERT INTO loadouts (id, name, data, version, created_at, updated_at) VALUES (?, ?, ?, 3, '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z')"
      ).run('l3', 'My Build', JSON.stringify({ mods: ['Serration'] }));

      const result = loadouts.getLoadoutById(db, 'l3');
      expect(result).not.toBeNull();
      expect(result.id).toBe('l3');
      expect(result.name).toBe('My Build');
      expect(result.version).toBe(3);
      expect(result.data).toEqual({ mods: ['Serration'] });
    });
  });

  // -----------------------------------------------------------------------
  // createLoadout
  // -----------------------------------------------------------------------

  describe('createLoadout()', () => {
    it('creates a loadout with version=1 and auto timestamps', () => {
      const data = { slots: [{ name: 'Warframe', itemName: 'Excalibur' }] };
      const result = loadouts.createLoadout(db, { name: 'New Build', data });

      expect(result.id).toBeTruthy();
      expect(result.name).toBe('New Build');
      expect(result.version).toBe(1);
      expect(result.data).toEqual(data);
      expect(result.created_at).toBeTruthy();
      expect(result.updated_at).toBeTruthy();
    });

    it('persists the loadout to the database', () => {
      const data = { requirements: [{ name: 'Orokin Cell', count: 1 }] };
      loadouts.createLoadout(db, { name: 'Persisted Build', data });

      const row = db.prepare('SELECT * FROM loadouts').get();
      expect(row.name).toBe('Persisted Build');
      expect(JSON.parse(row.data)).toEqual(data);
      expect(row.version).toBe(1);
    });

    it('accepts an explicit ID', () => {
      const result = loadouts.createLoadout(db, { name: 'Explicit ID', data: {}, id: 'my-custom-id' });
      expect(result.id).toBe('my-custom-id');
    });

    it('stores data as parseable JSON', () => {
      const data = { nested: { array: [1, 2, 3], obj: { k: 'v' } } };
      loadouts.createLoadout(db, { name: 'Nested', data });

      const row = db.prepare('SELECT data FROM loadouts').get();
      expect(() => JSON.parse(row.data)).not.toThrow();
      expect(JSON.parse(row.data)).toEqual(data);
    });
  });

  // -----------------------------------------------------------------------
  // updateLoadout
  // -----------------------------------------------------------------------

  describe('updateLoadout()', () => {
    beforeEach(() => {
      db.prepare(
        "INSERT INTO loadouts (id, name, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('l1', 'Original', JSON.stringify({ slots: [] }), 5, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
    });

    it('updates successfully when clientVersion matches serverVersion', () => {
      const newData = { slots: [{ name: 'Primary', itemName: 'Braton' }] };
      const result = loadouts.updateLoadout(db, 'l1', newData, 5);

      expect(result.conflict).toBeUndefined();
      expect(result.version).toBe(6);
      expect(result.data).toEqual(newData);
      expect(result.name).toBe('Original');
      expect(result.updated_at).not.toBe('2026-01-02T00:00:00Z');
    });

    it('updates successfully when clientVersion > serverVersion', () => {
      const newData = { slots: [{ name: 'Melee' }] };
      const result = loadouts.updateLoadout(db, 'l1', newData, 10);

      expect(result.conflict).toBeUndefined();
      expect(result.version).toBe(6);
      expect(result.data).toEqual(newData);
    });

    it('returns conflict when clientVersion < serverVersion', () => {
      const result = loadouts.updateLoadout(db, 'l1', { slots: [] }, 3);

      expect(result.conflict).toBe(true);
      expect(result.serverVersion).toBe(5);
      expect(result.serverData).toBeDefined();
      expect(result.serverId).toBe('l1');
    });

    it('increments version by 1 on success', () => {
      loadouts.updateLoadout(db, 'l1', { slots: [{ name: 'Updated' }] }, 5);

      const row = db.prepare('SELECT version FROM loadouts WHERE id = ?').get('l1');
      expect(row.version).toBe(6);
    });

    it('updates the updated_at timestamp', () => {
      const result = loadouts.updateLoadout(db, 'l1', { slots: [] }, 5);
      expect(result.updated_at).toBeTruthy();
      // Should not equal the original
      expect(result.updated_at).not.toBe('2026-01-02T00:00:00Z');
    });

    it('throws on non-existent ID', () => {
      expect(() => {
        loadouts.updateLoadout(db, 'nonexistent', {}, 1);
      }).toThrow(/not found/i);
    });
  });

  // -----------------------------------------------------------------------
  // deleteLoadout
  // -----------------------------------------------------------------------

  describe('deleteLoadout()', () => {
    beforeEach(() => {
      db.prepare(
        "INSERT INTO loadouts (id, name, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('l1', 'To Delete', JSON.stringify({ slots: [] }), 3, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
    });

    it('deletes successfully when clientVersion >= serverVersion', () => {
      const result = loadouts.deleteLoadout(db, 'l1', 3);
      expect(result).toEqual({ success: true });

      const row = db.prepare('SELECT * FROM loadouts WHERE id = ?').get('l1');
      expect(row).toBeUndefined();
    });

    it('deletes successfully when clientVersion > serverVersion', () => {
      const result = loadouts.deleteLoadout(db, 'l1', 10);
      expect(result).toEqual({ success: true });
    });

    it('returns conflict when clientVersion < serverVersion', () => {
      const result = loadouts.deleteLoadout(db, 'l1', 1);
      expect(result.conflict).toBe(true);
      expect(result.serverVersion).toBe(3);
      expect(result.serverData).toBeDefined();
      expect(result.serverId).toBe('l1');
    });

    it('does not delete the row on conflict', () => {
      loadouts.deleteLoadout(db, 'l1', 1);

      const row = db.prepare('SELECT * FROM loadouts WHERE id = ?').get('l1');
      expect(row).toBeDefined();
      expect(row.version).toBe(3);
    });

    it('returns notFound for non-existent ID', () => {
      const result = loadouts.deleteLoadout(db, 'nonexistent', 1);
      expect(result).toEqual({ notFound: true });
    });
  });

  // -----------------------------------------------------------------------
  // mergeNewLoadouts
  // -----------------------------------------------------------------------

  describe('mergeNewLoadouts()', () => {
    beforeEach(() => {
      // Insert some existing loadouts
      db.prepare(
        "INSERT INTO loadouts (id, name, data, version, created_at, updated_at) VALUES (?, ?, ?, 1, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')"
      ).run('old1', 'Old Build', JSON.stringify({ slots: [{ name: 'Old' }] }));
      db.prepare(
        "INSERT INTO loadouts (id, name, data, version, created_at, updated_at) VALUES (?, ?, ?, 2, '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z')"
      ).run('old2', 'Another Old', JSON.stringify({ slots: [{ name: 'Vintage' }] }));
    });

    it('inserts new loadouts without touching existing rows (see #14)', () => {
      const newLoadouts = [
        { id: 'new1', name: 'New Build', data: { slots: [{ name: 'Primary' }] } },
        { id: 'new2', name: 'Another New', data: { slots: [{ name: 'Secondary' }] } },
      ];

      loadouts.mergeNewLoadouts(db, newLoadouts);

      const rows = db.prepare('SELECT * FROM loadouts ORDER BY id').all();
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.id)).toEqual(['new1', 'new2', 'old1', 'old2']);
      const inserted = rows.find((r) => r.id === 'new1');
      expect(inserted.name).toBe('New Build');
      expect(inserted.version).toBe(1);
    });

    it('does not delete existing rows when given an empty array', () => {
      loadouts.mergeNewLoadouts(db, []);

      const count = db.prepare('SELECT COUNT(*) as c FROM loadouts').get().c;
      expect(count).toBe(2);
    });

    it('accepts the client\'s flat local-model shape (no explicit .data key)', () => {
      // loadout-repository.js's actual local model has no `.data` wrapper —
      // slots live at the top level. Everything but id/name/timestamps
      // should be captured into the stored `data` blob.
      loadouts.mergeNewLoadouts(db, [
        {
          id: 'flat1',
          name: 'Flat Shape Loadout',
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-02T00:00:00Z',
          slots: [{ id: 'flat1-warframe', slot_type: 'warframe', item_id: null }],
        },
      ]);

      const row = db.prepare('SELECT * FROM loadouts WHERE id = ?').get('flat1');
      expect(JSON.parse(row.data)).toEqual({
        slots: [{ id: 'flat1-warframe', slot_type: 'warframe', item_id: null }],
      });
    });

    it('ignores an incoming loadout whose id already exists (never overwrites)', () => {
      loadouts.mergeNewLoadouts(db, [
        { id: 'old1', name: 'Clobbered?', data: { slots: [{ name: 'New Data' }] } },
      ]);

      const row = db.prepare('SELECT * FROM loadouts WHERE id = ?').get('old1');
      expect(row.name).toBe('Old Build');
      expect(JSON.parse(row.data)).toEqual({ slots: [{ name: 'Old' }] });
    });

    it('is atomic — on failure, old rows remain', () => {
      // Provide a loadout without an id to cause a NOT NULL violation
      expect(() => {
        loadouts.mergeNewLoadouts(db, [
          { id: 'good1', name: 'Good', data: {} },
          { name: 'Bad', data: {} }, // missing id
        ]);
      }).toThrow();

      // Old rows should still be there, and the valid new row shouldn't have
      // been partially committed either (whole transaction rolls back)
      const rows = db.prepare('SELECT * FROM loadouts ORDER BY id').all();
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe('old1');
      expect(rows[1].id).toBe('old2');
    });

    it('stores data as parseable JSON for newly-inserted rows', () => {
      loadouts.mergeNewLoadouts(db, [
        { id: 'r1', name: 'Merge Test', data: { nested: { value: 42 } } },
      ]);

      const row = db.prepare('SELECT data FROM loadouts WHERE id = ?').get('r1');
      expect(JSON.parse(row.data)).toEqual({ nested: { value: 42 } });
    });

    it('sets version=1 and timestamps for newly-inserted rows', () => {
      loadouts.mergeNewLoadouts(db, [
        { id: 'r1', name: 'Fresh', data: {} },
      ]);

      const row = db.prepare('SELECT * FROM loadouts WHERE id = ?').get('r1');
      expect(row.version).toBe(1);
      expect(row.created_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases / integration
  // -----------------------------------------------------------------------

  describe('integration scenarios', () => {
    it('round-trips a full loadout through create → getAll → getById → update', () => {
      const originalData = {
        slots: [
          { name: 'Warframe', itemName: 'Rhino', mods: ['Intensify', 'Continuity'] },
          { name: 'Primary', itemName: 'Boltor', mods: ['Serration'] },
        ],
        requirements: [{ materialName: 'Neurodes', count: 5 }],
      };

      // Create
      const created = loadouts.createLoadout(db, { name: 'Rhino Build', data: originalData });
      expect(created.version).toBe(1);
      expect(created.data).toEqual(originalData);

      // GetAll
      const all = loadouts.getAllLoadouts(db);
      expect(all).toHaveLength(1);
      expect(all[0].data).toEqual(originalData);

      // GetById
      const byId = loadouts.getLoadoutById(db, created.id);
      expect(byId.data).toEqual(originalData);

      // Update
      const updatedData = { slots: [{ name: 'Warframe', itemName: 'Rhino Prime', mods: [] }], requirements: [] };
      const updated = loadouts.updateLoadout(db, created.id, updatedData, 1);
      expect(updated.version).toBe(2);
      expect(updated.data).toEqual(updatedData);

      // Verify via getById
      const refreshed = loadouts.getLoadoutById(db, created.id);
      expect(refreshed.data).toEqual(updatedData);
      expect(refreshed.version).toBe(2);
    });

    it('detects stale update after another update', () => {
      const created = loadouts.createLoadout(db, { name: 'Build', data: { slots: [] } });
      expect(created.version).toBe(1);

      // First update: version 1 → 2
      loadouts.updateLoadout(db, created.id, { slots: [{ name: 'A' }] }, 1);

      // Second update with stale clientVersion (1 instead of 2)
      const conflict = loadouts.updateLoadout(db, created.id, { slots: [{ name: 'B' }] }, 1);
      expect(conflict.conflict).toBe(true);
      expect(conflict.serverVersion).toBe(2);
    });
  });
});
