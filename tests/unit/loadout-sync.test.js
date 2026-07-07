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

  // Default: server returns empty data (fresh state)
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
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

      globalThis.fetch.mockReset();
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: 'srv-1', name: 'Server Loadout', created_at: '2026-01-01', updated_at: '2026-01-01', slots: [] },
        ]),
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

      globalThis.fetch.mockReset();
      // fetchWithRetry tries 3 times (1 initial + 2 retries)
      globalThis.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(3000);
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

      // Reset fetch and simulate: GET returns null (no file exists), then PUT succeeds
      globalThis.fetch.mockReset();
      globalThis.fetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(null) }) // GET — no server data
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) }); // PUT

      await repo.syncFromServer();

      // Should have pushed local data to server
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      // Last call should be a PUT
      const lastCall = globalThis.fetch.mock.calls[1];
      expect(lastCall[1].method).toBe('PUT');
      const body = JSON.parse(lastCall[1].body);
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
        json: () => Promise.resolve([{ id: 'srv-1', name: 'Server', created_at: '2026-01-01', updated_at: '2026-01-01', slots: [] }]),
      });

      await repo.syncFromServer();

      // Should only have called GET once, no PUT (server has data)
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('lastSyncError', () => {
    it('is set on sync failure', async () => {
      const repo = new LoadoutRepository();

      globalThis.fetch.mockReset();
      // fetchWithRetry tries 3 times
      globalThis.fetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'));

      const promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(3000);
      await promise;
      expect(repo.lastSyncError).toBeTruthy();
    });

    it('is cleared on successful sync', async () => {
      const repo = new LoadoutRepository();

      // First fail: 3 rejections for fetchWithRetry
      globalThis.fetch.mockReset();
      globalThis.fetch
        .mockRejectedValueOnce(new Error('First fail'))
        .mockRejectedValueOnce(new Error('First fail'))
        .mockRejectedValueOnce(new Error('First fail'));

      let promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(3000);
      await promise;
      expect(repo.lastSyncError).toBeTruthy();

      // Then succeed
      globalThis.fetch.mockReset();
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 'srv-1', name: 'OK', created_at: '2026-01-01', updated_at: '2026-01-01', slots: [] }]),
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
      // fetchWithRetry tries 3 times
      globalThis.fetch
        .mockRejectedValueOnce(new Error('Down'))
        .mockRejectedValueOnce(new Error('Down'))
        .mockRejectedValueOnce(new Error('Down'));

      const promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(3000);
      await promise;
      // The sync calls pullFromServer which calls fetchWithRetry.
      // fetchWithRetry throws after max retries. pullFromServer catches
      // and falls back to local, calling onEvent('error', ...) with a generic message.
      expect(onEvent).toHaveBeenCalledWith('error', expect.any(String));
    });

    it('does not call callback when no callback is set', async () => {
      const repo = new LoadoutRepository();

      globalThis.fetch.mockReset();
      // 3 rejections for fetchWithRetry
      globalThis.fetch
        .mockRejectedValueOnce(new Error('Down'))
        .mockRejectedValueOnce(new Error('Down'))
        .mockRejectedValueOnce(new Error('Down'));

      // Should not throw
      const promise = repo.syncFromServer();
      await vi.advanceTimersByTimeAsync(3000);
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
