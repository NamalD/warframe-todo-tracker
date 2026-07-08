# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Warframe TODO Tracker — a Next.js 14 App Router app for tracking Warframe craftable items, materials, mods, loadouts, and crafting progress. Reference game data comes from the `@wfcd/items` npm package; user data (todos, loadouts, material inventory) is persisted server-side in SQLite and synced to the browser.

## Commands

```bash
npm run dev                  # start Next.js dev server (localhost:3000)
npm run build                # production build (also see prebuild step below)
npm run start                # run production build

npm run test:unit            # vitest unit/component tests (jsdom)
npm run test:unit:watch      # vitest watch mode
npm run test:unit:coverage   # vitest with coverage
npx vitest run tests/unit/repository.test.js   # run a single unit test file
npx vitest run -t "test name"                  # run tests matching a name

npm run test:e2e             # Playwright e2e tests (auto-starts `next dev -p 3001`)
npm run test:e2e:ui          # Playwright UI mode
npx playwright test tests/todos.spec.ts        # run a single e2e spec

npm test                     # tests/test-pack.mjs — custom test-pack runner (distinct from vitest/playwright)
```

Playwright e2e tests boot their own dev server on port 3001 (`BASE_URL` overrides this) and reuse an already-running server outside CI.

## Git workflow

Commit and push to `origin` as you complete work — see `CONTRIBUTING.md`. This is standing authorization: don't ask before pushing to this repo.

### Build-time data generation

`scripts/prebuild.mjs` reads the `@wfcd/items` package and writes `public/data/wfcd-cache.json` (items/materials/tree relationships) and `public/data/mods-cache.json` (mods). The client `Repository`/mod store classes fetch these JSON files at runtime and cache them in `localStorage`, keyed by the `@wfcd/items` package version — bump the dependency and regenerate to pick up new game data. Run this manually after changing `scripts/prebuild.mjs` or before testing data-dependent pages if `public/data/*.json` is stale/missing.

## Architecture

### Two data domains, kept deliberately separate

1. **Read-only reference data** (items, materials, mods, crafting-tree relationships) — sourced from `@wfcd/items`, flattened by `scripts/prebuild.mjs` into static JSON under `public/data/`, fetched client-side and cached in `localStorage`. Never touches SQLite.
2. **User-generated data** (todos, loadouts, material inventory) — persisted server-side in SQLite (`data/warframe.db`) and synced to/from the browser. This is the domain that needs careful version handling (see below).

### Client repository pattern (per user-data domain)

Each user-data domain follows the same shape — a `'use client'` singleton class in `src/data/`:

- `repository.js` → `store.js` (todos + material inventory + reference-item cache)
- `loadout-repository.js` → `loadout-store.js`
- `mod-repository.js` → `mod-store.js`
- `build-repository.js` → `build-store.js`

Each repository: reads/writes an in-memory copy backed by `localStorage`, exposes CRUD methods to pages/components, and pushes changes to the matching `/api/*` route via `sync-helper.js`. Pages import the singleton instance from the `*-store.js` file, not the repository class directly.

### Server persistence: SQLite with version-vector sync

- `src/data/database.js` — `getDb()`/`closeDb()` singleton over `better-sqlite3`, schema migrations (`MIGRATIONS` array), and a one-shot `migrateFromJson()` that upgrades legacy JSON-file installs to SQLite on first run (renames old files to `*.migrated`). This module is server-only (`import 'server-only'`) — never import it from client components.
- `src/data/server-store.js`, `sqlite-loadouts.js`, `sqlite-todos.js`, `sqlite-materials.js` — table-specific read/write helpers used by the `app/api/*` route handlers.
- Every record has a `version` column. Client writes carry a `clientVersion`; the server rejects (409/conflict entry) writes where `clientVersion` is behind the stored version, and `conflict_log` records what happened. `app/api/sync/route.js` is the batch multi-device sync endpoint (`GET ?since=` for incremental pull, `POST` for batch push with per-record conflict resolution); domain-specific routes (`app/api/todos`, `app/api/loadouts`, `app/api/materials`) exist for simpler single-domain reads/writes.
- `src/data/sync-helper.js` implements the client side of this protocol: per-URL version tracking in `localStorage` (`v:<url>` keys), retry-with-merge on 409.
- The SQLite file lives at `DATA_DIR/warframe.db` (`DATA_DIR` env var, defaults to `./data`). Docker mounts `./data:/app/data` (see `docker-compose.yml`) so the DB survives container recreation.

### Route/component structure

Next.js App Router under `app/`, one directory per feature (`items`, `mods`, `loadouts`, `builds`, `todos`, `shopping-list`, `sources`), each with a `page.jsx` and, where needed, a `[id]/page.jsx` detail route. `app/api/*/route.js` are the corresponding Route Handlers. Shared client components live in `app/components/`; feature-local client components (e.g. `app/loadouts/[id]/requirement-combobox.jsx`) sit next to the page that uses them. Everything under `app/` and `src/` is JSX/JS (no TypeScript in app code — tests use `.ts`/`.tsx`).

### Legacy/historical docs

`docs/migration-plan.md` documents a past Vite→Next.js migration (already complete — ignore its proposed file layout, e.g. `lib/`, `app/*.tsx`, which was superseded by the current `app/`/`src/data` structure). `docs/wfcd-integration.md` and `.hermes/plans/sqlite-architecture.md` are design docs for the `@wfcd/items` integration and the SQLite persistence layer respectively — useful for *why* the data layer is shaped this way, but the code is the source of truth for current behavior. `docs/schema.md` describes the conceptual data model (storage-agnostic); the actual SQLite DDL is in `src/data/database.js`.

## Known gotchas

- `app/loadouts/[id]/requirement-combobox.jsx` uses a `justSelectedRef` guard to stop the dropdown from reopening immediately after a selection (blur/focus race) — preserve this guard if touching combobox focus handling.
- `next.config.js` marks `@wfcd/items` as a webpack external and loads it via dynamic `import()` at runtime (both in `scripts/prebuild.mjs` and any server code) — don't let it get bundled into client JS, it's tens of MB of JSON.
