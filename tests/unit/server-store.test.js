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

describe('server-store (SQLite-backed)', () => {
  let serverStore;

  async function loadModule() {
    vi.resetModules();
    return await import('../../src/data/server-store.js?t=' + Date.now());
  }

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
