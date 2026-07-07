/**
 * Tests for sync-helper.js — client-side sync with retry, migration, and error handling.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchWithRetry, pullFromServer, pushToServer } from '../../src/data/sync-helper.js';

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
  });

  it('retries on 5xx errors', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const res = await fetchWithRetry('/api/test');
    expect(res.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 4xx errors', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 400 });

    const res = await fetchWithRetry('/api/test');
    expect(res.ok).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Always fails'));

    await expect(fetchWithRetry('/api/test')).rejects.toThrow('Always fails');
    // 1 initial + 2 retries = 3 attempts
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
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
      json: () => Promise.resolve([{ id: 1, name: 'Server Loadout' }]),
    });

    const result = await pullFromServer('/api/loadouts', 'test-key');
    expect(result.fromServer).toBe(true);
    expect(result.data).toEqual([{ id: 1, name: 'Server Loadout' }]);
  });

  it('accepts empty server state as authoritative and skips migration', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 'local-1', name: 'Local' }]));

    // Server returns empty array (has file, confirmed empty — e.g., delete-all from another device)
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

    const onEvent = vi.fn();
    const result = await pullFromServer('/api/loadouts', 'test-key', onEvent);

    // Server returns empty but authoritative (fromServer: true), no migration triggered
    expect(result.fromServer).toBe(true);
    expect(result.fromLocal).toBe(false);
    expect(result.data).toEqual([]);
    // No migration event — server already confirmed empty
    expect(onEvent).not.toHaveBeenCalledWith('migrated', expect.any(String));
  });

  it('migrates local data when server returns null (no file exists)', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 'local-1', name: 'Local' }]));

    // Server returns null (no data file at all — first-time setup)
    globalThis.fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(null) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });

    const onEvent = vi.fn();
    const result = await pullFromServer('/api/loadouts', 'test-key', onEvent);

    // When server returns null, migration is triggered from localStorage
    expect(result.fromLocal).toBe(true);
    expect(result.data).toEqual([{ id: 'local-1', name: 'Local' }]);
    expect(onEvent).toHaveBeenCalledWith('migrated', expect.any(String));
  });

  it('accepts empty server state (delete-all propagation)', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 1, name: 'Old' }]));

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await pullFromServer('/api/loadouts', 'test-key');
    expect(result.fromServer).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('returns null data when both server and local are empty', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(null),
    });

    const result = await pullFromServer('/api/loadouts', 'test-key');
    expect(result.fromServer).toBe(true);
    expect(result.data).toBeNull();
  });

  it('falls back to local when server is unreachable', async () => {
    localStorage.setItem('test-key', JSON.stringify([{ id: 'local', name: 'Fallback' }]));

    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const onEvent = vi.fn();
    const result = await pullFromServer('/api/loadouts', 'test-key', onEvent);

    expect(result.fromLocal).toBe(true);
    expect(result.data).toEqual([{ id: 'local', name: 'Fallback' }]);
    expect(onEvent).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem('test-key', 'not-valid-json{');

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 1 }]),
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
  });

  it('returns true on successful push', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    const onEvent = vi.fn();
    const result = await pushToServer('/api/loadouts', [{ id: 1 }], onEvent);

    expect(result).toBe(true);
    expect(onEvent).toHaveBeenCalledWith('success', 'Saved to server.');
  });

  it('returns false on network failure and calls error callback', async () => {
    // Mock 3x failures (initial + 2 retries)
    globalThis.fetch
      .mockRejectedValueOnce(new Error('Network down'))
      .mockRejectedValueOnce(new Error('Network down'))
      .mockRejectedValueOnce(new Error('Network down'));

    const onEvent = vi.fn();
    const result = await pushToServer('/api/loadouts', [{ id: 1 }], onEvent);

    expect(result).toBe(false);
    expect(onEvent).toHaveBeenCalledWith('error', expect.stringContaining('Network down'));
  });

  it('returns false on server error response (after retries)', async () => {
    // 3x 500 responses (initial + 2 retries) — all retryable
    globalThis.fetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Internal error' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Internal error' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Internal error' }) });

    const onEvent = vi.fn();
    const result = await pushToServer('/api/loadouts', [{ id: 1 }], onEvent);

    expect(result).toBe(false);
    // After all retries, the last error is thrown
    expect(onEvent).toHaveBeenCalled();
    expect(onEvent.mock.calls[0][0]).toBe('error');
  });

  it('retries on transient failure then succeeds', async () => {
    globalThis.fetch
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });

    const result = await pushToServer('/api/loadouts', [{ id: 1 }]);
    expect(result).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
