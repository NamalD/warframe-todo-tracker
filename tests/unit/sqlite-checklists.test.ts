import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-checklists-'));

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

describe('sqlite-checklists module', () => {
  let database;
  let checklists;
  let db;

  async function loadModules() {
    database = await import('../../src/data/database.ts?t=' + Date.now());
    checklists = await import('../../src/data/sqlite-checklists.ts?t=' + Date.now());
    db = database.getDb();
  }

  beforeEach(async () => {
    cleanDataDir();
    await loadModules();
  });

  afterEach(() => {
    database.closeDb();
  });

  it('returns an empty array when the table is empty', () => {
    const result = checklists.getAllChecklistTasks(db);
    expect(result).toEqual([]);
  });

  it('creates and retrieves a task with valid cadence', () => {
    const task = checklists.createChecklistTask(db, {
      id: 'cl-1',
      cadence: 'daily',
      category: 'daily',
      label: 'Login',
      sort_order: 1,
    });
    expect(task.id).toBe('cl-1');
    expect(task.cadence).toBe('daily');

    const found = checklists.getChecklistTaskById(db, 'cl-1');
    expect(found).not.toBeNull();
    expect(found.label).toBe('Login');
  });

  it('rejects invalid cadences', () => {
    expect(() => checklists.createChecklistTask(db, { id: 'cl-bad', cadence: 'monthly', category: 'x', label: 'X' })).toThrow(/Invalid cadence/);
  });

  it('merges tasks using mergeNewChecklistTasks', () => {
    checklists.mergeNewChecklistTasks(db, [
      { id: 'cl-merge1', cadence: 'weekly', category: 'nightwave', label: 'Nightwave', sort_order: 0 },
      { id: 'cl-merge2', cadence: 'weekly', category: 'nightwave', label: 'Help Clem', sort_order: 1 },
    ]);
    const all = checklists.getAllChecklistTasks(db);
    expect(all.map(t => t.id).sort()).toEqual(['cl-merge1', 'cl-merge2']);
  });

  it('updates a task partial fields', () => {
    checklists.createChecklistTask(db, { id: 'cl-update', cadence: 'daily', category: 'daily', label: 'Old' });
    const updated = checklists.updateChecklistTask(db, 'cl-update', { label: 'New' });
    expect(updated.label).toBe('New');
    expect(updated.cadence).toBe('daily');
  });

  it('deletes a task', () => {
    checklists.createChecklistTask(db, { id: 'cl-del', cadence: 'daily', category: 'daily', label: 'Delete me' });
    const res = checklists.deleteChecklistTask(db, 'cl-del');
    expect(res).toEqual({ success: true });
    expect(checklists.getAllChecklistTasks(db).length).toBe(0);
  });
});
