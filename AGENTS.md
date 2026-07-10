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
yarn dev                      # start Next.js dev server (localhost:3000)
yarn build                    # production build
yarn start                    # run production build

yarn test:unit                # vitest unit/component tests (jsdom)
yarn test:unit:watch          # vitest watch mode
yarn test:unit:coverage       # vitest with coverage
yarn vitest run tests/unit/repository.test.js   # run a single unit test file

yarn test:e2e                 # Playwright e2e tests (auto-starts `next dev -p 3001`)
yarn test:e2e:ui              # Playwright UI mode
yarn playwright test tests/todos.spec.ts        # run a single e2e spec

yarn test                     # tests/test-pack.mjs — runs everything in sequence
```

Playwright e2e tests boot their own dev server on port 3001 (`BASE_URL` overrides) and reuse an already-running server outside CI.

## Commit conventions

**Every feature/bug-fix commit must reference a GitHub issue** using one of these keywords in the body: `Closes #N`, `Fixes #N`, or `Resolves #N`. This ensures the auto-deploy hook fires on issue-closing commits.

Process commits (`[Process]`, `[Compound]`, `[Review]`) are exempt — they don't close issues and don't need a reference.

Format:
```
[Tag] Short description (#issue-number)

- Bullet points of what was done

Closes #N
```

If the work doesn't have an existing issue, create one first with `gh issue create` before committing.

## Project board discipline

The GitHub Project board is the source of truth for what's being worked on. Every issue on the board must have its status column match reality.

- When picking up an issue, move it from **Todo → In Progress** before writing any code
- When committing code that closes an issue, use `Closes #N` — the git hook auto-moves the card to **Done** on merge to main
- After every commit or push, verify the board state matches reality
- If an open issue exists but isn't on the project board, add it (Todo or In Progress as appropriate)

## Git workflow

All changes go through **pull requests** — never push directly to `main`. `main` is protected: the `Test Suite` CI check must pass before merging.

1. Create a feature branch: `git checkout -b feat/short-description`
2. Commit and push changes to the branch
3. Create a PR: `gh pr create --fill`
4. Enable auto-merge: `gh pr merge --auto --squash --delete-branch`
5. CI runs; when "Test Suite" passes, GitHub auto-merges and deploys

The Docker auto-deploy hook fires on push to `main` (after merge). Author: `NamalD` on GitHub, `namald@users.noreply.github.com`.

**CI gating**: Every PR runs `yarn vitest run` via `.github/workflows/test.yml`. The "Test Suite" status check is required — GitHub blocks the merge button until it passes. This is the deterministic gate ensuring no broken tests land on `main`.

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
- **Docker builds can corrupt host node_modules** if `.dockerignore` doesn't exclude `node_modules/`, `.yarn/cache/`, and `.yarn/unplugged/`. Docker `COPY . .` copies the build context which may include root-owned files from past broken builds. Fix: harden `.dockerignore` with standard Next.js entries, then clean existing corruption with `docker run --rm -v "$(pwd)":/app -w /app alpine:latest sh -c "chown -R $(id -u):$(id -g) node_modules"` (no sudo needed).
- **Always use `yarn vitest run`, not `npm run test:unit`** — Hermes' own Vite installation can shadow vitest dependencies when run through npm/npx. Yarn PnP resolution is the project's canonical module resolution path and avoids this entirely.
- **PNP peer dependencies must be explicit** — Yarn PnP is strict about peer deps. If `@testing-library/react` warns about `@testing-library/dom`, add it to `devDependencies`. The test will fail at import (0 tests run) rather than with an assertion error, making this easy to spot.
- **NEVER change repo visibility or do destructive GitHub ops without explicit sign-off** — making a repo public, force-pushing, deleting branches, etc. requires the user's explicit written approval in the active conversation. The `clarify` tool timing out or the user going AFK is NOT consent.
- **LoadoutRepository requires `await repo.init()` before `getLoadouts()`** — the constructor creates an empty state; data loads asynchronously via `init()` which fetches from the server (with localStorage migration as fallback). Unit tests that bypass `init()` will see empty arrays.
- **Component tests need all `useEffect` init methods mocked** — if a component test hangs (timeout >1s), the component is calling an async method that's not mocked. Check the component's `useEffect` for `initTodos()`, `initMaterials()`, `init()`, etc. and add them to the mock. The `waitFor` will hang forever on unresolved promises.
- **Server-side globals in jsdom tests** — if server modules reference `device` or `device_id` (for conflict logging), add `(globalThis as any).device = 'test-device'` and `(globalThis as any).device_id = 'test-device-id'` to `tests/unit/setup.ts`. These variables exist in browser/server context but not in jsdom.
- The `DATA_DIR` env var controls where SQLite lives. Docker mounts `./data:/app/data` so the DB survives container recreation.
- **Multi-filter boolean logic is fragile.** When a component has 3+ filter conditions (tracked-only, search, categories) and two separate empty-state messages, the compound boolean checks are easy to break. Always write a test for every empty-state combination — the reviewer will catch regressions.
- **Filter chain order is intentionally consistent across pages**: Search → multi-select filters (pills/dropdowns) → boolean toggle. The visual grouping may differ (mods places the boolean toggle inline with pills to save vertical space on a denser filter bar) but the logical chain is the same on every page.
- **E2e assertions must verify content, not just count.** A `count > 0` or `count < allCount` assertion passes even when the filter is completely broken (showing wrong items). Verify specific content: badge classes, item names, or exclude specific unselected categories.

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
```

Deferred work items (review findings, future improvements) go on the GitHub Project board, not in local files.

### Workflow

1. **Plan** — use `ce-plan` skill: research codebase + external docs, produce implementation plan in `docs/plans/`
2. **Work** — use `ce-work` skill: execute the plan step by step, run validations after each change
3. **Review** — use `ce-review` skill: spawn parallel reviewer subagents, prioritize findings (P0-P3), fix issues
4. **Compound** — use `ce-compound` skill: capture what worked/didn't, update AGENTS.md patterns, create solution docs

Every completed unit of work should end with the compound step — this is what makes the system get smarter over time.
