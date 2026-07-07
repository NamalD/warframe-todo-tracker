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
// Device ID
// ---------------------------------------------------------------------------

const DEVICE_ID_KEY = 'warframe-device-id';

/**
 * Get or generate a persistent device ID.
 *
 * Generates a random ID on first call and stores it in localStorage.
 * The device ID identifies this client in sync requests so the server
 * can track which device made each mutation.
 *
 * @returns {string} A persistent device identifier.
 */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `device-${Date.now()}`;
  }
}

// ---------------------------------------------------------------------------
// Granular per-record API
// ---------------------------------------------------------------------------

/**
 * Pull full sync data from the server.
 *
 * Calls GET /api/sync which returns { loadouts, todos, materials_inventory,
 * server_timestamp } — all records include their version metadata.
 *
 * @param {string} apiPath - Base path for sync (e.g. '/api/sync')
 * @param {object} [options] - Optional options
 * @param {string} [options.since] - ISO timestamp; only return records updated after this
 * @returns {Promise<{loadouts: Array, todos: Array, materials_inventory: object, server_timestamp: string}>}
 * @throws {Error} If the request fails after all retries
 */
export async function pullSyncData(apiPath, options = {}) {
  const url = options.since
    ? `${apiPath}?since=${encodeURIComponent(options.since)}`
    : apiPath;
  return fetchJson(url);
}

/**
 * Push changes to the server via the sync endpoint.
 *
 * Sends only dirty records (those modified locally) with their versions.
 * The server processes each record with per-record version checking.
 *
 * @param {string} apiPath - Sync endpoint path (e.g. '/api/sync')
 * @param {object} changes - The changes to push
 * @param {Array} [changes.loadouts] - Dirty loadout records with clientVersion
 * @param {Array} [changes.todos] - Dirty todo records with clientVersion
 * @param {object} [changes.materials_inventory] - Dirty materials inventory with version info
 * @returns {Promise<{accepted: object, conflicts: object, server_timestamp: string}>}
 */
export async function pushChanges(apiPath, changes) {
  const deviceId = getDeviceId();
  const body = { device_id: deviceId };

  if (changes.loadouts) body.loadouts = changes.loadouts;
  if (changes.todos) body.todos = changes.todos;
  if (changes.materials_inventory) body.materials_inventory = changes.materials_inventory;

  try {
    const res = await fetchWithRetry(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Push changes failed: HTTP ${res.status} — ${data.error || 'Unknown error'}`);
    }

    return data;
  } catch (err) {
    throw err;
  }
}

/**
 * Patch a single record with version-based conflict detection.
 *
 * Sends a PATCH request to the granular record API endpoint.
 * On 409 Conflict, the caller should resolve by fetching the server version.
 *
 * @param {string} apiPath - Endpoint path for the record type (e.g. '/api/todos')
 * @param {string} id - Record ID
 * @param {object} bodyPayload - The full PATCH body payload (e.g. { updates, clientVersion }
 *                                for todos or { data, clientVersion } for loadouts)
 * @returns {Promise<object>} The response data from the server
 * @throws {Error} With conflict property set to true, serverVersion, and serverData
 *                 on 409 conflicts; also on other HTTP errors
 */
export async function patchRecord(apiPath, id, bodyPayload) {
  const url = `${apiPath}/${encodeURIComponent(id)}`;

  try {
    const res = await fetchWithRetry(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });

    const responseData = await res.json();

    if (res.status === 409) {
      const err = new Error(`Conflict on record ${id}: server version ${responseData.server_version}`);
      err.conflict = true;
      err.serverVersion = responseData.server_version;
      err.serverData = responseData.server_data;
      throw err;
    }

    if (!res.ok) {
      throw new Error(`Failed to patch record ${id}: HTTP ${res.status} — ${responseData.error || 'Unknown error'}`);
    }

    return responseData;
  } catch (err) {
    if (err.conflict) throw err;
    throw err;
  }
}

/**
 * Create a single record on the server.
 *
 * Sends a POST request to the granular record API.
 *
 * @param {string} apiPath - Endpoint path for the record type (e.g. '/api/todos')
 * @param {object} data - The record data to create
 * @returns {Promise<object>} The created record with server-assigned version
 */
export async function createRecord(apiPath, data) {
  try {
    const res = await fetchWithRetry(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const responseData = await res.json();

    if (!res.ok) {
      throw new Error(`Failed to create record: HTTP ${res.status} — ${responseData.error || 'Unknown error'}`);
    }

    return responseData;
  } catch (err) {
    throw err;
  }
}

/**
 * Delete a single record with version-based conflict detection.
 *
 * Sends a DELETE request with the client's current version.
 * On 409 Conflict, the caller should resolve by fetching the server version.
 *
 * @param {string} apiPath - Endpoint path for the record type (e.g. '/api/todos')
 * @param {string} id - Record ID
 * @param {number} clientVersion - The client's current version of this record
 * @returns {Promise<object>} { ok: true } on success
 * @throws {Error} With conflict property set to true and serverVersion on 409
 */
export async function deleteRecord(apiPath, id, clientVersion) {
  const url = `${apiPath}/${encodeURIComponent(id)}`;

  try {
    const res = await fetchWithRetry(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientVersion }),
    });

    const responseData = await res.json();

    if (res.status === 409) {
      const err = new Error(`Conflict deleting record ${id}: server version ${responseData.server_version}`);
      err.conflict = true;
      err.serverVersion = responseData.server_version;
      err.serverData = responseData.server_data;
      throw err;
    }

    if (!res.ok) {
      throw new Error(`Failed to delete record ${id}: HTTP ${res.status} — ${responseData.error || 'Unknown error'}`);
    }

    return responseData;
  } catch (err) {
    if (err.conflict) throw err;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and parse the JSON response.
 *
 * Uses fetchWithRetry internally. Throws on non-ok responses with
 * error details parsed from the response body.
 *
 * @param {string} url - URL to fetch
 * @returns {Promise<*>} Parsed JSON response
 */
async function fetchJson(url) {
  const res = await fetchWithRetry(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Fetch failed: HTTP ${res.status} — ${data.error || 'Unknown error'}`);
  }

  return data;
}

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
