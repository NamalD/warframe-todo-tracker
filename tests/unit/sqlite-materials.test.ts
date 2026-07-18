import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-materials-'));

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

describe('sqlite-materials module', () => {
  let database;
  let materials;
  let db;

  async function loadModules() {
    vi.resetModules();
    database = await import('../../src/data/database.ts?t=' + Date.now());
    materials = await import('../../src/data/sqlite-materials.ts?t=' + Date.now());
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
  // getAllMaterials
  // -----------------------------------------------------------------------

  describe('getAllMaterials()', () => {
    it('returns an empty object when the table is empty', () => {
      const result = materials.getAllMaterials(db);
      expect(result).toEqual({});
    });

    it('returns all materials as a key-value map', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 1, '2026-01-01T00:00:00Z');
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Nano Spores', 12000, 2, '2026-01-02T00:00:00Z');
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Orokin Cell', 8, 1, '2026-01-03T00:00:00Z');

      const result = materials.getAllMaterials(db);
      expect(result).toEqual({
        'Polymer Bundle': 500,
        'Nano Spores': 12000,
        'Orokin Cell': 8,
      });
    });

    it('returns a single material correctly', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Ferrite', 2500, 1, '2026-01-01T00:00:00Z');

      const result = materials.getAllMaterials(db);
      expect(result).toEqual({ 'Ferrite': 2500 });
    });

    it('handles material names with special characters', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Tellurium (Rare)', 15, 1, '2026-01-01T00:00:00Z');

      const result = materials.getAllMaterials(db);
      expect(result).toEqual({ 'Tellurium (Rare)': 15 });
    });
  });

  // -----------------------------------------------------------------------
  // getMaterial
  // -----------------------------------------------------------------------

  describe('getMaterial()', () => {
    it('returns null for a non-existent material', () => {
      const result = materials.getMaterial(db, 'Nonexistent Material');
      expect(result).toBeNull();
    });

    it('returns the full material row for an existing material', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 3, '2026-03-01T00:00:00Z');

      const result = materials.getMaterial(db, 'Polymer Bundle');
      expect(result).not.toBeNull();
      expect(result.material_name).toBe('Polymer Bundle');
      expect(result.quantity).toBe(500);
      expect(result.version).toBe(3);
      expect(result.updated_at).toBe('2026-03-01T00:00:00Z');
    });

    it('returns null for an empty string material name', () => {
      const result = materials.getMaterial(db, '');
      expect(result).toBeNull();
    });

    it('is case-sensitive in material name lookup', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('polymer bundle', 100, 1, '2026-01-01T00:00:00Z');
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 200, 1, '2026-01-01T00:00:00Z');

      const result = materials.getMaterial(db, 'Polymer Bundle');
      expect(result).not.toBeNull();
      expect(result.quantity).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // upsertMaterial
  // -----------------------------------------------------------------------

  describe('upsertMaterial()', () => {
    it('creates a new material with version=1 and auto timestamps', () => {
      const result = materials.upsertMaterial(db, 'Polymer Bundle', 500);

      expect(result.material_name).toBe('Polymer Bundle');
      expect(result.quantity).toBe(500);
      expect(result.version).toBe(1);
      expect(result.updated_at).toBeTruthy();
    });

    it('persists the new material to the database', () => {
      materials.upsertMaterial(db, 'Polymer Bundle', 500);

      const row = db.prepare('SELECT * FROM materials_inventory').get();
      expect(row.material_name).toBe('Polymer Bundle');
      expect(row.quantity).toBe(500);
      expect(row.version).toBe(1);
    });

    it('updates an existing material and increments version', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 3, '2026-01-01T00:00:00Z');

      const result = materials.upsertMaterial(db, 'Polymer Bundle', 750);

      expect(result.material_name).toBe('Polymer Bundle');
      expect(result.quantity).toBe(750);
      expect(result.version).toBe(4); // incremented from 3
      expect(result.updated_at).not.toBe('2026-01-01T00:00:00Z');
    });

    it('returns an object with the correct shape', () => {
      const result = materials.upsertMaterial(db, 'Polymer Bundle', 100);

      expect(result).toHaveProperty('material_name');
      expect(result).toHaveProperty('quantity');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('updated_at');
      expect(Object.keys(result)).toHaveLength(4);
    });

    it('sets quantity to 0 when explicitly inserted', () => {
      const result = materials.upsertMaterial(db, 'Empty Material', 0);
      expect(result.quantity).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // upsertMaterialWithVersion
  // -----------------------------------------------------------------------

  describe('upsertMaterialWithVersion()', () => {
    it('accepts a new material regardless of clientVersion', () => {
      const result = materials.upsertMaterialWithVersion(db, 'New Material', 100, 99);

      expect(result.material_name).toBe('New Material');
      expect(result.quantity).toBe(100);
      expect(result.version).toBe(1);
      expect(result.conflict).toBeUndefined();
    });

    it('succeeds when clientVersion matches serverVersion', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 5, '2026-01-01T00:00:00Z');

      const result = materials.upsertMaterialWithVersion(db, 'Polymer Bundle', 750, 5);

      expect(result.conflict).toBeUndefined();
      expect(result.material_name).toBe('Polymer Bundle');
      expect(result.quantity).toBe(750);
      expect(result.version).toBe(6); // incremented from 5
    });

    it('succeeds when clientVersion > serverVersion', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 5, '2026-01-01T00:00:00Z');

      const result = materials.upsertMaterialWithVersion(db, 'Polymer Bundle', 1000, 10);

      expect(result.conflict).toBeUndefined();
      expect(result.quantity).toBe(1000);
      expect(result.version).toBe(6);
    });

    it('returns conflict when clientVersion < serverVersion', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 5, '2026-01-01T00:00:00Z');

      const result = materials.upsertMaterialWithVersion(db, 'Polymer Bundle', 999, 3);

      expect(result.conflict).toBe(true);
      expect(result.serverVersion).toBe(5);
      expect(result.material_name).toBe('Polymer Bundle');
      expect(result.serverQuantity).toBe(500);
    });

    it('does not modify the row on version conflict', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 5, '2026-01-01T00:00:00Z');

      materials.upsertMaterialWithVersion(db, 'Polymer Bundle', 999, 3);

      const row = db.prepare('SELECT * FROM materials_inventory').get();
      expect(row.quantity).toBe(500);
      expect(row.version).toBe(5);
    });

    it('increments version by 1 on success', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 2, '2026-01-01T00:00:00Z');

      materials.upsertMaterialWithVersion(db, 'Polymer Bundle', 600, 2);

      const row = db.prepare('SELECT * FROM materials_inventory').get();
      expect(row.version).toBe(3);
    });

    it('updates the updated_at timestamp on successful update', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 2, '2026-01-01T00:00:00Z');

      const result = materials.upsertMaterialWithVersion(db, 'Polymer Bundle', 600, 2);
      expect(result.updated_at).toBeTruthy();
      expect(result.updated_at).not.toBe('2026-01-01T00:00:00Z');
    });

    it('handles zero clientVersion for a new material', () => {
      const result = materials.upsertMaterialWithVersion(db, 'New Mat', 50, 0);
      expect(result.version).toBe(1);
      expect(result.quantity).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // batchUpsert
  // -----------------------------------------------------------------------

  describe('batchUpsert()', () => {
    it('upserts multiple new materials', () => {
      const entries = [
        { material_name: 'Polymer Bundle', quantity: 500 },
        { material_name: 'Nano Spores', quantity: 12000 },
        { material_name: 'Ferrite', quantity: 2500 },
      ];

      const result = materials.batchUpsert(db, entries);
      expect(result).toBeDefined();
      // Each entry should have been inserted
      const all = materials.getAllMaterials(db);
      expect(all).toEqual({
        'Polymer Bundle': 500,
        'Nano Spores': 12000,
        'Ferrite': 2500,
      });
    });

    it('upserts a mix of new and existing materials', () => {
      db.prepare(
        "INSERT INTO materials_inventory (material_name, quantity, version, updated_at) VALUES (?, ?, ?, ?)"
      ).run('Polymer Bundle', 500, 3, '2026-01-01T00:00:00Z');

      const entries = [
        { material_name: 'Polymer Bundle', quantity: 750 }, // existing, version 3→4
        { material_name: 'Ferrite', quantity: 2500 },       // new
      ];

      materials.batchUpsert(db, entries);

      const polymer = materials.getMaterial(db, 'Polymer Bundle');
      expect(polymer.quantity).toBe(750);
      expect(polymer.version).toBe(4);

      const ferrite = materials.getMaterial(db, 'Ferrite');
      expect(ferrite.quantity).toBe(2500);
      expect(ferrite.version).toBe(1);
    });

    it('handles an empty array', () => {
      const result = materials.batchUpsert(db, []);
      expect(result).toBeDefined();
      // Table should be unchanged (empty in this case)
      expect(materials.getAllMaterials(db)).toEqual({});
    });

    it('processes a single entry', () => {
      materials.batchUpsert(db, [{ material_name: 'Single', quantity: 1 }]);
      expect(materials.getAllMaterials(db)).toEqual({ 'Single': 1 });
    });

    it('returns an array of result objects', () => {
      const entries = [
        { material_name: 'Mat A', quantity: 10 },
        { material_name: 'Mat B', quantity: 20 },
      ];

      const result = materials.batchUpsert(db, entries);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].material_name).toBe('Mat A');
      expect(result[1].material_name).toBe('Mat B');
    });
  });

  // Note: materials_inventory used to have a `replaceAllMaterials` destructive
  // bulk-replace function (DELETE FROM + reinsert), removed per #14 — any
  // device's bulk push would wipe out materials only set on other devices.
  // The API route now uses `batchUpsert` (per-key merge, tested above)
  // instead, which is safe by construction.

  // -----------------------------------------------------------------------
  // Integration scenarios
  // -----------------------------------------------------------------------

  describe('integration scenarios', () => {
    it('round-trips a material through upsert → getMaterial → upsertWithVersion → getAll', () => {
      // Create
      const created = materials.upsertMaterial(db, 'Polymer Bundle', 500);
      expect(created.version).toBe(1);
      expect(created.quantity).toBe(500);

      // Get by name
      const fetched = materials.getMaterial(db, 'Polymer Bundle');
      expect(fetched.quantity).toBe(500);
      expect(fetched.version).toBe(1);

      // Update with version check
      const updated = materials.upsertMaterialWithVersion(db, 'Polymer Bundle', 750, 1);
      expect(updated.version).toBe(2);
      expect(updated.quantity).toBe(750);

      // GetAll shows the updated value
      const all = materials.getAllMaterials(db);
      expect(all).toEqual({ 'Polymer Bundle': 750 });

      // Stale version caught
      const stale = materials.upsertMaterialWithVersion(db, 'Polymer Bundle', 999, 1);
      expect(stale.conflict).toBe(true);
      expect(stale.serverVersion).toBe(2);
    });

    it('supports batch upsert merging with existing entries', () => {
      materials.upsertMaterial(db, 'Initial', 10);

      materials.batchUpsert(db, [
        { material_name: 'Batch A', quantity: 100 },
        { material_name: 'Batch B', quantity: 200 },
      ]);

      expect(materials.getAllMaterials(db)).toEqual({
        'Initial': 10,
        'Batch A': 100,
        'Batch B': 200,
      });

      // A further batch upsert only touches the keys it mentions
      materials.batchUpsert(db, [{ material_name: 'Batch A', quantity: 150 }]);
      expect(materials.getAllMaterials(db)).toEqual({
        'Initial': 10,
        'Batch A': 150,
        'Batch B': 200,
      });
    });

    it('detects stale version after an upsert', () => {
      const created = materials.upsertMaterial(db, 'Material', 100);
      expect(created.version).toBe(1);

      // Update: version 1 → 2
      materials.upsertMaterialWithVersion(db, 'Material', 200, 1);

      // Try stale clientVersion (1 instead of 2)
      const conflict = materials.upsertMaterialWithVersion(db, 'Material', 300, 1);
      expect(conflict.conflict).toBe(true);
      expect(conflict.serverVersion).toBe(2);
    });
  });
});
