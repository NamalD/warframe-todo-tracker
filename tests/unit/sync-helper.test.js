/**
 * Tests for sync-helper.js — client-side sync with version vectors, retry, migration, and conflict resolution.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchWithRetry, pullFromServer, pushToServer } from '../../src/data/sync-helper.js';

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
