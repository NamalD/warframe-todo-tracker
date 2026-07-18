import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-store-'));

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

async function loadModule() {
  const { vi: innerVi } = await import('vitest');
  innerVi.resetModules();
  return await import('../../src/data/server-store.ts?t=' + Date.now());
}

describe('server-store (SQLite-backed)', () => {
  let serverStore;

  describe('readStore', () => {
    beforeEach(async () => {
      cleanDataDir();
      serverStore = await loadModule();
    });

    it('returns defaultValue when the store is empty', () => {
      expect(serverStore.readStore('loadouts', [])).toEqual([]);
    });

    it('returns empty result when not specified and store is empty (SQLite table exists but has no rows)', () => {
      expect(serverStore.readStore('loadouts')).toEqual([]);
    });

    it('returns data written by writeStore for loadouts', () => {
      const data = [
        { id: 'l1', name: 'Build A', slots: [{ name: 'Primary' }] },
        { id: 'l2', name: 'Build B', slots: [] },
      ];
      serverStore.writeStore('loadouts', data);
      expect(serverStore.readStore('loadouts', [])).toEqual(data);
    });

    it('returns data written by writeStore for todos', () => {
      const data = [
        { id: 't1', user_notes: 'Farm neurodes', status: 'in_progress', priority: 'high' },
        { id: 't2', user_notes: 'Build forma', status: 'pending', priority: 'medium' },
      ];
      serverStore.writeStore('todos', data);
      const result = serverStore.readStore('todos', []);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 't1',
        user_notes: 'Farm neurodes',
        status: 'in_progress',
        priority: 'high',
      });
      expect(result[1]).toMatchObject({
        id: 't2',
        user_notes: 'Build forma',
        status: 'pending',
        priority: 'medium',
      });
    });

    it('returns data written by writeStore for materials-inventory', () => {
      const data = { 'Polymer Bundle': 500, 'Nano Spores': 1200 };
      serverStore.writeStore('materials-inventory', data);
      expect(serverStore.readStore('materials-inventory', {})).toEqual(data);
    });

    it('returns defaultValue for unknown keys', () => {
      expect(serverStore.readStore('nonexistent-key', 'fallback')).toBe('fallback');
    });

    it('returns empty array for known key with no rows', () => {
      expect(serverStore.readStore('loadouts', ['fallback'])).toEqual([]);
    });

    it('returns empty object for materials-inventory with no rows', () => {
      expect(serverStore.readStore('materials-inventory', { fallback: true })).toEqual({});
    });
  });

  describe('writeStore', () => {
    beforeEach(async () => {
      cleanDataDir();
      serverStore = await loadModule();
    });

    it('overwrites existing loadouts data', () => {
      serverStore.writeStore('loadouts', [{ id: 'l1', name: 'V1' }]);
      serverStore.writeStore('loadouts', [{ id: 'l1', name: 'V2' }, { id: 'l2', name: 'New' }]);
      const result = serverStore.readStore('loadouts', []);
      expect(result).toHaveLength(2);
      expect(result.find(r => r.id === 'l1').name).toBe('V2');
    });

    it('overwrites existing todos data', () => {
      serverStore.writeStore('todos', [{ id: 't1', user_notes: 'Old note' }]);
      serverStore.writeStore('todos', [{ id: 't1', user_notes: 'Updated note', status: 'completed' }]);
      const result = serverStore.readStore('todos', []);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 't1',
        user_notes: 'Updated note',
        status: 'completed',
      });
    });

    it('overwrites existing materials-inventory data', () => {
      serverStore.writeStore('materials-inventory', { 'Alloy Plate': 100 });
      serverStore.writeStore('materials-inventory', { 'Alloy Plate': 200, 'Polymer Bundle': 50 });
      expect(serverStore.readStore('materials-inventory', {})).toEqual({
        'Alloy Plate': 200,
        'Polymer Bundle': 50,
      });
    });

    it('handles empty array for loadouts', () => {
      serverStore.writeStore('loadouts', []);
      expect(serverStore.readStore('loadouts', ['fallback'])).toEqual([]);
    });

    it('handles empty array for todos', () => {
      serverStore.writeStore('todos', []);
      expect(serverStore.readStore('todos', ['fallback'])).toEqual([]);
    });

    it('handles empty object for materials-inventory', () => {
      serverStore.writeStore('materials-inventory', {});
      expect(serverStore.readStore('materials-inventory', { fallback: true })).toEqual({});
    });

    it('throws for unknown store keys', () => {
      expect(() => serverStore.writeStore('invalid-key', {})).toThrow();
    });
  });

  describe('atomicity and consistency', () => {
    beforeEach(async () => {
      cleanDataDir();
      serverStore = await loadModule();
    });

    it('multiple sequential writes are consistent for loadouts', () => {
      for (let i = 0; i < 10; i++) {
        serverStore.writeStore('loadouts', [{ id: 'seq', count: i }]);
        expect(serverStore.readStore('loadouts')).toEqual([{ id: 'seq', count: i }]);
      }
    });

    it('writes are atomic — partial failure does not leave partial data', () => {
      serverStore.writeStore('loadouts', [{ id: 'safe', name: 'Before' }]);
      expect(serverStore.readStore('loadouts')).toEqual([{ id: 'safe', name: 'Before' }]);

      const circular = { id: 'bad' };
      circular.self = circular;

      expect(() => serverStore.writeStore('loadouts', [circular])).toThrow();
      expect(serverStore.readStore('loadouts')).toEqual([{ id: 'safe', name: 'Before' }]);
    });

    it('stores all three domains independently', () => {
      serverStore.writeStore('loadouts', [{ id: 'l1', name: 'Build' }]);
      serverStore.writeStore('todos', [{ id: 't1', user_notes: 'Todo' }]);
      serverStore.writeStore('materials-inventory', { 'Ferrite': 500 });

      expect(serverStore.readStore('loadouts', [])).toHaveLength(1);
      expect(serverStore.readStore('todos', [])).toHaveLength(1);
      expect(Object.keys(serverStore.readStore('materials-inventory', {}))).toHaveLength(1);
    });
  });
});

describe('version-aware API (readStoreVersion / writeStoreWithVersion)', () => {
  let serverStore;

  beforeEach(async () => {
    cleanDataDir();
    serverStore = await loadModule();
  });

  describe('readStoreVersion', () => {
    it('returns 0 when no writes have been performed', () => {
      expect(serverStore.readStoreVersion('loadouts')).toBe(0);
    });

    it('returns 0 for any key that has never been written', () => {
      expect(serverStore.readStoreVersion('todos')).toBe(0);
      expect(serverStore.readStoreVersion('materials-inventory')).toBe(0);
    });

    it('returns the version after a writeStoreWithVersion call', () => {
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1', name: 'Test' }], 0);
      expect(serverStore.readStoreVersion('loadouts')).toBe(1);
    });

    it('increments version on each write', () => {
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 0);  // → v1
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 1);  // → v2
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 2);  // → v3
      expect(serverStore.readStoreVersion('loadouts')).toBe(3);
    });
  });

  describe('readStoreWithVersion', () => {
    it('returns data and version', () => {
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1', name: 'Build' }], 0);
      const result = serverStore.readStoreWithVersion('loadouts', []);
      expect(result.data).toEqual([{ id: 'l1', name: 'Build' }]);
      expect(result.version).toBe(1);
    });

    it('returns default data with version 0 when store is empty', () => {
      const result = serverStore.readStoreWithVersion('loadouts', []);
      expect(result.data).toEqual([]);
      expect(result.version).toBe(0);
    });

    it('tracks version independently per domain', () => {
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 0);
      serverStore.writeStoreWithVersion('todos', [{ id: 't1' }], 0);
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 1);

      expect(serverStore.readStoreWithVersion('loadouts', []).version).toBe(2);
      expect(serverStore.readStoreWithVersion('todos', []).version).toBe(1);
    });
  });

  describe('writeStoreWithVersion', () => {
    it('accepts write when client version matches server version', () => {
      const newVersion = serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 0);
      expect(newVersion).toBe(1);
      expect(serverStore.readStore('loadouts', [])).toEqual([{ id: 'l1' }]);
    });

    it('accepts write when client version is ahead of server', () => {
      // Client version 5, server version 0 — accepted via LWW
      // New version = clientVersion + 1 = 6
      const newVersion = serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 5);
      expect(newVersion).toBe(6);
    });

    it('rejects write when client version is behind server', () => {
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 0);  // → v1
      expect(() => {
        serverStore.writeStoreWithVersion('loadouts', [{ id: 'l2' }], 0);
      }).toThrow(serverStore.ConflictError);
    });

    it('ConflictError has the correct server version', () => {
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 0);  // → v1
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 1);  // → v2

      try {
        serverStore.writeStoreWithVersion('loadouts', [{ id: 'l2' }], 1);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(serverStore.ConflictError);
        expect(err.serverVersion).toBe(2);
        expect(err.key).toBe('loadouts');
      }
    });

    it('data is not written on version conflict', () => {
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'original' }], 0);  // → v1
      expect(() => {
        serverStore.writeStoreWithVersion('loadouts', [{ id: 'usurper' }], 0);
      }).toThrow();
      // Original data should be preserved
      expect(serverStore.readStore('loadouts', [])).toEqual([{ id: 'original' }]);
    });

    it('works for todos domain', () => {
      const v1 = serverStore.writeStoreWithVersion('todos', [{ id: 't1', user_notes: 'First' }], 0);
      expect(v1).toBe(1);
      expect(() => {
        serverStore.writeStoreWithVersion('todos', [{ id: 't2' }], 0);
      }).toThrow(serverStore.ConflictError);
    });

    it('works for materials-inventory domain', () => {
      const v1 = serverStore.writeStoreWithVersion('materials-inventory', { 'Ferrite': 100 }, 0);
      expect(v1).toBe(1);
      const v2 = serverStore.writeStoreWithVersion('materials-inventory', { 'Ferrite': 200 }, 1);
      expect(v2).toBe(2);
      expect(() => {
        serverStore.writeStoreWithVersion('materials-inventory', { 'Ferrite': 0 }, 1);
      }).toThrow(serverStore.ConflictError);
    });
  });

  describe('writeStore (backward compatible)', () => {
    it('writeStore does not update version counter', () => {
      serverStore.writeStore('loadouts', [{ id: 'l1' }]);
      expect(serverStore.readStoreVersion('loadouts')).toBe(0);
    });

    it('mixed writeStore and writeStoreWithVersion works', () => {
      serverStore.writeStore('loadouts', [{ id: 'l1' }]);  // no version tracking
      const v1 = serverStore.writeStoreWithVersion('loadouts', [{ id: 'l2' }], 0);
      expect(v1).toBe(1);
      expect(serverStore.readStoreVersion('loadouts')).toBe(1);
    });
  });
});
