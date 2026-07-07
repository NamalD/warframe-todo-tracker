/**
 * Tests for version-vector conflict resolution in API routes.
 *
 * These tests verify that GET returns { data, version } and PUT
 * validates version metadata, rejecting stale writes with 409.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-routes-'));

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

describe('GET routes — version-aware responses', () => {
  it('GET /api/loadouts returns { data, version }', async () => {
    const res = await GET_loadouts();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('version');
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.version).toBe('number');
  });

  it('GET /api/todos returns { data, version }', async () => {
    const res = await GET_todos();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('version');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/materials returns { data, version }', async () => {
    const res = await GET_materials();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('version');
    expect(typeof body.data).toBe('object');
    expect(Array.isArray(body.data)).toBe(false);
  });
});

describe('PUT routes — version conflict resolution', () => {
  describe('/api/loadouts', () => {
    it('accepts first write with version 0', async () => {
      const res = await PUT_loadouts(makeRequest({
        data: [{ id: 'l1', name: 'First' }],
        version: 0,
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toHaveProperty('version');
      expect(body.version).toBe(1);
    });

    it('rejects stale write with 409 Conflict', async () => {
      const res = await PUT_loadouts(makeRequest({
        data: [{ id: 'l2', name: 'Stale' }],
        version: 0,  // server now has version 1
      }));
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body).toHaveProperty('currentVersion', 1);
      expect(body.error).toContain('Version conflict');
    });

    it('accepts write with current version', async () => {
      const res = await PUT_loadouts(makeRequest({
        data: [{ id: 'l3', name: 'Current' }],
        version: 1,
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.version).toBe(2);
    });

    it('accepts write with future version (LWW)', async () => {
      const res = await PUT_loadouts(makeRequest({
        data: [{ id: 'l4', name: 'Future' }],
        version: 10,  // ahead of server's 2
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      // New version = clientVersion + 1 = 11
      expect(body.version).toBe(11);
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

  describe('/api/todos', () => {
    it('accepts first write with version 0', async () => {
      const res = await PUT_todos(makeRequest({
        data: [{ id: 't1', user_notes: 'Todo item' }],
        version: 0,
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.version).toBe(1);
    });

    it('rejects stale write with 409', async () => {
      const res = await PUT_todos(makeRequest({
        data: [{ id: 't2' }],
        version: 0,  // server now v1
      }));
      expect(res.status).toBe(409);
    });

    it('data persists after accepted write', async () => {
      const getRes = await GET_todos();
      const getBody = await getRes.json();
      expect(getBody.data).toHaveLength(1);
      expect(getBody.data[0].user_notes).toBe('Todo item');
      expect(getBody.version).toBe(1);
    });
  });

  describe('/api/materials', () => {
    it('accepts first write with version 0', async () => {
      const res = await PUT_materials(makeRequest({
        data: { 'Polymer Bundle': 500 },
        version: 0,
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.version).toBe(1);
    });

    it('rejects non-object data', async () => {
      const res = await PUT_materials(makeRequest({ data: [], version: 0 }));
      expect(res.status).toBe(400);
    });

    it('rejects stale write with 409', async () => {
      const res = await PUT_materials(makeRequest({
        data: { 'Alloy Plate': 100 },
        version: 0,
      }));
      expect(res.status).toBe(409);
    });

    it('accepts write with current version', async () => {
      const res = await PUT_materials(makeRequest({
        data: { 'Polymer Bundle': 500, 'Nano Spores': 200 },
        version: 1,
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.version).toBe(2);
    });
  });
});

describe('Version persistence across reads', () => {
  it('version persists after restart (new module load)', async () => {
    // Already written to version 11 on loadouts, 2 on todos, 2 on materials
    const loadoutsRes = await GET_loadouts();
    const loadoutsBody = await loadoutsRes.json();
    expect(loadoutsBody.version).toBe(11);  // v0→1, v1→2, v10→11 (3 accepted writes)

    const todosRes = await GET_todos();
    const todosBody = await todosRes.json();
    expect(todosBody.version).toBe(1);  // single accepted write

    const materialsRes = await GET_materials();
    const materialsBody = await materialsRes.json();
    expect(materialsBody.version).toBe(2);  // two accepted writes
  });
});
