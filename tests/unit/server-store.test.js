import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe('server-store', () => {
  let serverStore;

  beforeAll(async () => {
    // Import after DATA_DIR is set
    serverStore = await import('../../src/data/server-store.js?t=' + Date.now());
  });

  function cleanDataDir() {
    const files = fs.readdirSync(tmpDir);
    for (const f of files) fs.unlinkSync(path.join(tmpDir, f));
  }

  describe('readStore', () => {
    it('returns defaultValue when no file exists', () => {
      cleanDataDir();
      expect(serverStore.readStore('test-key', [])).toEqual([]);
    });

    it('returns null default when not specified', () => {
      expect(serverStore.readStore('nonexistent-2')).toBeNull();
    });

    it('returns parsed data when file exists', () => {
      cleanDataDir();
      serverStore.writeStore('test-key-3', { foo: 'bar' });
      expect(serverStore.readStore('test-key-3')).toEqual({ foo: 'bar' });
    });

    it('handles array data', () => {
      cleanDataDir();
      serverStore.writeStore('arr-key', [1, 2, 3]);
      expect(serverStore.readStore('arr-key', [])).toEqual([1, 2, 3]);
    });
  });

  describe('writeStore', () => {
    it('creates a JSON file on disk', () => {
      cleanDataDir();
      serverStore.writeStore('write-test', { hello: 'world' });
      const filePath = path.join(tmpDir, 'write-test.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = fs.readFileSync(filePath, 'utf-8');
      expect(JSON.parse(raw)).toEqual({ hello: 'world' });
    });

    it('overwrites existing data', () => {
      serverStore.writeStore('overwrite-key', { v: 1 });
      serverStore.writeStore('overwrite-key', { v: 2 });
      expect(serverStore.readStore('overwrite-key')).toEqual({ v: 2 });
    });

    it('does not leave .tmp files', () => {
      serverStore.writeStore('no-tmp-key', { x: 1 });
      expect(fs.existsSync(path.join(tmpDir, 'no-tmp-key.json.tmp'))).toBe(false);
    });

    it('cleans up lock file', () => {
      serverStore.writeStore('no-lock-key', { x: 1 });
      expect(fs.existsSync(path.join(tmpDir, 'no-lock-key.json.lock'))).toBe(false);
    });

    it('handles empty array writes', () => {
      serverStore.writeStore('empty-arr', []);
      expect(serverStore.readStore('empty-arr', ['fallback'])).toEqual([]);
    });

    it('handles empty object writes', () => {
      serverStore.writeStore('empty-obj', {});
      expect(serverStore.readStore('empty-obj', { fallback: true })).toEqual({});
    });
  });

  describe('atomicity', () => {
    it('writes are atomic', () => {
      cleanDataDir();
      serverStore.writeStore('atomic-key', { count: 0 });
      expect(serverStore.readStore('atomic-key')).toEqual({ count: 0 });
    });

    it('multiple writes are consistent', () => {
      cleanDataDir();
      for (let i = 0; i < 10; i++) {
        serverStore.writeStore('seq-key', { count: i });
        expect(serverStore.readStore('seq-key')).toEqual({ count: i });
      }
    });
  });
});
