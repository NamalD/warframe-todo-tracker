import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wftt-worldstate-dismissals-'));

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

describe('sqlite-worldstate-dismissals module', () => {
  let database;
  let dismissals;
  let db;

  async function loadModules() {
    database = await import('../../src/data/database.ts?t=' + Date.now());
    dismissals = await import('../../src/data/sqlite-worldstate-dismissals.ts?t=' + Date.now());
    db = database.getDb();
  }

  beforeEach(async () => {
    cleanDataDir();
    await loadModules();
  });

  afterEach(() => {
    database.closeDb();
  });

  it('returns an empty array when nothing is dismissed', () => {
    expect(dismissals.getDismissedEvents(db)).toEqual([]);
  });

  it('dismisses an event and lists it back', () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    dismissals.dismissEvent(db, 'sortie', future);
    const all = dismissals.getDismissedEvents(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ event_id: 'sortie', expiry: future });
  });

  it('dismisses an event with no expiry (e.g. an invasion)', () => {
    dismissals.dismissEvent(db, 'invasion:Acheron (Pluto):Grineer Offensive', null);
    const all = dismissals.getDismissedEvents(db);
    expect(all).toEqual([expect.objectContaining({ event_id: 'invasion:Acheron (Pluto):Grineer Offensive', expiry: null })]);
  });

  it('auto-shows (purges) a dismissal once its stored expiry has passed', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    dismissals.dismissEvent(db, 'steel-path', past);
    expect(dismissals.getDismissedEvents(db)).toEqual([]);
  });

  it('re-dismissing the same id updates its expiry rather than duplicating', () => {
    const first = new Date(Date.now() + 1000).toISOString();
    const second = new Date(Date.now() + 2000).toISOString();
    dismissals.dismissEvent(db, 'darvo-deal', first);
    dismissals.dismissEvent(db, 'darvo-deal', second);
    const all = dismissals.getDismissedEvents(db);
    expect(all).toHaveLength(1);
    expect(all[0].expiry).toBe(second);
  });

  it('undismisses (unhides) an event', () => {
    dismissals.dismissEvent(db, 'arbitration', null);
    const res = dismissals.undismissEvent(db, 'arbitration');
    expect(res).toEqual({ success: true });
    expect(dismissals.getDismissedEvents(db)).toEqual([]);
  });

  it('reports notFound when unhiding an event that was never dismissed', () => {
    const res = dismissals.undismissEvent(db, 'never-dismissed');
    expect(res).toEqual({ notFound: true });
  });
});
