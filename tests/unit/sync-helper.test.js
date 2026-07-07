/**
 * Tests for sync-helper.js — client-side sync with version vectors, retry, migration, and conflict resolution.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchWithRetry, pullFromServer, pushToServer, getDeviceId, pullSyncData, pushChanges, patchRecord, createRecord, deleteRecord } from '../../src/data/sync-helper.js';

// Increase timeout for tests that involve real retry delays
const RETRY_TIMEOUT = 15000;

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('returns response on first success', async () => {
    const mockResponse = { ok: true, status: 200, json: () => Promise.resolve({ data: 'ok' }) };
    globalThis.fetch.mockResolvedValueOnce(mockResponse);

    const res = await fetchWithRetry('/api/test');
    expect(res).toBe(mockResponse);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network failure', async () => {
    globalThis.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await fetchWithRetry('/api/test');
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  }, RETRY_TIMEOUT);

  it('retries on 5xx errors', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await fetchWithRetry('/api/test');
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  }, RETRY_TIMEOUT);

  it('does not retry on 4xx errors', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 400 });

    const res = await fetchWithRetry('/api/test');
    expect(res.ok).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries', async () => {
    globalThis.fetch
      .mockRejectedValueOnce(new Error('Always fails'))
      .mockRejectedValueOnce(new Error('Always fails'))
      .mockRejectedValueOnce(new Error('Always fails'));

    await expect(fetchWithRetry('/api/test')).rejects.toThrow('Always fails');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  }, RETRY_TIMEOUT);
});

describe('pullFromServer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  it('returns server data when server has content', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 1, name: 'Server Loadout' }], version: 5 }),
    });

    const result = await pullFromServer('/api/loadouts', 'test-key');
    expect(result.fromServer).toBe(true);
    expect(result.data).toEqual([{ id: 1, name: 'Server Loadout' }]);
  });

  it('stores the server version for subsequent pushes', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 1 }], version: 3 }),
    });

    await pullFromServer('/api/loadouts', 'test-key');
    expect(localStorage.getItem('v:/api/loadouts')).toBe('3');
  });

  it('accepts empty server state as authoritative when server has version', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 'local-1', name: 'Local' }]));

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], version: 1 }),
    });

    const result = await pullFromServer('/api/loadouts', 'test-key');

    expect(result.fromServer).toBe(true);
    expect(result.fromLocal).toBeUndefined();
    expect(result.data).toEqual([]);
  });

  it('returns null data when both server and local are empty', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null, version: 0 }),
    });

    const result = await pullFromServer('/api/loadouts', 'test-key');
    expect(result.fromServer).toBe(true);
    expect(result.data).toBeNull();
  });

  it('migrates local data when server returns null', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 'local-1', name: 'Local' }]));

    globalThis.fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(null) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true, version: 1 }) });

    const onEvent = vi.fn();
    const result = await pullFromServer('/api/loadouts', 'test-key', onEvent);

    expect(result.fromLocal).toBe(true);
    expect(result.data).toEqual([{ id: 'local-1', name: 'Local' }]);
    expect(onEvent).toHaveBeenCalledWith('migrated', expect.any(String));
  });

  it('falls back to local when server is unreachable', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 'local', name: 'Fallback' }]));

    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const onEvent = vi.fn();
    const result = await pullFromServer('/api/loadouts', 'test-key', onEvent);

    expect(result.fromLocal).toBe(true);
    expect(result.data).toEqual([{ id: 'local', name: 'Fallback' }]);
    expect(onEvent).toHaveBeenCalledWith('error', expect.any(String));
  }, RETRY_TIMEOUT);

  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem('test-key', 'not-valid-json{');

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 1 }], version: 2 }),
    });

    const result = await pullFromServer('/api/loadouts', 'test-key');
    expect(result.fromServer).toBe(true);
    expect(result.data).toEqual([{ id: 1 }]);
  });
});

describe('pushToServer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  it('returns true on successful push', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, version: 1 }),
    });

    const onEvent = vi.fn();
    const result = await pushToServer('/api/loadouts', [{ id: 1 }], onEvent);

    expect(result).toBe(true);
    expect(onEvent).toHaveBeenCalledWith('success', 'Saved to server.');
  });

  it('sends version metadata in PUT body', async () => {
    localStorage.setItem('v:/api/loadouts', '3');

    let sentBody = null;
    globalThis.fetch.mockImplementationOnce(async (_url, options) => {
      sentBody = JSON.parse(options.body);
      return { ok: true, json: () => Promise.resolve({ ok: true, version: 4 }) };
    });

    await pushToServer('/api/loadouts', [{ id: 1 }]);
    expect(sentBody).toEqual({ data: [{ id: 1 }], version: 3 });
  });

  it('stores the returned version after successful push', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, version: 7 }),
    });

    await pushToServer('/api/loadouts', [{ id: 1 }]);
    expect(localStorage.getItem('v:/api/loadouts')).toBe('7');
  });

  it('returns false on network failure and calls error callback', async () => {
    globalThis.fetch
      .mockRejectedValueOnce(new Error('Network down'))
      .mockRejectedValueOnce(new Error('Network down'))
      .mockRejectedValueOnce(new Error('Network down'));

    const onEvent = vi.fn();
    const result = await pushToServer('/api/loadouts', [{ id: 1 }], onEvent);

    expect(result).toBe(false);
    expect(onEvent).toHaveBeenCalledWith('error', expect.stringContaining('Network down'));
  }, RETRY_TIMEOUT);

  it('returns false on server error response (after retries)', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Internal error' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Internal error' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Internal error' }) });

    const onEvent = vi.fn();
    const result = await pushToServer('/api/loadouts', [{ id: 1 }], onEvent);

    expect(result).toBe(false);
    expect(onEvent).toHaveBeenCalled();
    expect(onEvent.mock.calls[0][0]).toBe('error');
  }, RETRY_TIMEOUT);

  it('retries on transient failure then succeeds', async () => {
    globalThis.fetch
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true, version: 1 }) });

    const result = await pushToServer('/api/loadouts', [{ id: 1 }]);
    expect(result).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  }, RETRY_TIMEOUT);

  describe('conflict resolution (409)', () => {
    it('pulls latest from server, merges, and retries on 409 conflict', async () => {
      localStorage.setItem('v:/api/loadouts', '0');

      const serverData = [{ id: 1, name: 'Server Item' }];

      globalThis.fetch
        .mockResolvedValueOnce({
          ok: false, status: 409,
          json: () => Promise.resolve({ error: 'Version conflict', currentVersion: 3 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: serverData, version: 3 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ok: true, version: 4 }),
        });

      const onEvent = vi.fn();
      const result = await pushToServer('/api/loadouts', [{ id: 1, name: 'Client Item' }], onEvent);

      expect(result).toBe(true);
      expect(onEvent).toHaveBeenCalledWith('conflict', expect.any(String));
      expect(onEvent).toHaveBeenCalledWith('success', 'Saved to server.');
      expect(localStorage.getItem('v:/api/loadouts')).toBe('4');
    });

    it('still returns false if retry after conflict also fails', async () => {
      localStorage.setItem('v:/api/loadouts', '0');

      globalThis.fetch
        .mockResolvedValueOnce({
          ok: false, status: 409,
          json: () => Promise.resolve({ error: 'Version conflict', currentVersion: 2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [], version: 2 }),
        })
        .mockResolvedValueOnce({
          ok: false, status: 500,
          json: () => Promise.resolve({ error: 'Still broken' }),
        });

      const onEvent = vi.fn();
      const result = await pushToServer('/api/loadouts', [{ id: 1 }], onEvent);

      expect(result).toBe(false);
      expect(onEvent).toHaveBeenCalledWith('error', expect.any(String));
    });
  });
});

// ---------------------------------------------------------------------------
// New granular sync helpers
// ---------------------------------------------------------------------------

describe('getDeviceId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates a device ID on first call', () => {
    const id = getDeviceId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^device-/);
  });

  it('returns the same ID on subsequent calls', () => {
    const id1 = getDeviceId();
    const id2 = getDeviceId();
    expect(id1).toBe(id2);
  });

  it('persists the device ID in localStorage', () => {
    const id = getDeviceId();
    expect(localStorage.getItem('warframe-device-id')).toBe(id);
  });

  it('reuses a previously stored device ID', () => {
    localStorage.setItem('warframe-device-id', 'device-persisted-abc123');
    const id = getDeviceId();
    expect(id).toBe('device-persisted-abc123');
  });
});

describe('pullSyncData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  it('fetches from the sync endpoint and returns parsed data', async () => {
    const syncData = {
      loadouts: [{ id: 'l1', name: 'Loadout', version: 1 }],
      todos: [{ id: 't1', user_notes: 'Todo', status: 'pending', version: 1 }],
      materials_inventory: { 'Alloy Plate': { quantity: 50, version: 1 } },
      server_timestamp: '2026-07-07T00:00:00Z',
    };

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(syncData),
    });


    const result = await pullSyncData('/api/sync');

    expect(result).toEqual(syncData);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/sync', {});
  });

  it('supports ?since filter for incremental sync', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ loadouts: [], todos: [], materials_inventory: {}, server_timestamp: '2026-07-07T01:00:00Z' }),
    });


    await pullSyncData('/api/sync', { since: '2026-07-07T00:00:00Z' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/sync?since=2026-07-07T00%3A00%3A00Z',
      {}
    );
  });

  it('throws when server returns an error', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal error' }),
    });


    await expect(pullSyncData('/api/sync')).rejects.toThrow();
  });
});

describe('pushChanges', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  it('sends changes to the sync endpoint with device ID', async () => {
    localStorage.setItem('warframe-device-id', 'device-test-123');

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        accepted: { loadouts: ['l1'], todos: [], materials_inventory: [] },
        conflicts: { loadouts: [], todos: [], materials_inventory: [] },
        server_timestamp: '2026-07-07T00:00:00Z',
      }),
    });


    const result = await pushChanges('/api/sync', {
      todos: [{ id: 't1', user_notes: 'Updated', clientVersion: 1 }],
    });

    expect(result.accepted.loadouts).toEqual(['l1']);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('device-test-123'),
    });

    const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(sentBody.device_id).toBe('device-test-123');
    expect(sentBody.todos).toEqual([{ id: 't1', user_notes: 'Updated', clientVersion: 1 }]);
  });

  it('throws when server returns an error', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad request' }),
    });


    await expect(pushChanges('/api/sync', { todos: [] })).rejects.toThrow('Push changes failed');
  });
});

describe('patchRecord', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  it('sends a PATCH request to the record endpoint', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 't1', user_notes: 'Updated', version: 2 }),
    });


    const result = await patchRecord('/api/todos', 't1', {
      updates: { user_notes: 'Updated' },
      clientVersion: 1,
    });

    expect(result.version).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/todos/t1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: { user_notes: 'Updated' }, clientVersion: 1 }),
    });
  });

  it('throws on 409 conflict with conflict metadata', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({
        conflict: true,
        record_id: 't1',
        server_version: 3,
        server_data: { id: 't1', user_notes: 'Server version', version: 3 },
      }),
    });


    try {
      await patchRecord('/api/todos', 't1', {
        updates: { user_notes: 'Client version' },
        clientVersion: 1,
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      expect(err.conflict).toBe(true);
      expect(err.serverVersion).toBe(3);
      expect(err.serverData).toBeTruthy();
      expect(err.message).toContain('Conflict');
    }
  });
});

describe('createRecord', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  it('sends a POST request and returns created record', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'new-todo', user_notes: 'New', version: 1 }),
    });


    const result = await createRecord('/api/todos', { user_notes: 'New', status: 'pending' });

    expect(result.id).toBe('new-todo');
    expect(result.version).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_notes: 'New', status: 'pending' }),
    });
  });

  it('throws on server error', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad request' }),
    });


    await expect(createRecord('/api/todos', {})).rejects.toThrow('Failed to create record');
  });
});

describe('deleteRecord', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    localStorage.clear();
  });

  it('sends a DELETE request with clientVersion', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });


    const result = await deleteRecord('/api/todos', 't1', 2);

    expect(result).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/todos/t1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientVersion: 2 }),
    });
  });

  it('throws on 409 conflict with conflict metadata', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({
        conflict: true,
        record_id: 't1',
        server_version: 3,
        server_data: { id: 't1', version: 3 },
      }),
    });


    try {
      await deleteRecord('/api/loadouts', 'l1', 1);
      expect(true).toBe(false);
    } catch (err) {
      expect(err.conflict).toBe(true);
      expect(err.serverVersion).toBe(3);
    }
  });
});
