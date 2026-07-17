# AGENTS.md

This file provides guidance to AI coding agents (Hermes, Claude Code, etc.) working in this repository. For the canonical workflow, issue rules, commit conventions, project board discipline, stop conditions, and validation requirements, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Worktree requirement

**Every change must be made in a fresh worktree created from `origin/main`.** Do not edit files directly in the main checkout, and do not branch from local `main` — it can be stale. Start every issue with `git fetch origin` and branch from `origin/main`, not whatever the local checkout happens to be tracking. Create the worktree at `./worktrees/<branch-name>`, make your changes there, and clean it up after the PR is merged. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the exact sequence.

## Project

Warframe TODO Tracker — a Next.js 14 App Router app for tracking Warframe craftable items, materials, mods, loadouts, and crafting progress. Single developer (NamalD on GitHub), deployed via Docker on a VPS at warframe.namal.dev.

- **Runtime**: Node.js, Next.js 14 (App Router)
- **Package manager**: Yarn 4 (PnP locally; Docker builds use the `node-modules` linker)
- **Language**: JavaScript/JSX (UI under `app/`), TypeScript (data layer under `src/data/` and tests)
- **Database**: SQLite via `better-sqlite3` (`data/warframe.db`)
- **Game data**: `@wfcd/items` npm package, flattened by prebuild into static JSON
- **Testing**: Vitest (unit), Playwright (e2e), custom test-pack runner (`npm test`)
- **Deployment**: Docker on VPS, auto-deploys via GitHub Actions (build → GHCR → VPS pull & restart)
- **GitHub Project**: owner=`NamalD`, project=`Warframe Item Tracker`, number=`4`, project ID=`PVT_kwHOACqRis4Bc2Fb`
  - Status field ID: `PVTSSF_lAHOACqRis4Bc2FbzhXb60w`
  - Status option IDs: Todo=`f75ad846`, In Progress=`47fc9ee4`, Done=`98236657`

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

## Architecture

### Two data domains, kept deliberately separate

1. **Read-only reference data** (items, materials, mods, crafting-tree relationships) — sourced from `@wfcd/items`, flattened by `scripts/prebuild.mjs` into static JSON under `public/data/`, fetched client-side and cached in `localStorage`. Never touches SQLite.
2. **User-generated data** (todos, loadouts, material inventory) — persisted server-side in SQLite (`data/warframe.db`) and synced to/from the browser.

### Client repository pattern (per user-data domain)

Each user-data domain follows the same shape — a `'use client'` singleton class in `src/data/`:

- `repository.ts` → `store.ts` (todos + material inventory + reference-item cache)
- `loadout-repository.ts` → `loadout-store.ts`
- `mod-repository.ts` → `mod-store.ts`
- `build-repository.ts` → `build-store.ts`

Each repository: reads/writes an in-memory copy backed by `localStorage`, exposes CRUD methods to pages/components, and pushes changes to the matching `/api/*` route via `sync-helper.ts`. Pages import the singleton instance from the `*-store.ts` file, not the repository class directly.

### Server persistence: SQLite with version-vector sync

- `src/data/database.ts` — `getDb()`/`closeDb()` singleton over `better-sqlite3`, schema migrations (`MIGRATIONS` array), and a one-shot `migrateFromJson()` that upgrades legacy JSON-file installs to SQLite on first run. This module is server-only (`import 'server-only'`) — never import it from client components.
- `src/data/server-store.ts`, `sqlite-loadouts.ts`, `sqlite-todos.ts`, `sqlite-materials.ts`, `sqlite-builds.ts`, `sqlite-user-items.ts` — table-specific read/write helpers used by `app/api/*` route handlers.
- Every record has a `version` column. Client writes carry a `clientVersion`; the server rejects (409) writes where `clientVersion` is behind the stored version. `app/api/sync/route.js` is the batch multi-device sync endpoint.
- `src/data/sync-helper.ts` implements the client side of this protocol: per-URL version tracking in `localStorage`, retry-with-merge on 409.
- The SQLite file lives at `DATA_DIR/warframe.db` (`DATA_DIR` env var, defaults to `./data`). Docker mounts `./data:/app/data`.

### Route/component structure

Next.js App Router under `app/`, one directory per feature (`items`, `mods`, `loadouts`, `builds`, `todos`, `shopping-list`, `sources`), each with a `page.jsx` and, where needed, a `[id]/page.jsx` detail route. `app/api/*/route.js` are the corresponding Route Handlers. Shared client components live in `app/components/`; feature-local client components sit next to their page.

## Build-time data generation

`scripts/prebuild.mjs` reads `@wfcd/items` and writes `public/data/wfcd-cache.json` (items/materials/tree relationships) and `public/data/mods-cache.json` (mods). The client fetches these JSON files at runtime and caches them in `localStorage`, keyed by the `@wfcd/items` package version. Run `node scripts/prebuild.mjs` manually after changing the prebuild script or before testing data-dependent pages if the cache files are stale/missing.

## Testing

- **Unit tests** (`tests/unit/`) — Vitest with jsdom. Test repository logic, store behavior, data transformations. Fast, no server needed.
- **E2E tests** (`tests/`) — Playwright. Page-level tests that boot their own dev server.
- **Test pack** (`tests/test-pack.mjs`) — `npm test` runs phases in sequence: asset existence checks, unit tests, browser smoke tests (skipped if app not running).
- **Prebuild schema test** (`tests/unit/prebuild-schema.test.js`) — verifies committed cache matches fresh prebuild output and schema version is consistent.

When writing tests:
- Use `page.route()` interceptors for all API calls in e2e tests to isolate from the shared dev DB (see `tests/todos.spec.ts` for the pattern)
- Register dialog listeners before the action that triggers them
- Use `getByPlaceholder()` for autocomplete inputs, `getByText(label, { exact: true })` for dropdown options
- Regex routes (`/\/api\/resource/`) are more reliable than glob patterns for API interception

## Known gotchas

- `app/loadouts/[id]/requirement-combobox.jsx` uses a `justSelectedRef` guard to stop the dropdown from reopening immediately after a selection (blur/focus race) — preserve this guard if touching combobox
- **Resolved as of vite@8.1.3 / vitest@4.1.10 (2026-07-13)**: the Oxc parser bug that previously broke `import type` and typed instance fields under Vitest no longer reproduces — verified directly (real TS class with typed fields + `import type`, ran clean under both `vitest run` and `tsc --noEmit`). New files in `src/data/` should be written as real TypeScript (no `@ts-nocheck`); migrate an existing `@ts-nocheck`/JSDoc file to real TS when you're already substantially editing it for other reasons, rather than as a standalone pass. See `docs/solutions/nextjs/ts-migration-oxc-workaround.md` for the original bug and current status.
- `next.config.js` marks `@wfcd/items` as a webpack external and loads it via dynamic `import()` at runtime — don't let it get bundled into client JS (it's tens of MB of JSON).
- Docker builds may miss `public/data/*.json` if the Dockerfile doesn't explicitly copy `public/` — the test-pack's asset-check phase catches this.
- **Docker builds can corrupt host node_modules** if `.dockerignore` doesn't exclude `node_modules/`, `.yarn/cache/`, and `.yarn/unplugged/`. Docker `COPY . .` copies the build context which may include root-owned files from past broken builds. Fix: harden `.dockerignore` with standard Next.js entries, then clean existing corruption with `docker run --rm -v "$(pwd)":/app -w /app alpine:latest sh -c "chown -R $(id -u):$(id -g) node_modules"` (no sudo needed).
- **Always use `yarn vitest run`, not `npm run test:unit`** — Hermes' own Vite installation can shadow vitest dependencies when run through npm/npx. Yarn PnP resolution is the project's canonical module resolution path and avoids this entirely.
- **PNP peer dependencies must be explicit** — Yarn PnP is strict about peer deps. If `@testing-library/react` warns about `@testing-library/dom`, add it to `devDependencies`. The test will fail at import (0 tests run) rather than with an assertion error, making this easy to spot.
- **NEVER change repo visibility or do destructive GitHub ops without explicit sign-off** — making a repo public, force-pushing, deleting branches, etc. requires the user's explicit written approval in the active conversation. The `clarify` tool timing out or the user going AFK is NOT consent.
- **LoadoutRepository requires `await repo.init()` before `getLoadouts()`** — the constructor creates an empty state; data loads asynchronously via `init()` which fetches from the server (with localStorage migration as fallback). Unit tests that bypass `init()` will see empty arrays.
- **Component tests need all `useEffect` init methods mocked** — if a component test hangs (timeout >1s), the component is calling an async method that's not mocked. Check the component's `useEffect` for `initTodos()`, `initMaterials()`, `init()`, etc. and add them to the mock. The `waitFor` will hang forever on unresolved promises.
- **Server-side globals in jsdom tests** — if server modules reference `device` or `device_id` (for conflict logging), add `(globalThis as any).device = 'test-device'` and `(globalThis as any).device_id = 'test-device-id'` to `tests/unit/setup.ts`. These variables exist in browser/server context but not in jsdom.
- **`ask_user` schema must use `title`, not `label`** — when calling the `ask_user` tool, each option object must have a `title` property. Weaker/free-tier models often pass `label` or a plain string, which fails validation. If the call errors with `options.0: must be object` or `options.0.title: must have required properties title`, retry with `options: [{title: "Yes", description: "..."}]`.
- The `DATA_DIR` env var controls where SQLite lives. Docker mounts `./data:/app/data` so the DB survives container recreation.
- **Multi-filter boolean logic is fragile.** When a component has 3+ filter conditions (tracked-only, search, categories) and two separate empty-state messages, the compound boolean checks are easy to break. Always write a test for every empty-state combination — the reviewer will catch regressions.
- **Filter chain order is intentionally consistent across pages**: Search → multi-select filters (pills/dropdowns) → boolean toggle. The visual grouping may differ (mods places the boolean toggle inline with pills to save vertical space on a denser filter bar) but the logical chain is the same on every page.
- **E2e assertions must verify content, not just count.** A `count > 0` or `count < allCount` assertion passes even when the filter is completely broken (showing wrong items). Verify specific content: badge classes, item names, or exclude specific unselected categories.

## Legacy/historical docs

- `docs/migration-plan.md` — past Vite→Next.js migration (complete, ignore proposed file layout)
- `docs/wfcd-integration.md` — design doc for `@wfcd/items` integration
- `docs/plans/sqlite-architecture.md` — design doc for SQLite persistence layer
- `docs/schema.md` — conceptual data model (storage-agnostic); actual DDL is in `src/data/database.ts`

These docs explain *why* the data layer is shaped this way, but the code is the source of truth for current behavior.

## Compound Engineering

This project follows the compound engineering loop: **Brainstorm → Plan → Work → Review → Compound → Repeat**. All CE skills are installed as Pi skills and can be invoked directly.

### CE skill invocation

**`ce-lite` is a Pi skill, not a subagent.** It is a lightweight router that selects the right CE skill for the task. To use it:

1. Read `~/.pi/agent/skills/ce-lite/SKILL.md` (or the project-local copy under `.pi/skills/`).
2. Match the user's intent to the routing table inside that file.
3. Read the matched skill's `SKILL.md` and follow its instructions.

**Do not use the `subagent` tool for CE skills.** Skills are loaded into the current agent's context by reading their `SKILL.md`; subagents are separate agent runtimes. The CE plugin installs skills only — there are no CE subagents.

### Available CE skills

| Skill | Purpose |
|-------|---------|
| `ce-lite` | Router skill — matches intent to the right CE skill without loading all 21 descriptions |
| `ce-brainstorm` | Explore vague or ambitious ideas into a right-sized requirements-only unified plan |
| `ce-plan` | Create structured plans for multi-step work from requirements |
| `ce-work` | Execute a plan or concrete work prompt end-to-end |
| `ce-code-review` | Structured code review for bugs, regressions, tests, and standards |
| `ce-compound` | Document a recently solved problem or durable project vocabulary |
| `ce-compound-refresh` | Refresh docs/solutions learnings against the current codebase |
| `ce-commit` | Create a git commit with a clear, value-communicating message |
| `ce-commit-push-pr` | Commit, push, and open a PR (canonical shipping workflow) |
| `ce-debug` | Diagnosis loop for bugs and failing behavior |
| `ce-doc-review` | Review requirements, plans, or specs with role-specific lenses |
| `ce-explain` | Turn a concept, diff, or idea into a dense, visual explainer |
| `ce-ideate` | Generate and evaluate grounded ideas |
| `ce-optimize` | Run metric-driven optimization loops |
| `ce-pov` | Give a decisive, project-grounded verdict on an external input |
| `ce-proof` | Publish, read, comment on, or edit markdown in Proof |
| `ce-resolve-pr-feedback` | Resolve PR review feedback |
| `ce-riffrec-feedback-analysis` | Analyze Riffrec feedback captures from bundles or standalone recordings |
| `ce-simplify-code` | Simplify recently changed code for clarity, reuse, quality, and efficiency while preserving behavior |
| `ce-strategy` | Create or update STRATEGY.md |
| `ce-test-browser` | Run browser tests for pages affected by the current branch or PR |
| `ce-worktree` | Set up isolated git worktrees for parallel work |

### Directory structure for CE artifacts

```
docs/
├── brainstorms/       # ce-brainstorm output
├── solutions/         # Captured learnings, categorized by problem type
├── plans/             # Implementation plans
├── designs/           # Design proposals (existing)
└── ...                # Historical docs (existing)
```

Deferred work items (review findings, future improvements) go on the GitHub Project board, not in local files.
