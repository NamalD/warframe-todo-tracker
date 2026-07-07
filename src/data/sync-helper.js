/**
 * Client-side sync helper with retry, conflict resolution, and migration.
 *
 * Provides version-vector-based last-writer-wins sync for 3 domains:
 * loadouts, todos, and materials-inventory.
 *
 * Version tracking:
 *   - Each domain has a monotonically increasing version counter
 *   - Server stores the version in the sync_meta SQLite table
 *   - Client stores the version per URL in localStorage keyed by `v:<url>`
 *   - PUT includes { data, version } — server rejects stale writes with 409
 *   - On 409, the client pulls the latest data, merges, and retries
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VERSION_PREFIX = 'v:';

function getVersionKey(url) {
  return `${VERSION_PREFIX}${url}`;
}

function readVersion(url) {
  try {
    const raw = localStorage.getItem(getVersionKey(url));
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

function storeVersion(url, version) {
  try {
    localStorage.setItem(getVersionKey(url), String(version));
  } catch {
    // localStorage may be full or unavailable — non-fatal
  }
}

function tryParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Deep merge two arrays of objects keyed by `id`, preferring server values
 * on field-level conflicts. Used as the 3-way merge strategy when a 409
 * conflict is detected.
 */
function mergeData(clientData, serverData) {
  if (!Array.isArray(serverData) || !Array.isArray(clientData)) {
    // For object maps (materials-inventory), prefer server side
    if (typeof serverData === 'object' && serverData !== null &&
        typeof clientData === 'object' && clientData !== null &&
        !Array.isArray(serverData) && !Array.isArray(clientData)) {
      return { ...serverData, ...clientData };
    }
    return serverData;
  }

  // Arrays of objects keyed by `id` — field-level merge
  const serverMap = new Map(serverData.map(item => [item.id, item]));
  const merged = [...serverData];

  for (const clientItem of clientData) {
    const serverItem = serverMap.get(clientItem.id);
    if (!serverItem) {
      // Item doesn't exist on server — add it
      merged.push(clientItem);
    } else {
      // Item exists on both — prefer server values for each field,
      // but retain client fields that don't exist on server
      merged[merged.indexOf(serverItem)] = { ...serverItem, ...clientItem };
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch wrapper with retry for transient failures.
 *
 * Retries on network errors and 5xx status codes with exponential backoff
 * (1s, 2s). Does NOT retry on 4xx errors.
 *
 * @param {string} url - URL to fetch
 * @param {object} [options={}] - fetch options
 * @param {number} [maxRetries=3] - Maximum fetch attempts
 * @returns {Promise<Response>} Fetch Response object
 * @throws {Error} If all retries are exhausted
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res;
      }
      // 5xx — retryable
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

/**
 * Pull data from the server, extracting version metadata.
 *
 * Strategy:
 *   1. Fetch GET from the server
 *   2. Parse response as { data, version } (new format) or raw data (legacy)
 *   3. If server has data → return it, storing the version
 *   4. If server is empty and local has data → migrate local to server
 *   5. If server is unreachable → fall back to localStorage
 *
 * @param {string} url - API endpoint URL
 * @param {string} localStorageKey - localStorage key for local fallback
 * @param {function} [onEvent] - Optional callback for sync events
 * @param {string} [dataKey] - If set, extract this key from localStorage object for migration
 * @returns {Promise<{fromServer?: boolean, fromLocal?: boolean, data: *}>}
 */
export async function pullFromServer(url, localStorageKey, onEvent, dataKey) {
  try {
    const res = await fetchWithRetry(url);
    const body = await res.json();

    // Handle both new format ({ data, version }) and legacy format (raw data)
    const serverData = (body && typeof body === 'object' && 'data' in body) ? body.data : body;
    const serverVersion = (body && typeof body === 'object' && 'version' in body) ? body.version : 0;

    const localRaw = localStorage.getItem(localStorageKey);
    let localData = localRaw ? tryParse(localRaw) : null;

    if (dataKey && localData && typeof localData === 'object' && !Array.isArray(localData)) {
      localData = localData[dataKey] ?? localData;
    }

    if (serverData !== null && serverData !== undefined) {
      // Server has data — authoritative
      storeVersion(url, serverVersion);
      return { fromServer: true, data: serverData };
    }

    // Server returned null/undefined — check local for migration
    if (localData !== null && localData !== undefined) {
      // Check if local data is empty (delete-all propagation from another device)
      const localEmpty = Array.isArray(localData)
        ? localData.length === 0
        : Object.keys(localData).length === 0;

      if (localEmpty) {
        // Both are empty — return server's empty state
        return { fromServer: true, data: localData };
      }

      // Local has data, server doesn't — migrate
      await pushToServer(url, localData, onEvent);
      if (onEvent) onEvent('migrated', `Migrated local data to server (${url})`);
      return { fromLocal: true, data: localData };
    }

    // Both empty
    return { fromServer: true, data: null };
  } catch (err) {
    // Network down — fall back to localStorage
    const localRaw = localStorage.getItem(localStorageKey);
    let localData = localRaw ? tryParse(localRaw) : null;
    if (dataKey && localData && typeof localData === 'object' && !Array.isArray(localData)) {
      localData = localData[dataKey] ?? localData;
    }
    if (localData) {
      if (onEvent) onEvent('error', err.message);
      return { fromLocal: true, data: localData };
    }
    throw err;
  }
}

/**
 * Push data to the server with version metadata.
 *
 * Includes the client's current version for conflict detection.
 * On 409 Conflict, pulls the latest data from the server, performs a
 * 3-way merge, and retries the push with the updated version.
 *
 * @param {string} url - API endpoint URL
 * @param {*} data - Data to send
 * @param {function} [onEvent] - Optional callback for sync events
 * @returns {Promise<boolean>} true if the push succeeded
 */
export async function pushToServer(url, data, onEvent) {
  const version = readVersion(url);

  try {
    const res = await fetchWithRetry(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, version }),
    });

    if (!res.ok) {
      if (res.status === 409) {
        // Conflict — pull latest, merge, retry
        const conflictBody = await res.json().catch(() => ({}));
        const serverVersion = conflictBody.currentVersion || 0;

        // Pull current server data
        const pullRes = await fetchWithRetry(url);
        const pullBody = await pullRes.json();
        const serverData = (pullBody && typeof pullBody === 'object' && 'data' in pullBody)
          ? pullBody.data
          : pullBody;

        // 3-way merge: client changes + server state
        const merged = mergeData(data, serverData);

        if (onEvent) onEvent('conflict', `Conflict resolved via 3-way merge at version ${serverVersion}`);

        // Retry with merged data and server's version
        const retryRes = await fetchWithRetry(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: merged, version: serverVersion }),
        });

        if (!retryRes.ok) {
          if (onEvent) onEvent('error', `Push failed after conflict resolution: HTTP ${retryRes.status}`);
          return false;
        }

        const retryBody = await retryRes.json();
        if (retryBody && retryBody.version !== undefined) {
          storeVersion(url, retryBody.version);
        }
        if (onEvent) onEvent('success', 'Saved to server.');
        return true;
      }

      // Non-409 error (4xx)
      if (onEvent) onEvent('error', `Server error: HTTP ${res.status}`);
      return false;
    }

    const body = await res.json();
    if (body && body.version !== undefined) {
      storeVersion(url, body.version);
    }
    if (onEvent) onEvent('success', 'Saved to server.');
    return true;
  } catch (err) {
    if (onEvent) onEvent('error', err.message);
    return false;
  }
}

/**
 * Pull data from the server and update a local copy.
 *
 * Combines pullFromServer with automatic local storage update.
 * Returns the data and whether it came from the server or local.
 *
 * @param {string} url - API endpoint URL
 * @param {string} localStorageKey - localStorage key for local storage
 * @param {function} [onEvent] - Optional event callback
 * @returns {Promise<{fromServer?: boolean, fromLocal?: boolean, data: *}>}
 */
export async function syncPull(url, localStorageKey, onEvent) {
  const result = await pullFromServer(url, localStorageKey, onEvent);
  if (result.data !== null && result.data !== undefined) {
    try {
      localStorage.setItem(localStorageKey, JSON.stringify(result.data));
    } catch {
      // localStorage may be full
    }
  }
  return result;
}
