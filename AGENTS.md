# AGENTS.md

This file provides guidance to AI coding agents (Hermes, Claude Code, etc.) working in this repository. It is the single source of truth for project context, patterns, and conventions.

## Project

Warframe TODO Tracker — a Next.js 14 App Router app for tracking Warframe craftable items, materials, mods, loadouts, and crafting progress. Single developer (NamalD on GitHub), deployed via Docker at warframe.namal.dev.

- **Runtime**: Node.js, Next.js 14 (App Router)
- **Package manager**: Yarn 4 (PnP)
- **Language**: JavaScript/JSX (app code), TypeScript (tests only)
- **Database**: SQLite via `better-sqlite3` (`data/warframe.db`)
- **Game data**: `@wfcd/items` npm package, flattened by prebuild into static JSON
- **Testing**: Vitest (unit), Playwright (e2e), custom test-pack runner (`npm test`)
- **Deployment**: Docker Compose, auto-deploys on issue-close via GitHub webhook

## Commands

```bash
npm run dev                  # start Next.js dev server (localhost:3000)
npm run build                # production build
npm run start                # run production build

npm run test:unit            # vitest unit/component tests (jsdom)
npm run test:unit:watch      # vitest watch mode
npm run test:unit:coverage   # vitest with coverage
npx vitest run tests/unit/repository.test.js   # run a single unit test file

npm run test:e2e             # Playwright e2e tests (auto-starts `next dev -p 3001`)
npm run test:e2e:ui          # Playwright UI mode
npx playwright test tests/todos.spec.ts        # run a single e2e spec

npm test                     # tests/test-pack.mjs — runs everything in sequence
```

Playwright e2e tests boot their own dev server on port 3001 (`BASE_URL` overrides) and reuse an already-running server outside CI.

## Commit conventions

**Every commit must reference a GitHub issue** using one of these keywords in the subject line or body: `Closes #N`, `Fixes #N`, or `Resolves #N`. Merge commits are exempt.

A GitHub Actions workflow (`.github/workflows/commit-check.yml`) enforces this on every push. This ensures all work links to a tracked issue and the auto-deploy hook fires on issue-closing commits.

Format:
```
[Tag] Short description (#issue-number)

- Bullet points of what was done

Closes #N
```

If the work doesn't have an existing issue, create one first with `gh issue create` before committing.

## Git workflow

Commit and push to `origin` as you complete work. Do not ask before pushing — this is standing authorization. Author: `NamalD` on GitHub, `namald@users.noreply.github.com`.

## Architecture

### Two data domains, kept deliberately separate

1. **Read-only reference data** (items, materials, mods, crafting-tree relationships) — sourced from `@wfcd/items`, flattened by `scripts/prebuild.mjs` into static JSON under `public/data/`, fetched client-side and cached in `localStorage`. Never touches SQLite.
2. **User-generated data** (todos, loadouts, material inventory) — persisted server-side in SQLite (`data/warframe.db`) and synced to/from the browser.

### Client repository pattern (per user-data domain)

Each user-data domain follows the same shape — a `'use client'` singleton class in `src/data/`:

- `repository.js` → `store.js` (todos + material inventory + reference-item cache)
- `loadout-repository.js` → `loadout-store.js`
- `mod-repository.js` → `mod-store.js`
- `build-repository.js` → `build-store.js`

Each repository: reads/writes an in-memory copy backed by `localStorage`, exposes CRUD methods to pages/components, and pushes changes to the matching `/api/*` route via `sync-helper.js`. Pages import the singleton instance from the `*-store.js` file, not the repository class directly.

### Server persistence: SQLite with version-vector sync

- `src/data/database.js` — `getDb()`/`closeDb()` singleton over `better-sqlite3`, schema migrations (`MIGRATIONS` array), and a one-shot `migrateFromJson()` that upgrades legacy JSON-file installs to SQLite on first run. This module is server-only (`import 'server-only'`) — never import it from client components.
- `src/data/server-store.js`, `sqlite-loadouts.js`, `sqlite-todos.js`, `sqlite-materials.js` — table-specific read/write helpers used by `app/api/*` route handlers.
- Every record has a `version` column. Client writes carry a `clientVersion`; the server rejects (409) writes where `clientVersion` is behind the stored version. `app/api/sync/route.js` is the batch multi-device sync endpoint.
- `src/data/sync-helper.js` implements the client side of this protocol: per-URL version tracking in `localStorage`, retry-with-merge on 409.
- The SQLite file lives at `DATA_DIR/warframe.db` (`DATA_DIR` env var, defaults to `./data`). Docker mounts `./data:/app/data`.

### Route/component structure

Next.js App Router under `app/`, one directory per feature (`items`, `mods`, `loadouts`, `builds`, `todos`, `shopping-list`, `sources`), each with a `page.jsx` and, where needed, a `[id]/page.jsx` detail route. `app/api/*/route.js` are the corresponding Route Handlers. Shared client components live in `app/components/`; feature-local client components sit next to their page.

## Build-time data generation

`scripts/prebuild.mjs` reads `@wfcd/items` and writes `public/data/wfcd-cache.json` (items/materials/tree relationships) and `public/data/mods-cache.json` (mods). The client fetches these JSON files at runtime and caches them in `localStorage`, keyed by the `@wfcd/items` package version. Run `node scripts/prebuild.mjs` manually after changing the prebuild script or before testing data-dependent pages if the cache files are stale/missing.

## Testing

- **Unit tests** (`tests/unit/`) — Vitest with jsdom. Test repository logic, store behavior, data transformations. Fast, no server needed.
- **E2e tests** (`tests/`) — Playwright. Page-level tests that boot their own dev server.
- **Test pack** (`tests/test-pack.mjs`) — `npm test` runs phases in sequence: asset existence checks, unit tests, browser smoke tests (skipped if app not running).
- **Prebuild schema test** (`tests/unit/prebuild-schema.test.js`) — verifies committed cache matches fresh prebuild output and schema version is consistent.

When writing tests:
- Use `page.route()` interceptors for all API calls in e2e tests to isolate from the shared dev DB (see `tests/todos.spec.ts` for the pattern)
- Register dialog listeners before the action that triggers them
- Use `getByPlaceholder()` for autocomplete inputs, `getByText(label, { exact: true })` for dropdown options
- Regex routes (`/\/api\/resource/`) are more reliable than glob patterns for API interception

## Known gotchas

- `app/loadouts/[id]/requirement-combobox.jsx` uses a `justSelectedRef` guard to stop the dropdown from reopening immediately after a selection (blur/focus race) — preserve this guard if touching combobox focus handling.
- `next.config.js` marks `@wfcd/items` as a webpack external and loads it via dynamic `import()` at runtime — don't let it get bundled into client JS (it's tens of MB of JSON).
- Docker builds may miss `public/data/*.json` if the Dockerfile doesn't explicitly copy `public/` — the test-pack's asset-check phase catches this.
- The `DATA_DIR` env var controls where SQLite lives. Docker mounts `./data:/app/data` so the DB survives container recreation.

## Legacy/historical docs

- `docs/migration-plan.md` — past Vite→Next.js migration (complete, ignore proposed file layout)
- `docs/wfcd-integration.md` — design doc for `@wfcd/items` integration
- `docs/plans/sqlite-architecture.md` — design doc for SQLite persistence layer
- `docs/schema.md` — conceptual data model (storage-agnostic); actual DDL is in `src/data/database.js`

These docs explain *why* the data layer is shaped this way, but the code is the source of truth for current behavior.

## Compound Engineering

This project follows the compound engineering loop: Plan → Work → Review → Compound → Repeat.

### Directory structure for CE artifacts

```
docs/
├── brainstorms/       # /workflows:brainstorm output
├── solutions/         # Captured learnings, categorized by problem type
├── plans/             # Implementation plans
├── designs/           # Design proposals (existing)
└── ...                # Historical docs (existing)
todos/                 # Triage and review findings
```

### Workflow

1. **Plan** — use `ce-plan` skill: research codebase + external docs, produce implementation plan in `docs/plans/`
2. **Work** — use `ce-work` skill: execute the plan step by step, run validations after each change
3. **Review** — use `ce-review` skill: spawn parallel reviewer subagents, prioritize findings (P0-P3), fix issues
4. **Compound** — use `ce-compound` skill: capture what worked/didn't, update AGENTS.md patterns, create solution docs

Every completed unit of work should end with the compound step — this is what makes the system get smarter over time.
