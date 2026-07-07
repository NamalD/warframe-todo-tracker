/**
 * Client-side sync helper — retry, error notification, and migration.
 *
 * This module is for client components only (uses fetch, localStorage).
 */

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 200;  // base delay, doubles each retry

/**
 * Callback type for notifying the UI of sync events.
 * @callback SyncCallback
 * @param {'error'|'migrated'|'conflict'|'success'} event
 * @param {string} message — human-readable description
 */

/**
 * Fetch with retry and exponential backoff.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, options);
      // Only retry on server errors (5xx) or network failures
      if (res.ok || res.status < 500) return res;

      lastError = new Error(`Server error: ${res.status}`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

/**
 * Pull data from the server.
 * Returns { data, fromServer: bool, fromLocal: bool }
 *
 * If the server has data, returns it. If the server is empty but
 * localStorage has data, migrates localStorage → server and returns
 * localStorage data. Returns null data if both are empty.
 *
 * @param {string} apiPath   — e.g. '/api/loadouts'
 * @param {string} storageKey — localStorage key
 * @param {SyncCallback} [onEvent]
 * @param {string} [dataKey]  — if set, extract this key from localStorage obj for migration
 * @returns {Promise<{data: any, fromServer: boolean, fromLocal: boolean}>}
 */
export async function pullFromServer(apiPath, storageKey, onEvent, dataKey = null) {
  // Read local data first (always available)
  let localData = null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      localData = JSON.parse(raw);
    }
  } catch {
    localData = null;
  }

  // Try to get server data
  try {
    const res = await fetchWithRetry(apiPath);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    const serverData = await res.json();

    // Determine if server has content
    const serverHasContent = serverData !== null
      && serverData !== undefined
      && (Array.isArray(serverData)
        ? serverData.length > 0
        : (typeof serverData === 'object' && Object.keys(serverData).length > 0));

    if (serverHasContent) {
      // Server has data — use it
      return { data: serverData, fromServer: true, fromLocal: false };
    }

    // Server returned an explicit empty value ([] or {}) — accept as truth
    // Only migrate if server returned null (no data file exists yet)
    if (serverData !== null && serverData !== undefined) {
      // Server confirmed empty — accept it
      return { data: serverData, fromServer: true, fromLocal: false };
    }

    // Server returned null (no file) — check if we have local data to migrate
    const localHasContent = localData !== null
      && (Array.isArray(localData)
        ? localData.length > 0
        : (typeof localData === 'object' && Object.keys(localData).length > 0));

    if (localHasContent) {
      // Unwrap if dataKey is specified (e.g., loadouts stores { loadouts: [...] })
      const dataToPush = (dataKey && typeof localData === 'object' && !Array.isArray(localData))
        ? (localData[dataKey] ?? localData)
        : localData;
      // Push local to server (migration)
      try {
        await fetchWithRetry(apiPath, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToPush),
        });
        if (onEvent) {
          onEvent('migrated', `Migrated ${storageKey} from this browser to the server.`);
        }
      } catch {
        if (onEvent) {
          onEvent('error', `Failed to migrate ${storageKey} to server. Data saved locally.`);
        }
      }
      return { data: localData, fromServer: false, fromLocal: true };
    }

    // Both null — no data anywhere
    return { data: null, fromServer: true, fromLocal: false };
  } catch (err) {
    // Server unreachable — fall back to localStorage
    if (onEvent) {
      onEvent('error', `Could not reach server. Using local data.`);
    }
    console.warn(`[sync] pullFromServer failed for ${apiPath}: ${err.message}`);
  }

  // Fallback: use local data
  return { data: localData, fromServer: false, fromLocal: true };
}

/**
 * Push data to the server with retry and error notification.
 *
 * @param {string} apiPath    — e.g. '/api/loadouts'
 * @param {any} data          — the data to push
 * @param {SyncCallback} [onEvent]
 * @returns {Promise<boolean>} — true if push succeeded
 */
export async function pushToServer(apiPath, data, onEvent) {
  try {
    const res = await fetchWithRetry(apiPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server returned ${res.status}`);
    }
    if (onEvent) onEvent('success', 'Saved to server.');
    return true;
  } catch (err) {
    if (onEvent) {
      onEvent('error', `Failed to save to server: ${err.message}. Data saved locally.`);
    }
    console.warn(`[sync] pushToServer failed for ${apiPath}: ${err.message}`);
    return false;
  }
}
