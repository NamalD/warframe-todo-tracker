/**
 * Tests for Phase 2 — granular record API + sync endpoint.
 *
 * Covers:
 *   - POST /api/loadouts and /api/todos (create)
 *   - GET /api/loadouts/[id] and /api/todos/[id] (single record)
 *   - PATCH /api/loadouts/[id] and /api/todos/[id] (update with version check)
 *   - DELETE /api/loadouts/[id] and /api/todos/[id] (delete with version check)
 *   - PATCH /api/materials (per-material with version check)
 *   - PATCH /api/materials/batch (batch upsert)
 *   - GET /api/sync (full data + ?since filter)
 *   - POST /api/sync (batch upsert with version checking)
 *   - 409 conflict detection
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { closeDb } from '../../src/data/database.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Setup: each describe block creates its own temp directory
// ---------------------------------------------------------------------------

function makeRequest(body) {
  return {
    json: () => Promise.resolve(body),
  };
}

function makeRequestWithUrl(body, urlStr) {
  return {
    json: () => Promise.resolve(body),
    url: urlStr || 'http://localhost:3000/api/sync',
  };
}

// Helper to manually simulate Next.js route params
function makeContext(params) {
  return { params };
}

// ---------------------------------------------------------------------------
// POST routes — create
// ---------------------------------------------------------------------------

describe('POST /api/loadouts — create', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-loadouts-post-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  it('creates a new loadout and returns it with version=1 and status 201', async () => {
    const mod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({ name: 'Test Loadout', data: { slots: [] } }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('Test Loadout');
    expect(body.version).toBe(1);
    expect(body.data).toEqual({ slots: [] });
  });

  it('rejects request without name', async () => {
    const mod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({ data: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('creates with explicit ID when provided', async () => {
    const mod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({ id: 'explicit-id', name: 'Explicit', data: {} }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.id).toBe('explicit-id');
  });
});

describe('POST /api/todos — create', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-todos-post-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  it('creates a new todo and returns it with version=1 and status 201', async () => {
    const mod = await import('../../app/api/todos/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({ user_notes: 'Farm Polymer', status: 'pending', priority: 'high' }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.user_notes).toBe('Farm Polymer');
    expect(body.status).toBe('pending');
    expect(body.priority).toBe('high');
    expect(body.version).toBe(1);
  });

  it('rejects empty body', async () => {
    const mod = await import('../../app/api/todos/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest(null));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Per-record routes — loadouts/[id]
// ---------------------------------------------------------------------------

describe('GET /api/loadouts/[id]', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-loadout-get-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  it('returns 404 for non-existent loadout', async () => {
    const mod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    const res = await mod.GET(makeRequestWithUrl(null), makeContext({ id: 'nonexistent' }));
    expect(res.status).toBe(404);
  });

  it('returns loadout by ID after creation', async () => {
    // Create a loadout first
    const createMod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    const createRes = await createMod.POST(makeRequest({ name: 'ByID Loadout', data: { slots: ['a'] } }));
    const created = await createRes.json();

    // Fetch by ID
    const getMod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    const res = await getMod.GET(makeRequestWithUrl(null), makeContext({ id: created.id }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe(created.id);
    expect(body.name).toBe('ByID Loadout');
  });
});

describe('PATCH /api/loadouts/[id] — version conflict', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-loadout-patch-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  let loadoutId;

  beforeEach(async () => {
    const mod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({ name: 'Patchable', data: { slots: [] } }));
    const body = await res.json();
    loadoutId = body.id;
  });

  it('updates a loadout with matching clientVersion and returns updated record', async () => {
    const mod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    const res = await mod.PATCH(
      makeRequest({ data: { slots: ['updated'] }, clientVersion: 1 }),
      makeContext({ id: loadoutId }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe(loadoutId);
    expect(body.data).toEqual({ slots: ['updated'] });
    expect(body.version).toBe(2);
  });

  it('returns 409 when clientVersion is stale', async () => {
    // Update once to bump version to 2
    const mod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    await mod.PATCH(
      makeRequest({ data: { slots: ['v2'] }, clientVersion: 1 }),
      makeContext({ id: loadoutId }),
    );

    // Now try with old clientVersion
    const res = await mod.PATCH(
      makeRequest({ data: { slots: ['stale'] }, clientVersion: 1 }),
      makeContext({ id: loadoutId }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflict).toBe(true);
    expect(body.record_id).toBe(loadoutId);
    expect(body.server_version).toBe(2);
  });

  it('returns 404 for non-existent loadout', async () => {
    const mod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    const res = await mod.PATCH(
      makeRequest({ data: {}, clientVersion: 0 }),
      makeContext({ id: 'nonexistent' }),
    );
    expect(res.status).toBe(404);
  });

  it('rejects missing clientVersion', async () => {
    const mod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    const res = await mod.PATCH(
      makeRequest({ data: {} }),
      makeContext({ id: loadoutId }),
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/loadouts/[id] — version conflict', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-loadout-delete-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  let loadoutId;

  beforeEach(async () => {
    const mod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({ name: 'Deletable', data: {} }));
    const body = await res.json();
    loadoutId = body.id;
  });

  it('deletes with matching clientVersion', async () => {
    const mod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    const res = await mod.DELETE(
      makeRequest({ clientVersion: 1 }),
      makeContext({ id: loadoutId }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('returns 409 on stale clientVersion', async () => {
    // Update first to bump version
    const mod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    await mod.PATCH(
      makeRequest({ data: { v: 2 }, clientVersion: 1 }),
      makeContext({ id: loadoutId }),
    );

    // Delete with stale version
    const res = await mod.DELETE(
      makeRequest({ clientVersion: 1 }),
      makeContext({ id: loadoutId }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflict).toBe(true);
    expect(body.server_version).toBe(2);
  });

  it('returns 404 for non-existent loadout', async () => {
    const mod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    const res = await mod.DELETE(
      makeRequest({ clientVersion: 0 }),
      makeContext({ id: 'nonexistent' }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Per-record routes — todos/[id]
// ---------------------------------------------------------------------------

describe('GET /api/todos/[id]', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-todo-get-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  it('returns 404 for non-existent todo', async () => {
    const mod = await import('../../app/api/todos/[id]/route.js?t=' + Date.now());
    const res = await mod.GET(makeRequestWithUrl(null), makeContext({ id: 'nonexistent' }));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/todos/[id] — version conflict', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-todo-patch-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  let todoId;

  beforeEach(async () => {
    const mod = await import('../../app/api/todos/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({ user_notes: 'Test todo', status: 'pending', priority: 'low' }));
    const body = await res.json();
    todoId = body.id;
  });

  it('updates a todo and returns updated record', async () => {
    const mod = await import('../../app/api/todos/[id]/route.js?t=' + Date.now());
    const res = await mod.PATCH(
      makeRequest({ updates: { user_notes: 'Updated notes' }, clientVersion: 1 }),
      makeContext({ id: todoId }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe(todoId);
    expect(body.user_notes).toBe('Updated notes');
    expect(body.version).toBe(2);
  });

  it('returns 409 on stale clientVersion', async () => {
    const mod = await import('../../app/api/todos/[id]/route.js?t=' + Date.now());
    // Update once
    await mod.PATCH(
      makeRequest({ updates: { user_notes: 'V2' }, clientVersion: 1 }),
      makeContext({ id: todoId }),
    );
    // Try with old version
    const res = await mod.PATCH(
      makeRequest({ updates: { user_notes: 'Stale' }, clientVersion: 1 }),
      makeContext({ id: todoId }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflict).toBe(true);
    expect(body.record_id).toBe(todoId);
  });

  it('returns 404 for non-existent todo', async () => {
    const mod = await import('../../app/api/todos/[id]/route.js?t=' + Date.now());
    const res = await mod.PATCH(
      makeRequest({ updates: { user_notes: 'x' }, clientVersion: 0 }),
      makeContext({ id: 'nonexistent' }),
    );
    expect(res.status).toBe(404);
  });

  it('rejects missing clientVersion', async () => {
    const mod = await import('../../app/api/todos/[id]/route.js?t=' + Date.now());
    const res = await mod.PATCH(
      makeRequest({ updates: {} }),
      makeContext({ id: todoId }),
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/todos/[id] — version conflict', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-todo-delete-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  let todoId;

  beforeEach(async () => {
    const mod = await import('../../app/api/todos/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({ user_notes: 'Delete me', status: 'pending', priority: 'medium' }));
    const body = await res.json();
    todoId = body.id;
  });

  it('deletes with matching clientVersion', async () => {
    const mod = await import('../../app/api/todos/[id]/route.js?t=' + Date.now());
    const res = await mod.DELETE(
      makeRequest({ clientVersion: 1 }),
      makeContext({ id: todoId }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('returns 409 on stale clientVersion', async () => {
    const mod = await import('../../app/api/todos/[id]/route.js?t=' + Date.now());
    // Update first to bump version
    await mod.PATCH(
      makeRequest({ updates: { user_notes: 'V2' }, clientVersion: 1 }),
      makeContext({ id: todoId }),
    );
    // Delete with stale version
    const res = await mod.DELETE(
      makeRequest({ clientVersion: 1 }),
      makeContext({ id: todoId }),
    );
    expect(res.status).toBe(409);
  });

  it('returns 404 for non-existent todo', async () => {
    const mod = await import('../../app/api/todos/[id]/route.js?t=' + Date.now());
    const res = await mod.DELETE(
      makeRequest({ clientVersion: 0 }),
      makeContext({ id: 'nonexistent' }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Materials per-record PATCH + batch
// ---------------------------------------------------------------------------

describe('PATCH /api/materials — per-material with version check', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-mat-patch-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  it('creates a new material entry when it does not exist', async () => {
    const mod = await import('../../app/api/materials/route.js?t=' + Date.now());
    const res = await mod.PATCH(makeRequest({ material_name: 'Polymer Bundle', quantity: 100, clientVersion: 0 }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.material_name).toBe('Polymer Bundle');
    expect(body.quantity).toBe(100);
    expect(body.version).toBe(1);
  });

  it('updates an existing material with matching version', async () => {
    const mod = await import('../../app/api/materials/route.js?t=' + Date.now());
    const res = await mod.PATCH(makeRequest({ material_name: 'Polymer Bundle', quantity: 200, clientVersion: 1 }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.quantity).toBe(200);
    expect(body.version).toBe(2);
  });

  it('returns 409 on stale clientVersion', async () => {
    const mod = await import('../../app/api/materials/route.js?t=' + Date.now());
    const res = await mod.PATCH(makeRequest({ material_name: 'Polymer Bundle', quantity: 999, clientVersion: 1 }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.conflict).toBe(true);
    expect(body.server_version).toBe(2);
  });

  it('rejects missing fields', async () => {
    const mod = await import('../../app/api/materials/route.js?t=' + Date.now());
    const res = await mod.PATCH(makeRequest({ material_name: 'Ferrite' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/materials/batch', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-mat-batch-'));

  beforeAll(() => { process.env.DATA_DIR = tmpDir; });
  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  it('batch upserts multiple materials', async () => {
    const mod = await import('../../app/api/materials/batch/route.js?t=' + Date.now());
    const res = await mod.PATCH(makeRequest({
      entries: [
        { material_name: 'Nano Spores', quantity: 500 },
        { material_name: 'Ferrite', quantity: 300 },
      ],
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.processed).toContain('Nano Spores');
    expect(body.processed).toContain('Ferrite');
  });

  it('rejects empty entries array silently', async () => {
    const mod = await import('../../app/api/materials/batch/route.js?t=' + Date.now());
    const res = await mod.PATCH(makeRequest({ entries: [] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.processed).toEqual([]);
  });

  it('rejects invalid entries', async () => {
    const mod = await import('../../app/api/materials/batch/route.js?t=' + Date.now());
    const res = await mod.PATCH(makeRequest({ entries: [{ material_name: 'Bad', quantity: -1 }] }));
    expect(res.status).toBe(400);
  });

  it('rejects missing entries field', async () => {
    const mod = await import('../../app/api/materials/batch/route.js?t=' + Date.now());
    const res = await mod.PATCH(makeRequest({}));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Sync endpoint
// ---------------------------------------------------------------------------

describe('GET /api/sync', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-sync-get-'));

  beforeAll(() => {
    process.env.DATA_DIR = tmpDir;
  });

  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  it('returns all data with server_timestamp', async () => {
    const mod = await import('../../app/api/sync/route.js?t=' + Date.now());
    const res = await mod.GET(makeRequestWithUrl(null, 'http://localhost:3000/api/sync'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.loadouts)).toBe(true);
    expect(Array.isArray(body.todos)).toBe(true);
    expect(typeof body.materials_inventory).toBe('object');
    expect(body.server_timestamp).toBeTruthy();
  });

  it('?since filter returns only newer records', async () => {
    // Create some data first
    const loadoutMod = await import('../../app/api/loadouts/route.js?t=' + Date.now());
    await loadoutMod.POST(makeRequest({ name: 'Sync Loadout', data: { x: 1 } }));

    const syncMod = await import('../../app/api/sync/route.js?t=' + Date.now());
    const futureTime = new Date(Date.now() + 86400000).toISOString(); // tomorrow
    const res = await syncMod.GET(makeRequestWithUrl(null, `http://localhost:3000/api/sync?since=${futureTime}`));
    const body = await res.json();
    expect(body.loadouts).toHaveLength(0);
    // Check with past time — should include the created data
    const pastTime = new Date(Date.now() - 86400000).toISOString(); // yesterday
    const res2 = await syncMod.GET(makeRequestWithUrl(null, `http://localhost:3000/api/sync?since=${pastTime}`));
    const body2 = await res2.json();
    expect(body2.loadouts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /api/sync — batch sync with version checking', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-p2-sync-post-'));

  beforeAll(() => {
    process.env.DATA_DIR = tmpDir;
  });

  afterAll(() => {
    closeDb();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    delete process.env.DATA_DIR;
  });

  it('processes a full sync with loadouts, todos, and materials', async () => {
    const mod = await import('../../app/api/sync/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({
      device_id: 'test-device',
      loadouts: [{ id: 'sync-l1', name: 'Sync Loadout', data: { slots: [] }, clientVersion: 0 }],
      todos: [{ id: 'sync-t1', user_notes: 'Sync todo', status: 'pending', priority: 'medium', clientVersion: 0 }],
      materials_inventory: { 'Polymer Bundle': { quantity: 50, clientVersion: 0 } },
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.accepted.loadouts).toContain('sync-l1');
    expect(body.accepted.todos).toContain('sync-t1');
    expect(body.accepted.materials_inventory).toContain('Polymer Bundle');
    expect(body.conflicts.loadouts).toEqual([]);
    expect(body.conflicts.todos).toEqual([]);
    expect(body.conflicts.materials_inventory).toEqual([]);
    expect(body.server_timestamp).toBeTruthy();
  });

  it('detects conflicts on stale version updates', async () => {
    const mod = await import('../../app/api/sync/route.js?t=' + Date.now());

    // Create a loadout with version 1
    await mod.POST(makeRequest({
      device_id: 'd1',
      loadouts: [{ id: 'conflict-l1', name: 'Base', data: { v: 1 }, clientVersion: 0 }],
    }));

    // Bump it to version 2 via PATCH
    const loadoutPatchMod = await import('../../app/api/loadouts/[id]/route.js?t=' + Date.now());
    await loadoutPatchMod.PATCH(
      makeRequest({ data: { v: 2 }, clientVersion: 1 }),
      makeContext({ id: 'conflict-l1' }),
    );

    // Now sync with stale clientVersion 1 — should conflict
    const res2 = await mod.POST(makeRequest({
      device_id: 'd1',
      loadouts: [{ id: 'conflict-l1', name: 'Stale', data: { v: 3 }, clientVersion: 1 }],
    }));
    const body2 = await res2.json();
    expect(body2.conflicts.loadouts.length).toBeGreaterThanOrEqual(1);
    expect(body2.conflicts.loadouts[0].record_id).toBe('conflict-l1');
  });

  it('returns empty accepted when no records provided', async () => {
    const mod = await import('../../app/api/sync/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest({ device_id: 'empty-test' }));
    const body = await res.json();
    expect(body.accepted.loadouts).toEqual([]);
    expect(body.accepted.todos).toEqual([]);
    expect(body.accepted.materials_inventory).toEqual([]);
  });

  it('rejects non-object body', async () => {
    const mod = await import('../../app/api/sync/route.js?t=' + Date.now());
    const res = await mod.POST(makeRequest(null));
    expect(res.status).toBe(400);
  });
});
