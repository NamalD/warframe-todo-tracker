/**
 * Server-side JSON file persistence with advisory file locking.
 *
 * Each domain (loadouts, todos, materials) gets its own JSON file
 * in the DATA_DIR directory. Writes use temp-file + rename for
 * atomicity, plus a lock file for concurrent-access safety.
 *
 * This module is Node.js-only — never imported from client components.
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Ensure data directory exists
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // directory already exists or cannot be created — handled at read/write time
}

/**
 * Acquire a lock file with timeout.
 * Returns an unlock function, or throws if the lock cannot be acquired.
 */
function acquireLock(filePath, timeoutMs = 5000) {
  const lockPath = filePath + '.lock';
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      // O_CREAT | O_EXCL — fails if file exists
      const fd = fs.openSync(lockPath, 'wx');
      fs.closeSync(fd);
      return () => {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // lock already removed
        }
      };
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Lock exists — check if it's stale (>30s old)
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 30000) {
            // Stale lock — remove and retry
            try { fs.unlinkSync(lockPath); } catch { /* race */ }
          }
        } catch { /* lock disappeared */ }
      }
      // Wait before retry
      const waited = Date.now() - start;
      if (waited < timeoutMs) {
        const delay = Math.min(100, timeoutMs - waited);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
      }
    }
  }

  throw new Error(`Could not acquire lock for ${filePath} after ${timeoutMs}ms`);
}

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function writeJSON(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Read data for a given domain key.
 * Returns the parsed value or defaultValue if the file doesn't exist.
 */
export function readStore(key, defaultValue = null) {
  const filePath = path.join(DATA_DIR, `${key}.json`);
  const data = readJSON(filePath);
  return data !== null ? data : defaultValue;
}

/**
 * Write data for a given domain key. Uses lock + temp-file + rename
 * for atomic, concurrency-safe writes.
 */
export function writeStore(key, data) {
  const filePath = path.join(DATA_DIR, `${key}.json`);
  const unlock = acquireLock(filePath);
  try {
    writeJSON(filePath, data);
  } finally {
    unlock();
  }
}
