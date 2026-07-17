/**
 * Tests for SQLite-backed API routes — backward-compatible validation.
 *
 * These tests verify that the API routes still accept { data, version }
 * but no longer perform version conflict resolution (Phase 1).
 * GET returns { data }, PUT returns { ok: true }.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-routes-v2-'));

let GET_loadouts, PUT_loadouts;
let GET_todos, PUT_todos;
let GET_materials, PUT_materials;

beforeAll(async () => {
  process.env.DATA_DIR = tmpDir;

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

describe('GET returns { data } with correct shape', () => {
  it('GET /api/loadouts returns { data }', async () => {
    const res = await GET_loadouts();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/todos returns { data }', async () => {
    const res = await GET_todos();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/materials returns { data, versions }', async () => {
    const res = await GET_materials();
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(typeof body.data).toBe('object');
    expect(Array.isArray(body.data)).toBe(false);
    expect(body).toHaveProperty('versions');
    expect(typeof body.versions).toBe('object');
  });
});

describe('PUT validates { data, version } contract', () => {
  describe('/api/loadouts', () => {
    it('accepts valid write and returns { ok: true }', async () => {
      const res = await PUT_loadouts(makeRequest({
        data: [{ id: 'l1', name: 'First' }],
        version: 0,
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true });
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
    it('accepts valid write and returns { ok: true }', async () => {
      const res = await PUT_todos(makeRequest({
        data: [{ id: 't1', user_notes: 'Todo item' }],
        version: 0,
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true });
    });

    it('rejects non-array data', async () => {
      const res = await PUT_todos(makeRequest({ data: 'invalid', version: 0 }));
      expect(res.status).toBe(400);
    });
  });

  describe('/api/materials', () => {
    it('accepts valid write and returns { ok: true }', async () => {
      const res = await PUT_materials(makeRequest({
        data: { 'Polymer Bundle': 500 },
        version: 0,
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true });
    });

    it('rejects non-object data', async () => {
      const res = await PUT_materials(makeRequest({ data: [], version: 0 }));
      expect(res.status).toBe(400);
    });
  });
});

describe('Data persistence', () => {
  it('loadouts persist after write', async () => {
    const getRes = await GET_loadouts();
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].id).toBe('l1');
  });

  it('todos persist after write', async () => {
    const getRes = await GET_todos();
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].user_notes).toBe('Todo item');
  });

  it('materials persist after write', async () => {
    const getRes = await GET_materials();
    const getBody = await getRes.json();
    expect(getBody.data).toEqual({ 'Polymer Bundle': 500 });
  });

  it('materials GET exposes row versions for client conflict tracking (#117)', async () => {
    const getRes = await GET_materials();
    const getBody = await getRes.json();
    expect(getBody.versions).toEqual({ 'Polymer Bundle': 1 });
  });
});
