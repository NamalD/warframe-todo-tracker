/**
 * Additional tests for the SQLite-backed server-store persistence layer.
 *
 * Focuses on concurrent access patterns, data integrity edge cases,
 * and DB lifecycle interactions — complementing the core API tests
 * in server-store.test.js.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-store-sqlite-'));

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
  return await import('../../src/data/server-store.js?t=' + Date.now());
}

// ---------------------------------------------------------------------------
// Concurrent / interleaved access patterns
// ---------------------------------------------------------------------------

describe('concurrent access patterns', () => {
  let serverStore;

  beforeEach(async () => {
    cleanDataDir();
    serverStore = await loadModule();
  });

  it('supports rapid sequential read-write cycles across all domains', () => {
    const iterations = 20;
    for (let i = 0; i < iterations; i++) {
      serverStore.writeStore('loadouts', [{ id: 'loadout', cycle: i }]);
      serverStore.writeStore('todos', [{ id: 'todo', user_notes: `Cycle ${i}`, status: 'pending', priority: 'medium' }]);
      serverStore.writeStore('materials-inventory', { ['Material_' + i]: i * 10 });
    }

    const loadouts = serverStore.readStore('loadouts', []);
    const todos = serverStore.readStore('todos', []);
    const materials = serverStore.readStore('materials-inventory', {});

    expect(loadouts).toHaveLength(1);
    expect(loadouts[0].cycle).toBe(iterations - 1);
    expect(todos).toHaveLength(1);
    expect(todos[0].user_notes).toBe('Cycle ' + (iterations - 1));
    expect(materials['Material_' + (iterations - 1)]).toBe((iterations - 1) * 10);
  });

  it('interleaves reads across domains during write activity', () => {
    serverStore.writeStore('loadouts', [{ id: 'l1', name: 'Initial' }]);
    serverStore.writeStore('todos', [{ id: 't1', user_notes: 'Initial todo', status: 'pending', priority: 'medium' }]);
    serverStore.writeStore('materials-inventory', { Ferrite: 50 });

    // Read all three while performing additional writes
    serverStore.writeStore('loadouts', [{ id: 'l1', name: 'V2' }, { id: 'l2', name: 'New' }]);

    const loadoutsMid = serverStore.readStore('loadouts', []);
    expect(loadoutsMid).toHaveLength(2);

    serverStore.writeStore('todos', [{ id: 't1', user_notes: 'Updated todo', status: 'completed' }]);

    const todosMid = serverStore.readStore('todos', []);
    expect(todosMid).toHaveLength(1);
    expect(todosMid[0].status).toBe('completed');
  });

  it('read after write immediately returns consistent state', () => {
    const testData = [
      { id: 'a', name: 'Alpha', slots: [{ name: 'Primary', item: 'Braton' }] },
      { id: 'b', name: 'Beta', slots: [{ name: 'Secondary', item: 'Lex' }] },
    ];
    serverStore.writeStore('loadouts', testData);

    const readBack = serverStore.readStore('loadouts', []);
    expect(readBack).toEqual(testData);

    // Read again — should be idempotent
    const readAgain = serverStore.readStore('loadouts', []);
    expect(readAgain).toEqual(testData);
  });

  it('handles bulk writes followed by immediate reads', () => {
    const loadouts = Array.from({ length: 50 }, (_, i) => ({
      id: `bulk-l${i}`,
      name: `Loadout ${i}`,
      slots: [{ name: 'Slot', item: `Item ${i}` }],
    }));
    const todos = Array.from({ length: 50 }, (_, i) => ({
      id: `bulk-t${i}`,
      user_notes: `Todo ${i}`,
      status: i % 2 === 0 ? 'pending' : 'completed',
      priority: 'medium',
    }));

    serverStore.writeStore('loadouts', loadouts);
    serverStore.writeStore('todos', todos);

    expect(serverStore.readStore('loadouts', [])).toHaveLength(50);
    expect(serverStore.readStore('todos', [])).toHaveLength(50);

    // Verify specific items exist
    const loadedLoadouts = serverStore.readStore('loadouts', []);
    expect(loadedLoadouts.find(l => l.id === 'bulk-l0').name).toBe('Loadout 0');
    expect(loadedLoadouts.find(l => l.id === 'bulk-l49').name).toBe('Loadout 49');

    const loadedTodos = serverStore.readStore('todos', []);
    expect(loadedTodos.find(t => t.id === 'bulk-t0').user_notes).toBe('Todo 0');
    expect(loadedTodos.find(t => t.id === 'bulk-t49').user_notes).toBe('Todo 49');
  });
});

// ---------------------------------------------------------------------------
// Version-aware concurrent access
// ---------------------------------------------------------------------------

describe('version-aware concurrent writes', () => {
  let serverStore;

  beforeEach(async () => {
    cleanDataDir();
    serverStore = await loadModule();
  });

  it('writeStoreWithVersion rejects stale writes after rapid increments', () => {
    const versions = [];
    for (let i = 0; i < 5; i++) {
      const v = serverStore.writeStoreWithVersion(
        'loadouts',
        [{ id: 'l1', name: `Version ${i}`, seq: i }],
        i === 0 ? 0 : versions[i - 1]
      );
      versions.push(v);
    }

    // Version should be 5 after 5 writes
    expect(versions).toEqual([1, 2, 3, 4, 5]);
    expect(serverStore.readStoreVersion('loadouts')).toBe(5);

    // Stale write with version 2 should be rejected when server is at 5
    expect(() => {
      serverStore.writeStoreWithVersion('loadouts', [{ id: 'stale', name: 'Stale' }], 2);
    }).toThrow(serverStore.ConflictError);
  });

  it('readStoreWithVersion and writeStoreWithVersion interleave correctly', () => {
    // Write v1 via versioned API
    serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1', name: 'Initial' }], 0);
    let state = serverStore.readStoreWithVersion('loadouts', []);
    expect(state.version).toBe(1);
    expect(state.data).toHaveLength(1);
    expect(state.data[0].id).toBe('l1');

    // Write via plain writeStore (does not update version counter)
    serverStore.writeStore('loadouts', [{ id: 'l2', name: 'Legacy' }, { id: 'l3', name: 'Legacy 2' }]);
    expect(serverStore.readStoreVersion('loadouts')).toBe(1); // unchanged

    // Now writeStoreWithVersion with clientVersion=1 should succeed (1 >= 1)
    const v2 = serverStore.writeStoreWithVersion('loadouts', [{ id: 'final', name: 'Final' }], 1);
    expect(v2).toBe(2);

    state = serverStore.readStoreWithVersion('loadouts', []);
    expect(state.data).toHaveLength(1);
    expect(state.data[0].id).toBe('final');
    expect(state.version).toBe(2);
  });

  it('tracks version independently per domain under concurrent writes', () => {
    const loadoutVersion = serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 0);
    const todoVersion = serverStore.writeStoreWithVersion('todos', [{ id: 't1' }], 0);
    const materialVersion = serverStore.writeStoreWithVersion(
      'materials-inventory', { Ferrite: 100 }, 0
    );

    expect(loadoutVersion).toBe(1);
    expect(todoVersion).toBe(1);
    expect(materialVersion).toBe(1);

    // Write to loadouts again — only its version should advance
    const loadoutV2 = serverStore.writeStoreWithVersion('loadouts', [{ id: 'l1' }], 1);
    expect(loadoutV2).toBe(2);

    expect(serverStore.readStoreVersion('loadouts')).toBe(2);
    expect(serverStore.readStoreVersion('todos')).toBe(1);
    expect(serverStore.readStoreVersion('materials-inventory')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Data integrity edge cases
// ---------------------------------------------------------------------------

describe('data integrity edge cases', () => {
  let serverStore;

  beforeEach(async () => {
    cleanDataDir();
    serverStore = await loadModule();
  });

  it('handles unicode and special characters in loadout names', () => {
    const data = [{ id: 'uni-1', name: 'Prisma 双导管 日本語' }];
    serverStore.writeStore('loadouts', data);
    const result = serverStore.readStore('loadouts', []);
    expect(result[0].name).toBe('Prisma 双导管 日本語');
  });

  it('handles emoji in todo notes', () => {
    const data = [{ id: 'emoji-1', user_notes: 'Farm 🎯 and 🧪 materials', status: 'pending', priority: 'high' }];
    serverStore.writeStore('todos', data);
    const result = serverStore.readStore('todos', []);
    expect(result[0].user_notes).toBe('Farm 🎯 and 🧪 materials');
  });

  it('handles JSON-special characters in data', () => {
    const data = [{
      id: 'spec-1',
      name: 'Build "prime" variant [test]',
      notes: 'Line1\nLine2\tTabbed\nEscaped\\Char',
    }];
    serverStore.writeStore('loadouts', data);
    const result = serverStore.readStore('loadouts', []);
    expect(result[0].name).toBe('Build "prime" variant [test]');
    expect(result[0].notes).toBe('Line1\nLine2\tTabbed\nEscaped\\Char');
  });

  it('handles empty string IDs gracefully', () => {
    const data = [{ id: '', name: 'Empty ID Item' }];
    serverStore.writeStore('loadouts', data);
    const result = serverStore.readStore('loadouts', []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('');
    expect(result[0].name).toBe('Empty ID Item');
  });

  it('persists large text fields without truncation', () => {
    const longNotes = 'A'.repeat(10000);
    const data = [{ id: 'long-1', user_notes: longNotes, status: 'pending', priority: 'medium' }];
    serverStore.writeStore('todos', data);
    const result = serverStore.readStore('todos', []);
    expect(result[0].user_notes).toHaveLength(10000);
    expect(result[0].user_notes).toBe(longNotes);
  });

  it('preserves all fields of a loadout object with nested structure', () => {
    const loadout = {
      id: 'complex-1',
      name: 'Complex Build',
      slots: [
        {
          name: 'Primary',
          item: 'Braton Prime',
          rank: 30,
          polarities: ['V', 'D'],
        },
        {
          name: 'Secondary',
          item: 'Lex Prime',
          rank: 0,
          polarities: [],
        },
      ],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-06-15T12:30:00.000Z',
    };
    serverStore.writeStore('loadouts', [loadout]);
    const result = serverStore.readStore('loadouts', []);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(loadout);
  });

  it('preserves materials inventory keys with special characters', () => {
    const data = {
      'Polymer Bundle': 500,
      'Nano Spores (Orokin)': 1200,
      'Argon ★ Crystal': 3,
      'Ferrite/Alloy': 9999,
    };
    serverStore.writeStore('materials-inventory', data);
    const result = serverStore.readStore('materials-inventory', {});
    expect(result).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// DB lifecycle interactions with server-store
// ---------------------------------------------------------------------------

describe('DB lifecycle interactions', () => {
  let serverStore;

  beforeEach(async () => {
    cleanDataDir();
    serverStore = await loadModule();
  });

  it('survives module re-import with persisted data', async () => {
    // Write data
    serverStore.writeStore('loadouts', [{ id: 'survive-1', name: 'Survival Test' }]);
    serverStore.writeStore('todos', [{ id: 'survive-t1', user_notes: 'Survive', status: 'pending', priority: 'low' }]);
    serverStore.writeStore('materials-inventory', { Ferrite: 999 });

    // Re-import the server store module (fresh module, new getDb() call)
    const serverStore2 = await loadModule();

    const loadouts = serverStore2.readStore('loadouts', []);
    expect(loadouts).toHaveLength(1);
    expect(loadouts[0].name).toBe('Survival Test');

    const todos = serverStore2.readStore('todos', []);
    expect(todos).toHaveLength(1);
    expect(todos[0].user_notes).toBe('Survive');

    const materials = serverStore2.readStore('materials-inventory', {});
    expect(materials.Ferrite).toBe(999);
  });

  it('creates warframe.db file in DATA_DIR on first write', () => {
    serverStore.writeStore('loadouts', [{ id: 'db-file-1', name: 'DB File Test' }]);
    const dbPath = path.join(tmpDir, 'warframe.db');
    expect(fs.existsSync(dbPath)).toBe(true);

    // File should be non-empty (WAL + main DB)
    const stat = fs.statSync(dbPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it('data persists across close and reopen of database connection', async () => {
    serverStore.writeStore('loadouts', [{ id: 'persist-1', name: 'Persist Test' }]);

    // Import the database module and close to force reconnection
    const dbModule = await import('../../src/data/database.js?t=' + Date.now());
    dbModule.closeDb();

    // ServerStore's own getDb() is still open, so read still works
    const loadouts = serverStore.readStore('loadouts', []);
    expect(loadouts).toHaveLength(1);
    expect(loadouts[0].name).toBe('Persist Test');

    dbModule.closeDb();
  });
});
