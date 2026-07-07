/**
 * Tests for SQLite-backed API routes (Phase 1 — bulk replace).
 *
 * These tests verify that GET returns the full dataset and PUT replaces
 * it atomically. Version conflict resolution (409) was removed in Phase 1
 * — the routes now use SQLite CRUD modules directly with `replaceAll*`
 * functions. Validation of the { data, version } contract is preserved
 * for backward compatibility.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-routes-sqlite-'));

let GET_loadouts, PUT_loadouts;
let GET_todos, PUT_todos;
let GET_materials, PUT_materials;

beforeAll(async () => {
  process.env.DATA_DIR = tmpDir;

  // Import route modules (they read DATA_DIR at import time)
  const loadoutsRoute = await import('../../app/api/loadouts/route.js?t=' + Date.now());
  const todosRoute = await import('../../app/api/todos/route.js?t=' + Date.now());
  const materialsRoute = await import('../../app/api/materials/route.js?t=' + Date.now());

  GET_loadouts = loadoutsRoute.GET;
  PUT_loadouts = loadoutsRoute.PUT;
  GET_todos = todosRoute.GET;
  PUT_todos = todosRoute.PUT;
  GET_materials = materialsRoute.GET;
  PUT_materials = materialsRoute.PUT;
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  delete process.env.DATA_DIR;
});

function makeRequest(body) {
  return {
    json: () => Promise.resolve(body),
  };
}

// ---------------------------------------------------------------------------
// GET routes — data retrieval
// ---------------------------------------------------------------------------

describe('GET routes', () => {
  it('GET /api/loadouts returns { data } with an array', async () => {
    const res = await GET_loadouts();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/todos returns { data } with an array', async () => {
    const res = await GET_todos();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/materials returns { data } with an object', async () => {
    const res = await GET_materials();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(typeof body.data).toBe('object');
    expect(Array.isArray(body.data)).toBe(false);
  });

  it('returns empty loadouts list when DB is empty', async () => {
    const res = await GET_loadouts();
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns empty todos list when DB is empty', async () => {
    const res = await GET_todos();
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns empty materials object when DB is empty', async () => {
    const res = await GET_materials();
    const body = await res.json();
    expect(body.data).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// PUT routes — write and persist
// ---------------------------------------------------------------------------

describe('PUT /api/loadouts', () => {
  beforeEach(async () => {
    // Re-import modules to get a clean DB per test
    const mod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    GET_loadouts = mod.GET;
    PUT_loadouts = mod.PUT;
  });

  it('accepts valid data and returns { ok: true }', async () => {
    const res = await PUT_loadouts(makeRequest({
      data: [{ id: 'l1', name: 'First Loadout', slots: [] }],
      version: 0,
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('persists written data on subsequent GET', async () => {
    const getRes = await GET_loadouts();
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].id).toBe('l1');
    expect(getBody.data[0].name).toBe('First Loadout');
  });

  it('replaces all data on second write', async () => {
    await PUT_loadouts(makeRequest({
      data: [{ id: 'l2', name: 'Replacement', slots: [] }],
      version: 0,
    }));
    const getRes = await GET_loadouts();
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].id).toBe('l2');
  });

  it('rejects request missing data field', async () => {
    const res = await PUT_loadouts(makeRequest({ version: 0 }));
    expect(res.status).toBe(400);
  });

  it('rejects request missing version field', async () => {
    const res = await PUT_loadouts(makeRequest({ data: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects non-array data', async () => {
    const res = await PUT_loadouts(makeRequest({ data: 'invalid', version: 0 }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/todos', () => {
  beforeEach(async () => {
    const mod = await import('../../app/api/todos/route.js?t=' + Date.now());
    GET_todos = mod.GET;
    PUT_todos = mod.PUT;
  });

  it('accepts valid data and returns { ok: true }', async () => {
    const res = await PUT_todos(makeRequest({
      data: [{ id: 't1', user_notes: 'Farm Polymer Bundle', status: 'pending', priority: 'high' }],
      version: 0,
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('persists written data on subsequent GET', async () => {
    const getRes = await GET_todos();
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].id).toBe('t1');
    expect(getBody.data[0].user_notes).toBe('Farm Polymer Bundle');
  });

  it('rejects non-array data', async () => {
    const res = await PUT_todos(makeRequest({ data: 'invalid', version: 0 }));
    expect(res.status).toBe(400);
  });

  it('rejects missing version', async () => {
    const res = await PUT_todos(makeRequest({ data: [] }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/materials', () => {
  beforeEach(async () => {
    const mod = await import('../../app/api/materials/route.js?t=' + Date.now());
    GET_materials = mod.GET;
    PUT_materials = mod.PUT;
  });

  it('accepts valid material data and returns { ok: true }', async () => {
    const res = await PUT_materials(makeRequest({
      data: { 'Polymer Bundle': 500, 'Nano Spores': 200 },
      version: 0,
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('persists material data on subsequent GET', async () => {
    const getRes = await GET_materials();
    const getBody = await getRes.json();
    expect(getBody.data).toEqual({ 'Polymer Bundle': 500, 'Nano Spores': 200 });
  });

  it('replaces all materials on second write', async () => {
    await PUT_materials(makeRequest({
      data: { 'Ferrite': 999 },
      version: 0,
    }));
    const getRes = await GET_materials();
    const getBody = await getRes.json();
    expect(getBody.data).toEqual({ Ferrite: 999 });
  });

  it('rejects non-object data', async () => {
    const res = await PUT_materials(makeRequest({ data: [], version: 0 }));
    expect(res.status).toBe(400);
  });

  it('rejects null data', async () => {
    const res = await PUT_materials(makeRequest({ data: null, version: 0 }));
    expect(res.status).toBe(400);
  });

  it('rejects missing data', async () => {
    const res = await PUT_materials(makeRequest({ version: 0 }));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Error handling — DB errors return 500
// ---------------------------------------------------------------------------

describe('error handling', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('GET returns 500 when database throws', async () => {
    vi.doMock('../../src/data/database.js', () => ({
      getDb: () => { throw new Error('Simulated DB failure'); },
      closeDb: () => {},
    }));
    const mod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    const res = await mod.GET();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
  });

  it('PUT returns 500 when database throws', async () => {
    vi.doMock('../../src/data/database.js', () => ({
      getDb: () => { throw new Error('Simulated DB failure'); },
      closeDb: () => {},
    }));
    const mod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    const res = await mod.PUT(makeRequest({ data: [], version: 0 }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
  });
});
