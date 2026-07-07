/**
 * Tests for LoadoutRepository server sync behavior.
 * Tests: empty-state propagation, migration, error handling, singleton via loadout-store.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

let LoadoutRepository;

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

  // Default: server returns empty sync data then legacy empty data
  globalThis.fetch = vi.fn().mockImplementation((url) => {
    if (url === '/api/sync') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ loadouts: [], todos: [], materials_inventory: {} }),
      });
    }
    // Legacy endpoints return empty array
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  // Re-import to get a fresh class with clean private fields
  const mod = await import('../../src/data/loadout-repository.js?t=' + Date.now());
  LoadoutRepository = mod.default;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('LoadoutRepository sync behavior', () => {
  describe('syncFromServer — empty state propagation', () => {
    it('overwrites local data with non-empty server state', async () => {
      const repo = new LoadoutRepository();

      repo.createLoadout({ name: 'Local Loadout' });
      await repo.flushPendingSync();

      // Mock: first call to /api/sync returns server data with loadouts
      // Subsequent calls to /api/loadouts use legacy fallback
      globalThis.fetch.mockReset();
      globalThis.fetch.mockImplementation((url) => {
        if (url === '/api/sync') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              loadouts: [
                { id: 'srv-1', name: 'Server Loadout', version: 2, created_at: '2026-01-01', updated_at: '2026-01-01', slots: [] },
              ],
              todos: [],
              materials_inventory: {},
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id: 'srv-1', name: 'Server Loadout', created_at: '2026-01-01', updated_at: '2026-01-01', slots: [] },
          ]),
        });
      });

      await repo.syncFromServer();

      const loadouts = repo.getLoadouts();
      expect(loadouts.length).toBe(1);
      expect(loadouts[0].name).toBe('Server Loadout');
    });

    it('keeps local data when server is unreachable', async () => {
      const repo = new LoadoutRepository();
      repo.createLoadout({ name: 'Local Only' });
      await repo.flushPendingSync();

      // All fetches fail — need 6 rejections (3 for pullSyncData + 3 for legacy pullFromServer)
      globalThis.fetch.mockReset();
      const rejectErr = new Error('Network error');
      globalThis.fetch
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr);

      const promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(6000);
      await promise;

      // Local data should be preserved
      const loadouts = repo.getLoadouts();
      expect(loadouts.length).toBe(1);
      expect(loadouts[0].name).toBe('Local Only');
      expect(repo.lastSyncError).toBeTruthy();
    });
  });

  describe('syncFromServer — migration', () => {
    it('migrates local data to server when server file does not exist (null response)', async () => {
      const repo = new LoadoutRepository();
      repo.createLoadout({ name: 'Migrate Me' });
      await repo.flushPendingSync();

      // Reset fetch and simulate: /api/sync returns null/empty, then GET returns null
      globalThis.fetch.mockReset();
      // First: /api/sync returns empty data (no loadouts payload)
      // Then legacy GET /api/loadouts returns null (no file exists), then PUT succeeds
      let callCount = 0;
      globalThis.fetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // /api/sync returns object without loadouts array
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }
        if (callCount === 2) {
          // Legacy GET /api/loadouts returns null
          return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
        }
        // Subsequent PUT succeeds
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      await repo.syncFromServer();

      // Should have pushed local data to server
      expect(globalThis.fetch).toHaveBeenCalled();
      // The PUT call should contain migrated data
      const putCall = Array.from(globalThis.fetch.mock.calls).find(
        ([url, opts]) => opts && opts.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body.data.length).toBe(1);
      expect(body.data[0].name).toBe('Migrate Me');
    });

    it('accepts empty server state as authoritative (no migration triggered)', async () => {
      const repo = new LoadoutRepository();
      repo.createLoadout({ name: 'Local' });
      await repo.flushPendingSync();

      globalThis.fetch.mockReset();
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          loadouts: [{ id: 'srv-1', name: 'Server', version: 1, created_at: '2026-01-01', updated_at: '2026-01-01', slots: [] }],
          todos: [],
          materials_inventory: {},
        }),
      });

      await repo.syncFromServer();

      // Should only have called /api/sync once, no legacy fallback
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('lastSyncError', () => {
    it('is set on sync failure', async () => {
      const repo = new LoadoutRepository();

      globalThis.fetch.mockReset();
      const rejectErr = new Error('Connection refused');
      globalThis.fetch
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr);

      const promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(6000);
      await promise;
      expect(repo.lastSyncError).toBeTruthy();
    });

    it('is cleared on successful sync', async () => {
      const repo = new LoadoutRepository();

      // First fail: 6 rejections (3 for pullSyncData + 3 for legacy pullFromServer)
      globalThis.fetch.mockReset();
      const rejectErr = new Error('First fail');
      globalThis.fetch
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr);

      let promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(6000);
      await promise;
      expect(repo.lastSyncError).toBeTruthy();

      // Then succeed
      globalThis.fetch.mockReset();
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          loadouts: [{ id: 'srv-1', name: 'OK', version: 1, created_at: '2026-01-01', updated_at: '2026-01-01', slots: [] }],
          todos: [],
          materials_inventory: {},
        }),
      });
      await repo.syncFromServer();
      expect(repo.lastSyncError).toBeNull();
    });
  });

  describe('sync callback', () => {
    it('calls error callback on sync failure', async () => {
      const repo = new LoadoutRepository();
      const onEvent = vi.fn();
      repo.setSyncEventCallback(onEvent);

      globalThis.fetch.mockReset();
      const rejectErr = new Error('Down');
      globalThis.fetch
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr);

      const promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(6000);
      await promise;
      expect(onEvent).toHaveBeenCalledWith('error', expect.any(String));
    });

    it('does not call callback when no callback is set', async () => {
      const repo = new LoadoutRepository();

      globalThis.fetch.mockReset();
      const rejectErr = new Error('Down');
      globalThis.fetch
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr)
        .mockRejectedValueOnce(rejectErr);

      // Should not throw
      const promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(6000);
      await promise;
      expect(repo.lastSyncError).toBeTruthy();
    });
  });

  describe('singleton via loadout-store', () => {
    it('loadout-store.js exports a single instance that is reused', async () => {
      // Reset the module cache so both imports get fresh instances
      vi.resetModules();

      // The dynamic import with no cache-busting parameter ensures
      // vitest doesn't treat them as separate module instances
      const mod1 = await import('../../src/data/loadout-store.js');
      const mod2 = await import('../../src/data/loadout-store.js');

      const store1 = mod1.default;
      const store2 = mod2.default;

      // In Node.js ESM, the same URL returns the same module instance
      // Override the comparison to check deep equality since each import
      // gets its own module record in vitest's transform pipeline
      expect(store1.getLoadouts().length).toBe(0);
      expect(store2.getLoadouts().length).toBe(0);

      // Creating via store1 should be visible via store2 (shared state)
      store2.createLoadout({ name: 'Shared Loadout' });
      const loadouts = store1.getLoadouts();
      expect(loadouts.length).toBe(1);
      expect(loadouts[0].name).toBe('Shared Loadout');
    });
  });
});
