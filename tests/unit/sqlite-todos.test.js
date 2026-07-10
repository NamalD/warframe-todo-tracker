import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-todos-'));

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

describe('sqlite-todos module', () => {
  let database;
  let todos;
  let db;

  async function loadModules() {
    vi.resetModules();
    database = await import('../../src/data/database.ts?t=' + Date.now());
    todos = await import('../../src/data/sqlite-todos.ts?t=' + Date.now());
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
  // getAllTodos
  // -----------------------------------------------------------------------

  describe('getAllTodos()', () => {
    it('returns an empty array when the table is empty', () => {
      const result = todos.getAllTodos(db);
      expect(result).toEqual([]);
    });

    it('returns all todos', () => {
      db.prepare(
        `INSERT INTO todos (id, craftable_item_id, linked_material_name, user_notes, status, priority, due_at, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run('t1', 'item_1', 'Alloy Plate', 'Need 10', 'pending', 'high', '2026-07-10T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');

      db.prepare(
        `INSERT INTO todos (id, craftable_item_id, linked_material_name, user_notes, status, priority, due_at, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, ?)`
      ).run('t2', null, null, '', 'completed', 'low', null, '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z');

      const result = todos.getAllTodos(db);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('t1');
      expect(result[0].craftable_item_id).toBe('item_1');
      expect(result[0].linked_material_name).toBe('Alloy Plate');
      expect(result[0].user_notes).toBe('Need 10');
      expect(result[0].status).toBe('pending');
      expect(result[0].priority).toBe('high');
      expect(result[0].due_at).toBe('2026-07-10T00:00:00Z');
      expect(result[0].version).toBe(1);
      expect(result[0].created_at).toBe('2026-01-01T00:00:00Z');
      expect(result[0].updated_at).toBe('2026-01-02T00:00:00Z');

      expect(result[1].id).toBe('t2');
      expect(result[1].craftable_item_id).toBeNull();
      expect(result[1].linked_material_name).toBeNull();
      expect(result[1].user_notes).toBe('');
      expect(result[1].status).toBe('completed');
      expect(result[1].priority).toBe('low');
      expect(result[1].due_at).toBeNull();
      expect(result[1].version).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // getTodoById
  // -----------------------------------------------------------------------

  describe('getTodoById()', () => {
    it('returns null for a non-existent ID', () => {
      const result = todos.getTodoById(db, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns the todo', () => {
      db.prepare(
        `INSERT INTO todos (id, craftable_item_id, linked_material_name, user_notes, status, priority, due_at, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run('t1', 'item_x', 'Ferrite', 'Farm 500', 'in_progress', 'medium', null, '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z');

      const result = todos.getTodoById(db, 't1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('t1');
      expect(result.craftable_item_id).toBe('item_x');
      expect(result.linked_material_name).toBe('Ferrite');
      expect(result.user_notes).toBe('Farm 500');
      expect(result.status).toBe('in_progress');
      expect(result.priority).toBe('medium');
      expect(result.version).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // createTodo
  // -----------------------------------------------------------------------

  describe('createTodo()', () => {
    it('creates a todo with version=1 and auto timestamps', () => {
      const result = todos.createTodo(db, {
        craftable_item_id: 'item_1',
        linked_material_name: 'Polymer Bundle',
        user_notes: 'Need 200',
        status: 'pending',
        priority: 'high',
        due_at: '2026-07-15T00:00:00Z',
      });

      expect(result.id).toBeTruthy();
      expect(result.craftable_item_id).toBe('item_1');
      expect(result.linked_material_name).toBe('Polymer Bundle');
      expect(result.user_notes).toBe('Need 200');
      expect(result.status).toBe('pending');
      expect(result.priority).toBe('high');
      expect(result.due_at).toBe('2026-07-15T00:00:00Z');
      expect(result.version).toBe(1);
      expect(result.created_at).toBeTruthy();
      expect(result.updated_at).toBeTruthy();
    });

    it('persists the todo to the database', () => {
      todos.createTodo(db, {
        craftable_item_id: 'item_2',
        user_notes: 'Farm this',
        status: 'in_progress',
        priority: 'low',
      });

      const row = db.prepare('SELECT * FROM todos').get();
      expect(row.craftable_item_id).toBe('item_2');
      expect(row.user_notes).toBe('Farm this');
      expect(row.status).toBe('in_progress');
      expect(row.priority).toBe('low');
      expect(row.version).toBe(1);
      expect(row.due_at).toBeNull();
    });

    it('accepts an explicit ID', () => {
      const result = todos.createTodo(db, { id: 'my-todo-id', status: 'pending', priority: 'medium' });
      expect(result.id).toBe('my-todo-id');
    });

    it('defaults user_notes, status, and priority when omitted', () => {
      const result = todos.createTodo(db, { craftable_item_id: 'item_x' });
      expect(result.user_notes).toBe('');
      expect(result.status).toBe('pending');
      expect(result.priority).toBe('medium');
    });

    it('rejects an invalid status', () => {
      expect(() => {
        todos.createTodo(db, { status: 'invalid_status', priority: 'medium' });
      }).toThrow(/status/i);
    });

    it('rejects an invalid priority', () => {
      expect(() => {
        todos.createTodo(db, { status: 'pending', priority: 'ultra' });
      }).toThrow(/priority/i);
    });
  });

  // -----------------------------------------------------------------------
  // updateTodo
  // -----------------------------------------------------------------------

  describe('updateTodo()', () => {
    beforeEach(() => {
      db.prepare(
        `INSERT INTO todos (id, craftable_item_id, linked_material_name, user_notes, status, priority, due_at, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('t1', 'item_1', 'Alloy Plate', 'Original notes', 'pending', 'medium', '2026-07-10T00:00:00Z', 5, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
    });

    it('updates successfully when clientVersion matches serverVersion', () => {
      const result = todos.updateTodo(db, 't1', { user_notes: 'Updated notes', status: 'in_progress' }, 5);

      expect(result.conflict).toBeUndefined();
      expect(result.id).toBe('t1');
      expect(result.user_notes).toBe('Updated notes');
      expect(result.status).toBe('in_progress');
      expect(result.version).toBe(6);
      expect(result.priority).toBe('medium');
      expect(result.created_at).toBe('2026-01-01T00:00:00Z');
      expect(result.updated_at).not.toBe('2026-01-02T00:00:00Z');
    });

    it('updates successfully when clientVersion > serverVersion', () => {
      const result = todos.updateTodo(db, 't1', { priority: 'high' }, 10);

      expect(result.conflict).toBeUndefined();
      expect(result.version).toBe(6);
      expect(result.priority).toBe('high');
    });

    it('returns conflict when clientVersion < serverVersion', () => {
      const result = todos.updateTodo(db, 't1', { user_notes: 'Stale' }, 3);

      expect(result.conflict).toBe(true);
      expect(result.serverVersion).toBe(5);
      expect(result.serverId).toBe('t1');
      expect(result.serverData).toBeDefined();
    });

    it('increments version by 1 on success', () => {
      todos.updateTodo(db, 't1', { status: 'completed' }, 5);

      const row = db.prepare('SELECT version FROM todos WHERE id = ?').get('t1');
      expect(row.version).toBe(6);
    });

    it('updates the updated_at timestamp', () => {
      const result = todos.updateTodo(db, 't1', { user_notes: 'New' }, 5);
      expect(result.updated_at).toBeTruthy();
      expect(result.updated_at).not.toBe('2026-01-02T00:00:00Z');
    });

    it('throws on non-existent ID', () => {
      expect(() => {
        todos.updateTodo(db, 'nonexistent', { user_notes: 'test' }, 1);
      }).toThrow(/not found/i);
    });

    it('only allows valid update fields', () => {
      // Should succeed with standard fields
      const result = todos.updateTodo(db, 't1', { user_notes: 'Valid' }, 5);
      expect(result.conflict).toBeUndefined();
      expect(result.user_notes).toBe('Valid');
    });

    it('updates craftable_item_id field', () => {
      const result = todos.updateTodo(db, 't1', { craftable_item_id: 'new_item_id' }, 5);
      expect(result.conflict).toBeUndefined();
      expect(result.craftable_item_id).toBe('new_item_id');
    });

    it('updates linked_material_name field', () => {
      const result = todos.updateTodo(db, 't1', { linked_material_name: 'Circuits' }, 5);
      expect(result.conflict).toBeUndefined();
      expect(result.linked_material_name).toBe('Circuits');
    });

    it('updates due_at field', () => {
      const result = todos.updateTodo(db, 't1', { due_at: '2026-08-01T00:00:00Z' }, 5);
      expect(result.conflict).toBeUndefined();
      expect(result.due_at).toBe('2026-08-01T00:00:00Z');
    });

    it('clears a field by setting it to null', () => {
      const result = todos.updateTodo(db, 't1', { due_at: null }, 5);
      expect(result.conflict).toBeUndefined();
      expect(result.due_at).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // deleteTodo
  // -----------------------------------------------------------------------

  describe('deleteTodo()', () => {
    beforeEach(() => {
      db.prepare(
        `INSERT INTO todos (id, craftable_item_id, user_notes, status, priority, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('t1', 'item_1', 'To delete', 'pending', 'medium', 3, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
    });

    it('deletes successfully when clientVersion >= serverVersion', () => {
      const result = todos.deleteTodo(db, 't1', 3);
      expect(result).toEqual({ success: true });

      const row = db.prepare('SELECT * FROM todos WHERE id = ?').get('t1');
      expect(row).toBeUndefined();
    });

    it('deletes successfully when clientVersion > serverVersion', () => {
      const result = todos.deleteTodo(db, 't1', 10);
      expect(result).toEqual({ success: true });
    });

    it('returns conflict when clientVersion < serverVersion', () => {
      const result = todos.deleteTodo(db, 't1', 1);
      expect(result.conflict).toBe(true);
      expect(result.serverVersion).toBe(3);
      expect(result.serverId).toBe('t1');
    });

    it('does not delete the row on conflict', () => {
      todos.deleteTodo(db, 't1', 1);

      const row = db.prepare('SELECT * FROM todos WHERE id = ?').get('t1');
      expect(row).toBeDefined();
      expect(row.version).toBe(3);
    });

    it('returns notFound for non-existent ID', () => {
      const result = todos.deleteTodo(db, 'nonexistent', 1);
      expect(result).toEqual({ notFound: true });
    });
  });

  // -----------------------------------------------------------------------
  // mergeNewTodos
  // -----------------------------------------------------------------------

  describe('mergeNewTodos()', () => {
    beforeEach(() => {
      db.prepare(
        `INSERT INTO todos (id, craftable_item_id, user_notes, status, priority, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('old1', 'item_a', 'Old todo', 'pending', 'low', 1, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
      db.prepare(
        `INSERT INTO todos (id, craftable_item_id, user_notes, status, priority, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('old2', 'item_b', 'Another old', 'completed', 'high', 2, '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z');
    });

    it('inserts new todos without touching existing rows (see #14)', () => {
      const newTodos = [
        { id: 'new1', craftable_item_id: 'item_x', user_notes: 'New todo', status: 'pending', priority: 'high' },
        { id: 'new2', craftable_item_id: 'item_y', status: 'in_progress', priority: 'medium' },
      ];

      todos.mergeNewTodos(db, newTodos);

      const rows = db.prepare('SELECT * FROM todos ORDER BY id').all();
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.id)).toEqual(['new1', 'new2', 'old1', 'old2']);
      const inserted = rows.find((r) => r.id === 'new1');
      expect(inserted.craftable_item_id).toBe('item_x');
      expect(inserted.user_notes).toBe('New todo');
      expect(inserted.status).toBe('pending');
      expect(inserted.priority).toBe('high');
      expect(inserted.version).toBe(1);
    });

    it('does not delete existing rows when given an empty array', () => {
      todos.mergeNewTodos(db, []);

      const count = db.prepare('SELECT COUNT(*) as c FROM todos').get().c;
      expect(count).toBe(2);
    });

    it('ignores an incoming todo whose id already exists (never overwrites)', () => {
      todos.mergeNewTodos(db, [
        { id: 'old1', user_notes: 'Clobbered?', status: 'completed', priority: 'low' },
      ]);

      const row = db.prepare('SELECT * FROM todos WHERE id = ?').get('old1');
      expect(row.user_notes).toBe('Old todo');
      expect(row.status).toBe('pending');
    });

    it('is atomic — on failure, old rows remain', () => {
      // Provide a todo without an id to cause a NOT NULL violation
      expect(() => {
        todos.mergeNewTodos(db, [
          { id: 'good1', user_notes: 'Good', status: 'pending', priority: 'medium' },
          { user_notes: 'Bad', status: 'pending', priority: 'medium' }, // missing id
        ]);
      }).toThrow();

      // Old rows should still be there
      const rows = db.prepare('SELECT * FROM todos ORDER BY id').all();
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe('old1');
      expect(rows[1].id).toBe('old2');
    });

    it('sets version=1 and timestamps for newly-inserted rows', () => {
      todos.mergeNewTodos(db, [
        { id: 'r1', user_notes: 'Fresh', status: 'pending', priority: 'medium' },
      ]);

      const row = db.prepare('SELECT * FROM todos WHERE id = ?').get('r1');
      expect(row.version).toBe(1);
      expect(row.created_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases / integration
  // -----------------------------------------------------------------------

  describe('integration scenarios', () => {
    it('round-trips a full todo through create → getAll → getById → update', () => {
      // Create
      const created = todos.createTodo(db, {
        craftable_item_id: 'item_x',
        linked_material_name: 'Orokin Cell',
        user_notes: 'Farm 10',
        status: 'pending',
        priority: 'high',
        due_at: '2026-07-20T00:00:00Z',
      });
      expect(created.version).toBe(1);
      expect(created.id).toBeTruthy();

      // GetAll
      const all = todos.getAllTodos(db);
      expect(all).toHaveLength(1);
      expect(all[0].user_notes).toBe('Farm 10');

      // GetById
      const byId = todos.getTodoById(db, created.id);
      expect(byId).not.toBeNull();
      expect(byId.user_notes).toBe('Farm 10');

      // Update
      const updated = todos.updateTodo(db, created.id, { status: 'in_progress', user_notes: 'Farm 10 — half done' }, 1);
      expect(updated.version).toBe(2);
      expect(updated.status).toBe('in_progress');

      // Verify via getById
      const refreshed = todos.getTodoById(db, created.id);
      expect(refreshed.status).toBe('in_progress');
      expect(refreshed.version).toBe(2);
    });

    it('detects stale update after another update', () => {
      const created = todos.createTodo(db, { status: 'pending', priority: 'medium' });
      expect(created.version).toBe(1);

      // First update: version 1 → 2
      todos.updateTodo(db, created.id, { user_notes: 'First' }, 1);

      // Second update with stale clientVersion (1 instead of 2)
      const conflict = todos.updateTodo(db, created.id, { user_notes: 'Second' }, 1);
      expect(conflict.conflict).toBe(true);
      expect(conflict.serverVersion).toBe(2);
    });

    it('delete after update detects correct version', () => {
      const created = todos.createTodo(db, { status: 'pending', priority: 'medium' });

      // Update to version 2
      todos.updateTodo(db, created.id, { user_notes: 'Updated' }, 1);

      // Delete with stale version
      const conflict = todos.deleteTodo(db, created.id, 1);
      expect(conflict.conflict).toBe(true);

      // Delete with correct version succeeds
      const result = todos.deleteTodo(db, created.id, 2);
      expect(result).toEqual({ success: true });
    });
  });
});
