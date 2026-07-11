# SQLite Persistence Architecture

**Version:** 1.0.0  
**Status:** Draft  
**Author:** daedalus  
**Date:** 2026-07-07  

---

## Table of Contents

1. [Overview](#overview)
2. [Scope](#scope)
3. [SQLite Schema Design](#sqlite-schema-design)
4. [Sync Strategy](#sync-strategy)
5. [API Layer](#api-layer)
6. [Migration Path](#migration-path)
7. [Module Structure](#module-structure)
8. [Docker & Data Directory](#docker--data-directory)
9. [Client-Side Changes](#client-side-changes)
10. [Edge Cases & States](#edge-cases--states)
11. [Task Breakdown](#task-breakdown)
12. [Testability](#testability)

---

## Overview

Replace the current JSON-file-based server persistence (`server-store.ts`) with SQLite, enabling safe multi-device sync through per-record version tracking. The three user-data domains—**loadouts**, **todos**, and **materials-inventory**—move from monolithic JSON files (`data/{loadouts,todos,materials-inventory}.json`) into a single SQLite database (`data/warframe.db`). Reference data (items, materials, tree relationships from `@wfcd/items` npm package) stays out of SQLite — it's read-only and served via `data/wfcd-cache.json`.

---

## Scope

**In scope:**
- Loadouts (with nested slots, requirements, materials)
- Todos (flat objects with status/priority/notes)
- Materials inventory (simple material-name → quantity map)
- Sync metadata (schema version, device registry)

**Out of scope:**
- Warframe item reference data (items, materials, sources, tree relationships from `@wfcd/items`)
- Authentication or user accounts (single-user app, but tracked devices need an identifier)
- Full conflict resolution UI — start with last-writer-wins, log conflicts

---

## SQLite Schema Design

### Design Decision: Normalized Top-Level + JSON Blob for Deep Nesting

Loadouts have deeply nested structure (loadout → slots[] → requirements[] → materials[]). Full normalization would require 5+ tables with complex joins for every read. Since the app is predominantly read-heavy (display loadouts) and writes are at the loadout granularity, we store the nested structure as a JSON blob while keeping top-level metadata (id, version, timestamps) as indexed columns.

Todos are already flat — fully normalized columns. Materials-inventory is key-value — a simple two-column table.

### SQLite Library: `better-sqlite3`

**Choice:** `better-sqlite3` (synchronous, native bindings)  
**Rationale:** 
- Synchronous API means no `await` in API route handlers — cleaner code, simpler error handling
- ~2x faster than `sql.js` for read-heavy workloads
- Well-maintained, widely used in Node.js ecosystem
- Single-user app — no concurrent connection concerns
- Docker build: needs `node:22-alpine` with build tools for native compilation (already present in the builder stage)

**Trade-off acknowledged:** Synchronous DB operations block the Node.js event loop. Acceptable here because:
- The app is single-user with low concurrency
- SQLite WAL mode ensures reads don't block writes
- Write operations are small (single loadout, single todo)

### SQLite Schema

```sql
-- Enable WAL mode for concurrent read performance
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- SCHEMA VERSION
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT NOT NULL
);

-- ============================================================
-- LOADOUTS
-- Each loadout stores its full nested structure (slots,
-- requirements, materials) as a JSON blob in `data`.
-- ============================================================
CREATE TABLE IF NOT EXISTS loadouts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    data        TEXT NOT NULL DEFAULT '{}',   -- JSON blob of full loadout with slots/requirements/materials
    version     INTEGER NOT NULL DEFAULT 0,   -- monotonic counter, incremented server-side on every write
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_loadouts_updated_at ON loadouts(updated_at);

-- ============================================================
-- TODOS
-- Flat document, fully normalized columns.
-- ============================================================
CREATE TABLE IF NOT EXISTS todos (
    id                  TEXT PRIMARY KEY,
    craftable_item_id   TEXT,                          -- FK-ish: optional reference to item
    linked_material_name TEXT,                          -- FK-ish: optional reference to material name
    user_notes          TEXT DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending','in_progress','completed','abandoned')),
    priority            TEXT DEFAULT 'medium'
                        CHECK(priority IN ('low','medium','high')),
    due_at              TEXT,                          -- ISO 8601 or NULL
    version             INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_updated_at ON todos(updated_at);

-- ============================================================
-- MATERIALS INVENTORY
-- Simple key-value: material_name → quantity_owned.
-- ============================================================
CREATE TABLE IF NOT EXISTS materials_inventory (
    material_name   TEXT PRIMARY KEY,
    quantity        INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    version         INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- SYNC METADATA
-- Key-value store for sync-related bookkeeping.
-- Keys:
--   'device:<device_id>.last_sync' — last sync timestamp per device
--   'global_version' — monotonically increasing global version counter
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_meta (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

-- ============================================================
-- CONFLICT LOG
-- Records conflicts that were resolved via last-writer-wins,
-- so they can be surfaced in the UI.
-- ============================================================
CREATE TABLE IF NOT EXISTS conflict_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name      TEXT NOT NULL,       -- 'loadouts' | 'todos' | 'materials_inventory'
    record_id       TEXT NOT NULL,
    client_version  INTEGER NOT NULL,
    server_version  INTEGER NOT NULL,
    device_id       TEXT NOT NULL,
    resolved_at     TEXT NOT NULL DEFAULT (datetime('now')),
    details         TEXT                 -- JSON with conflicting fields, if available
);

CREATE INDEX IF NOT EXISTS idx_conflict_log_resolved ON conflict_log(resolved_at);
```

### Schema Versioning

The `schema_version` table tracks migrations. On app startup, the SQLite module checks the current version and applies pending migrations sequentially.

```sql
-- Schema migrations are stored as an ordered array in the code:
const MIGRATIONS = [
  { version: 1, description: 'Initial schema', sql: '...' },
  { version: 2, description: 'Add conflict_log table', sql: '...' },
];
```

On every server start:
1. If `warframe.db` doesn't exist, create it and apply all migrations from the start
2. If it exists, check `schema_version` latest, apply any pending migrations

---

## Sync Strategy

### Approach: Per-Record Version Counter (Last-Writer-Wins)

**Why not version vectors?** Single-user app with at most 2–3 devices. Per-record monotonic counters are simpler and sufficient. If multi-user support is ever needed, version vectors can be added later on top of this foundation.

### Version Lifecycle

```
1. Record created:    version = 1 (server assigns)
2. Record updated:    version += 1 (server increments on write)
3. Client reads:      receives record + its `version`
4. Client writes:     sends record data + `clientVersion` (the version it last saw)
5. Server accepts:    if clientVersion >= serverVersion → write succeeds, version++
6. Server rejects:    if clientVersion < serverVersion → conflict, log it, return current server version
```

### New Records Created Offline

When a device creates a record while offline (server unreachable):
- Client generates a UUID-based ID (no server dependency)
- Client assigns `version = 0` (sentinel meaning "new, never seen by server")
- On next sync, client sends the record with `version=0`
- Server accepts (no existing record with that ID), assigns `version = 1`, returns accepted

### Conflict Handling

On conflict (clientVersion < serverVersion):
1. Server logs the conflict to `conflict_log`
2. Server returns HTTP 409 with `{ conflict: true, record_id, server_version, server_data }`
3. Client receives the server's current version of the record
4. Client decides: overwrite with local data (discarding server changes) or accept server version
5. If client chooses to overwrite, it re-sends with `clientVersion = serverVersion` (the version it just received)

For initial implementation, the client automatically accepts server version on conflict (last-writer-wins with server as tiebreaker), surfacing a notification: "X was updated by another device — changes merged."

### Sync Flow Diagram

```
Device A                     Server                     Device B
   |                           |                           |
   |--- GET /api/sync -------->|                           |
   |<-- {loadouts:[{id,v,...}]}|                           |
   |                           |                           |
   |--- PATCH /api/loadouts ---|                           |
   |    {id: "l1", name:"X",   |                           |
   |     clientVersion: 3}     |                           |
   |                           | version 3 == server 3    |
   |                           | -> accept, version++ to 4 |
   |<-- {ok: true, version: 4} |                           |
   |                           |                           |
   |                           |--- GET /api/sync -------->|
   |                           |<-- {loadouts:[{l1,v:4}]} -|
```

### Global Sync Endpoint

A single `POST /api/sync` accepts all domains at once for efficient multi-device sync:

```json
POST /api/sync
{
  "device_id": "device-a",
  "loadouts": [
    { "id": "l1", "name": "...", "data": {...}, "clientVersion": 3 },
    { "id": "l2", "name": "...", "data": {...}, "clientVersion": 0 }  // new
  ],
  "todos": [...],
  "materials_inventory": { "Polymer Bundle": { "quantity": 500, "clientVersion": 2 } }
}
```

Response:
```json
{
  "accepted": {
    "loadouts": ["l1", "l2"],
    "todos": [],
    "materials_inventory": ["Polymer Bundle"]
  },
  "conflicts": {
    "loadouts": [
      { "id": "l3", "serverVersion": 5, "serverData": {...} }
    ],
    "todos": [],
    "materials_inventory": []
  },
  "server_timestamp": "2026-07-07T12:00:00Z"
}
```

---

## API Layer

### Phase 1 (Direct Migration — Maintains Backward Compatibility)

The existing GET/PUT routes remain but their implementation switches from `server-store.ts` to SQLite:

| Route | Method | Current | SQLite Version |
|-------|--------|---------|----------------|
| `/api/loadouts` | GET | `readStore('loadouts', [])` | `SELECT * FROM loadouts` → map rows + parse JSON |
| `/api/loadouts` | PUT | `writeStore('loadouts', body)` | Delete all + reinsert (bulk replace) |
| `/api/todos` | GET | `readStore('todos', [])` | `SELECT * FROM todos ORDER BY updated_at DESC` |
| `/api/todos` | PUT | `writeStore('todos', body)` | Delete all + reinsert (bulk replace) |
| `/api/materials` | GET | `readStore('materials-inventory', {})` | `SELECT * FROM materials_inventory` → map |
| `/api/materials` | PUT | `writeStore('materials-inventory', body)` | Delete all + reinsert (bulk replace) |

Phase 1 PUT still does full-array replacement (same semantics as JSON files) to keep existing client code working. It does NOT increment per-record versions — it replaces the whole dataset.

### Phase 2 (Granular Record API — Enables Multi-Device Sync)

New routes for per-record mutations with version checking:

#### Loadouts

| Route | Method | Description |
|-------|--------|-------------|
| `/api/loadouts` | POST | Create a new loadout. Body: `{name, ...}`. Returns created record with version=1. |
| `/api/loadouts/:id` | GET | Get single loadout by ID |
| `/api/loadouts/:id` | PATCH | Update loadout. Body: `{data, clientVersion}`. Returns updated record or 409 conflict. |
| `/api/loadouts/:id` | DELETE | Delete loadout. Body `{clientVersion}` optional. Deletes with version check. |

#### Todos

| Route | Method | Description |
|-------|--------|-------------|
| `/api/todos` | POST | Create a new todo |
| `/api/todos/:id` | GET | Get single todo by ID |
| `/api/todos/:id` | PATCH | Update todo with version check |
| `/api/todos/:id` | DELETE | Delete todo with version check |

#### Materials Inventory

| Route | Method | Description |
|-------|--------|-------------|
| `/api/materials` | GET | Get all materials inventory (same as Phase 1) |
| `/api/materials` | PATCH | Update a single material. Body: `{material_name, quantity, clientVersion}` |
| `/api/materials/batch` | PATCH | Batch update multiple materials |

#### Sync

| Route | Method | Description |
|-------|--------|-------------|
| `/api/sync` | GET | Returns all data with versions. Query param: `?since=<timestamp>` (optional) |
| `/api/sync` | POST | Accepts batch of upserts, returns accepted + conflicted |

### Data Flow: SQLite Module → API Route → Client

```
app/api/loadouts/route.js
  └─ imports db from src/data/database.ts
      └─ sqliteDb.getAllLoadouts()
          └─ db.prepare('SELECT * FROM loadouts').all()
              └─ SQLite file at DATA_DIR/warframe.db
```

No repository singleton — the `database.ts` module initializes once on server startup and exports a ready-to-use helper object.

---

## Migration Path

### Step 1: Detect Existing JSON Files

On first server startup after the SQLite module is deployed:
1. Check if `data/warframe.db` exists
2. If not, check `data/loadouts.json`, `data/todos.json`, `data/materials-inventory.json`
3. If any exist, run the migration

### Step 2: Read & Transform

```javascript
function migrateFromJsonFiles(db, dataDir) {
  const migrations = [
    { file: 'loadouts.json', table: 'loadouts', transform: row => ({
      id: row.id,
      name: row.name || '',
      data: JSON.stringify(row),     // store full object including slots/requirements/materials
      version: 1,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
    })},
    { file: 'todos.json', table: 'todos', transform: null },   // direct column mapping
    { file: 'materials-inventory.json', table: 'materials_inventory', transform: (obj) => {
      // obj is a flat {materialName: quantity} map
      return Object.entries(obj).map(([name, qty]) => ({
        material_name: name,
        quantity: qty,
        version: 1,
      }));
    }},
  ];

  // For each file: read JSON, transform, insert into SQLite, rename .json to .json.migrated
}
```

### Step 3: Rename Source Files

After successful migration, rename:
- `loadouts.json` → `loadouts.json.migrated`
- `todos.json` → `todos.json.migrated`
- `materials-inventory.json` → `materials-inventory.json.migrated`

This preserves the original data as a backup while clearly marking it as migrated.

### Step 4: Record Migration

Insert a row in `schema_version`:
```sql
INSERT INTO schema_version (version, description)
VALUES (1, 'Initial SQLite schema — migrated from JSON files');
```

### Rollback

If rollback is needed:
1. Rename `*.json.migrated` back to `*.json`
2. Delete or rename `warframe.db`
3. Deploy the previous version

---

## Module Structure

### New Files

```
src/data/
  database.ts          ← New: SQLite initialization, schema setup, migration
  sqlite-loadouts.ts        ← New: Loadout-specific queries (CRUD)
  sqlite-todos.ts           ← New: Todo-specific queries (CRUD)
  sqlite-materials.ts       ← New: Materials-inventory queries (CRUD)
  sqlite-builds.ts          ← New: Build-specific queries (CRUD)
  sqlite-user-items.ts      ← New: User-items queries
  sqlite-sync.js            ← New: Sync endpoint logic (GET/POST)

app/api/loadouts/route.js      ← Modified: uses sqlite-loadouts instead of server-store
app/api/todos/route.js         ← Modified: uses sqlite-todos instead of server-store
app/api/materials/route.js     ← Modified: uses sqlite-materials instead of server-store
app/api/sync/route.js          ← New: sync endpoint

src/data/server-store.ts       ← Deprecated but kept for rollback. Will be removed in a future cleanup task.
```

### Module API Design

**`database.ts`** — Singleton DB initialization

```javascript
/**
 * @returns {{ db: Database, close: () => void }}
 */
export function initDatabase() { ... }

/**
 * Run pending schema migrations.
 */
export function runMigrations(db) { ... }

/**
 * Migrate data from JSON files if present.
 */
export function migrateFromJsonIfNeeded(db) { ... }
```

**`sqlite-loadouts.ts`** — Loadout CRUD

```javascript
export function getAllLoadouts(db) { ... }              // → array of loadout objects
export function getLoadoutById(db, id) { ... }           // → single loadout or null
export function createLoadout(db, { name, data }) { ... } // → created loadout with version
export function updateLoadout(db, id, data, clientVersion) { ... } // → updated or conflict
export function deleteLoadout(db, id, clientVersion) { ... }       // → success or conflict
export function replaceAllLoadouts(db, loadouts) { ... } // → bulk replace (Phase 1 compat)
```

**`sqlite-todos.ts`** — Todo CRUD (same pattern)

**`sqlite-materials.ts`** — Materials inventory CRUD (same pattern)

**`sqlite-sync.js`** — Sync logic

```javascript
export function getSyncData(db, sinceTimestamp) { ... }    // GET /api/sync
export function processSyncBatch(db, batch, deviceId) { ... } // POST /api/sync
```

### Init Sequence on Server Startup

```
Next.js cold start
  └─ import database.ts in layout or global middleware
      └─ initDatabase()
          ├─ Open/create DATA_DIR/warframe.db
          ├─ PRAGMA journal_mode = WAL
          ├─ runMigrations()
          │   └─ Compare schema_version vs MIGRATIONS array
          │   └─ Apply any pending migrations
          ├─ migrateFromJsonIfNeeded()
          │   └─ Check for .json files in DATA_DIR
          │   └─ If found: read, transform, insert, rename
          └─ Export initialized db reference
```

Since Next.js App Router API routes are server-only, this import will never leak to the client bundle. To be safe, use a `server-only` import guard:

```javascript
import 'server-only';
```

---

## Docker & Data Directory

### Current Setup

```yaml
# docker-compose.yml
volumes:
  - ./data:/app/data
```

### SQLite Impact

The SQLite file lives at `DATA_DIR/warframe.db`. `DATA_DIR` defaults to `path.join(process.cwd(), 'data')` which maps to the Docker volume at `/app/data`. This is the same pattern as the current JSON files — **no docker-compose change needed**.

```javascript
// src/data/database.ts
import path from 'node:path';
import 'server-only';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'warframe.db');
```

### WAL Mode & Docker Volumes

SQLite WAL mode works correctly on Docker bind-mounted volumes. The WAL (`-wal`) and shared-memory (`-shm`) files are created alongside the main DB file in the same volume. No additional Docker configuration needed.

### Potential Issues

1. **Node.js Alpine + better-sqlite3 native bindings:** The `node:22-alpine` image needs `build-base` and `python3` to compile the native addon. These are present in the builder stage but must survive to the runner stage.

   **Solution:** Move `better-sqlite3` to `dependencies` (not `devDependencies`) so the compiled `.node` binary is copied into the standalone output. The Dockerfile already does `COPY --from=builder /app/.next/standalone` which includes `node_modules`. Alternatively, use `sql.js` (pure JS, no native compilation) if native addons prove troublesome in the standalone output.

2. **Cold start:** SQLite initialization (migrations, migration from JSON) runs on the first request that triggers the module import. For a cold container, this adds ~200-500ms to the first request. Acceptable for a personal app.

---

## Client-Side Changes

### Minimal Phase 1 Changes

The client code (`repository.js`, `loadout-repository.js`, `sync-helper.js`) continues to use the same GET/PUT endpoints. The API routes change their backing store from JSON files to SQLite but return the same JSON shapes. **No client changes needed for Phase 1.**

### Phase 2 Client Changes (Future Task)

When the granular API is introduced, the client:
1. `sync-helper.js` gains a new `pullFromServerGranular()` that fetches records with versions
2. `pushToServer()` becomes `pushChanges()` that sends only changed records with `clientVersion`
3. `repository.js` stores `version` alongside each record
4. On conflict, the client either auto-accepts server version or shows a notification

These are scoped as future implementation tasks — not part of the current architecture spec.

---

## Edge Cases & States

### Loading State
- First server request after deploy: SQLite init + migration runs inline. API handler adds timing header: `X-Init-Time: 342ms`.
- Subsequent requests: synchronous SQLite queries, sub-10ms for this data volume.

### Empty State
- `GET /api/loadouts` with empty database → returns `[]` (same as current)
- `GET /api/todos` → returns `[]`
- `GET /api/materials` → returns `{}`
- `GET /api/sync` → returns `{loadouts: [], todos: [], materials_inventory: {}, server_timestamp: "..."}`

### Error State
- **SQLite file locked/corrupt:** Returns 500 with `{ error: 'Database error', code: 'DB_ERROR' }`. A corrupt DB is renamed to `warframe.db.corrupt` and a fresh one is created (with automatic re-migration from JSON backups).
- **Disk full:** SQLite throws `SQLITE_FULL`. Caught by the error handler, returns 500.
- **Migration fails mid-way:** Rolled back by SQLite transaction. JSON files remain untouched. Next startup retries the migration.
- **Version conflict (409):** Returns `{ conflict: true, record_id, server_version, server_data }`.

### Race Conditions
- Two rapid-fire PUTs from the same device: Each request is synchronous (SQLite is single-connection), so they serialize naturally. The second PUT sees the version incremented by the first.
- Two devices write to the same record concurrently: Both send with `clientVersion = N`. First request accepted (version → N+1). Second request gets 409 conflict. Conflict logged. No data loss.

### Startup Recovery
- After crash during migration: Migration runs in a transaction. If the process crashes mid-migration, the transaction rolls back. JSON files remain intact. Next start retries.
- After crash during JSON file rename: If migration succeeded but rename failed, the migration step is idempotent — existing records get version=1. Rename is retried.

---

## Task Breakdown

The following implementation tasks should be created:

### Task 1: Install better-sqlite3 + Set up SQLite Module
- **Description:** Add `better-sqlite3` to package.json. Create `src/data/database.ts` with `initDatabase()`, `runMigrations()`, and `migrateFromJsonIfNeeded()`.
- **Files:** `package.json`, `src/data/database.ts`
- **Dependencies:** None (start here)

### Task 2: Loadout CRUD — SQLite Queries
- **Description:** Create `src/data/sqlite-loadouts.ts` with `getAllLoadouts`, `getLoadoutById`, `createLoadout`, `updateLoadout`, `deleteLoadout`, `replaceAllLoadouts`.
- **Files:** `src/data/sqlite-loadouts.ts`
- **Dependencies:** Task 1

### Task 3: Todo CRUD — SQLite Queries
- **Description:** Create `src/data/sqlite-todos.ts` with all CRUD operations for the todos table.
- **Files:** `src/data/sqlite-todos.ts`
- **Dependencies:** Task 1
- **Parallel with:** Task 2

### Task 4: Materials Inventory CRUD — SQLite Queries
- **Description:** Create `src/data/sqlite-materials.ts` with all CRUD operations for the materials_inventory table.
- **Files:** `src/data/sqlite-materials.ts`
- **Dependencies:** Task 1
- **Parallel with:** Tasks 2, 3

### Task 5: Update API Routes to Use SQLite (Phase 1)
- **Description:** Modify `app/api/loadouts/route.js`, `app/api/todos/route.js`, `app/api/materials/route.js` to use the new SQLite CRUD modules instead of `server-store.ts`. Maintain backward-compatible GET/PUT full-array semantics.
- **Files:** `app/api/loadouts/route.js`, `app/api/todos/route.js`, `app/api/materials/route.js`
- **Dependencies:** Tasks 2, 3, 4 (hard)

### Task 6: Create Granular Record API Routes (Phase 2)
- **Description:** Add POST/PATCH/DELETE routes for per-record operations with version checking, plus `app/api/sync/route.js` for the sync endpoint.
- **Files:** `app/api/loadouts/[id]/route.js`, `app/api/todos/[id]/route.js`, `app/api/sync/route.js`, modify materials routes
- **Dependencies:** Task 5 (hard)

### Task 7: Update Client Sync to Use Granular API (Phase 2)
- **Description:** Modify `sync-helper.ts`, `repository.ts`, and `loadout-repository.ts` to use per-record sync with version tracking. Handle 409 conflicts in the UI.
- **Files:** `src/data/sync-helper.ts`, `src/data/repository.ts`, `src/data/loadout-repository.ts`
- **Dependencies:** Task 6 (hard)

### Task 8: Clean Up Deprecated Code
- **Description:** Remove `server-store.ts`. Remove `.json.migrated` files from previous migration runs. Add tests for SQLite modules.
- **Files:** `src/data/server-store.ts` (delete), data test fixtures (clean up)
- **Dependencies:** Task 7 (hard)

---

## Testability

### data-testid Attributes for QA Automation

These are on the client side and are out of scope for the SQLite persistence task. However, the API responses should have consistent structure for test assertions.

### API Response Shapes (for test assertions)

```javascript
// GET /api/loadouts — success
{ status: 200, body: [{ id, name, data, version, created_at, updated_at }, ...] }

// GET /api/loadouts — error
{ status: 500, body: { error: 'Database error', code: 'DB_ERROR' } }

// PATCH /api/loadouts/:id — success
{ status: 200, body: { id, name, data, version: 4, updated_at } }

// PATCH /api/loadouts/:id — conflict
{ status: 409, body: { conflict: true, record_id: 'l1', server_version: 5, server_data: {...} } }

// GET /api/sync
{ status: 200, body: { loadouts: [...], todos: [...], materials_inventory: {...}, server_timestamp: '...' } }

// POST /api/sync
{ status: 200, body: { accepted: { loadouts: [...], todos: [...], materials_inventory: [...] }, conflicts: {...}, server_timestamp: '...' } }
```

### Unit Test Plan

Each SQLite module should have:
1. **create:** Verify record inserted with version=1, timestamps set
2. **read:** Verify record returned with correct fields, empty DB returns empty array/null
3. **update success:** Verify version incremented, data changed, updated_at changed
4. **update conflict:** Verify 409 returned when clientVersion < serverVersion
5. **delete success:** Verify record removed
6. **delete non-existent:** Verify graceful handling
7. **bulk replace (Phase 1):** Verify all old records removed, new ones inserted
8. **migration from JSON:** Verify JSON files read and inserted correctly, JSON files renamed
9. **schema migration:** Verify version tracking and sequential migration application

### Integration Test Plan

1. Start server, hit GET endpoints — verify empty responses
2. Insert data via PUT, verify GET returns it
3. Verify migration by placing JSON files in data dir and restarting
4. Verify conflict detection by manipulating versions directly

---

## Workspace

dir:/home/namal/warframe-todo-tracker
