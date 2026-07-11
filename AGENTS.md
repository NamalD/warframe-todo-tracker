# AGENTS.md

This file provides guidance to AI coding agents (Hermes, Claude Code, etc.) working in this repository. It is the single source of truth for project context, patterns, and conventions.

## Project

Warframe TODO Tracker — a Next.js 14 App Router app for tracking Warframe craftable items, materials, mods, loadouts, and crafting progress. Single developer (NamalD on GitHub), deployed via Docker on a VPS at warframe.namal.dev.

- **Runtime**: Node.js, Next.js 14 (App Router)
- **Package manager**: Yarn 4 (PnP)
- **Language**: JavaScript/JSX (app code), TypeScript (tests only)
- **Database**: SQLite via `better-sqlite3` (`data/warframe.db`)
- **Game data**: `@wfcd/items` npm package, flattened by prebuild into static JSON
- **Testing**: Vitest (unit), Playwright (e2e), custom test-pack runner (`npm test`)
- **Deployment**: Docker on VPS, auto-deploys via GitHub Actions (build → GHCR → VPS pull & restart)

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

## Deployment

The app is deployed to a VPS via Docker Compose using pull-based deploys — CI never connects to the VPS:

1. Test Suite runs on every PR and push to main
2. On test pass on main, the "Deploy" workflow builds the Docker image and pushes it to GHCR (`ghcr.io/namald/warframe-todo-tracker:latest`)
3. Watchtower (a service in `docker-compose.yml`) polls GHCR every 60s from the VPS, restarts the app container when the image changes, and prunes the old image

No repository secrets are needed for deployment — the workflow pushes to GHCR with the built-in `GITHUB_TOKEN`. App secrets live on the VPS in a `.env` file next to `docker-compose.yml`, which Docker Compose reads automatically:

| `.env` variable | Description |
|--------|-------------|
| `PASSWORD` | Warframe Tracker password (passed to container) |
| `SESSION_SECRET` | Random string for HMAC session signing |

### Setting up the VPS (one-time)

1. Install Docker and add your user to the `docker` group
2. Clone the repo: `git clone https://github.com/NamalD/warframe-todo-tracker ~/warframe-todo-tracker`
3. Create `~/warframe-todo-tracker/.env` containing `PASSWORD=...` and `SESSION_SECRET=...`
4. Authenticate to GHCR so the private image can be pulled: `docker login ghcr.io -u namald` with a personal access token that has `read:packages` (skip and remove the `config.json` mount from the watchtower service if the package is public)
5. Start everything: `docker compose up -d`

Image updates are fully automatic from then on. Changes to `docker-compose.yml` itself are the one thing that still needs a manual `git pull && docker compose up -d` on the VPS.

## Commit conventions

**Every feature/bug-fix commit must reference a GitHub issue** using one of these keywords in the body: `Closes #N`, `Fixes #N`, or `Resolves #N`. This ensures the Project board card auto-moves to Done on merge.

Process commits (`[Process]`, `[Compound]`, `[Review]`) are exempt — they don't close issues and don't need a reference.

Format:
```
[Tag] Short description (#issue-number)

- Bullet points of what was done

Closes #N
```

If the work doesn't have an existing issue, create one first with `gh issue create` before committing.

**For new features or bugs discovered during work:** Always create a new issue on the project board before starting work. This ensures:
- The work is tracked on the board (Todo column)
- Priority and Estimate are set by the issue creator
- The commit can reference the issue number
- Work can be claimed by moving the card to In Progress

**When commits are ready:** If all commits on a branch are complete and ready to merge, create a PR using `gh pr create --fill`. Do not leave commits sitting on a branch without a PR. PRs wait for user review before merging - never auto-merge.

## Project board discipline

The GitHub Project board is the source of truth for what's being worked on. Every issue on the board must have its status column match reality.

- When picking up an issue, move it from **Todo → In Progress** before writing any code
- When committing code that closes an issue, use `Closes #N` — the git hook auto-moves the card to **Done** on merge to main
- After every commit or push, verify the board state matches reality
- If an open issue exists but isn't on the project board, add it (Todo or In Progress as appropriate) — and set its **Priority** and **Estimate** fields (see below)
- **When you create an issue, triage it yourself in the same step**: add it to the board and set Priority and Estimate judged from the issue's actual content. **Never apply blanket default values** — an Action that stamped every new issue P2/S was removed for exactly this reason; automation must not set these fields
- **Multiple agents work this repo — claim an issue before writing code.** An issue is free only if its board status is Todo **and** it has no open PR or pushed branch referencing it **and** no claim comment. To claim one: move its card to In Progress and leave a one-line comment on the issue saying you're picking it up. If signals conflict (e.g. Todo on the board but a branch exists), surface it to the user instead of starting
- Every board item carries **Priority** (P0–P3) and **Estimate** (XS/S/M/L/XL) single-select fields. Pick up work highest-priority-first, breaking ties toward the smaller estimate. Priority weighs data safety first (loss/corruption bugs), then everyday user value, then speculative scope; Estimate is t-shirt sizing (XS ≈ one-liner, S ≈ a focused session, M ≈ a day or two, L ≈ multi-day, XL ≈ open-ended multi-week)

### Reading the board (how to query it correctly)

- The relevant board is **GitHub Project #4 "Warframe Item Tracker"** (`gh project item-list 4 --owner @me`). The other project, **"Iris"** (project #5), is an unrelated email-assistant project — ignore it.
  - **Project ID string:** `PVT_kwHOACqRis4Bc2Fb` (use with `--project-id` flag for item-edit operations)
  - **Quick reference for adding items:** `gh project item-add 4 --owner @me --url <issue-url>`
- **`gh project item-list` truncates by default.** Always pass `--limit 1000` or you'll only see a subset of items and will wrongly conclude columns are empty / issues are missing.
- To get a clean status+title dump:
  ```bash
  gh project item-list 4 --owner @me --limit 1000 --format json \
    | jq -r '.items[] | "\(.status)\t\(.content.number // "DRAFT")\t\(.title)"'
  ```
- To rank the backlog by priority/estimate (what to pick up next):
  ```bash
  gh project item-list 4 --owner @me --limit 1000 --format json \
    | jq -r '.items[] | select(.status == "Todo") | "\(.priority // "-")\t\(.estimate // "-")\t#\(.content.number)\t\(.title)"' | sort
  ```
- To set Priority/Estimate on a board item, use `gh project item-edit --id <item-id> --project-id PVT_kwHOACqRis4Bc2Fb --field-id <field-id> --single-select-option-id <option-id>` with these IDs (stable, created 2026-07-11):
  - **Priority** field `PVTSSF_lAHOACqRis4Bc2FbzhXrT4s`: P0=`68c09189`, P1=`83c82297`, P2=`379c4132`, P3=`0e04d828`
  - **Estimate** field `PVTSSF_lAHOACqRis4Bc2FbzhXrT8A`: XS=`5c5e23d3`, S=`92fa8114`, M=`d7260a84`, L=`5da64983`, XL=`e2407bc6`
- The `read:project` OAuth scope is required; if `gh project` errors with `missing required scopes`, run `gh auth refresh -h github.com -s read:project`. Editing fields additionally needs the `project` (write) scope.
- Note: board items generally have **no assignee** (single-developer project) — that's expected, not a gap to fix.

## Agent behavior

When the user asks you to make a code change, configuration change, or infrastructure/operations change, **always complete the full git workflow** unless they explicitly say otherwise. Use the `ce-commit-push-pr` skill as the canonical way to ship changes:

1. Create or use an existing feature branch
2. Run `ce-commit-push-pr` — it commits (with issue reference), pushes, and opens a PR. **Skip its auto-merge step** (see Git workflow — PRs wait for the user's review)

Ops/config changes (`docker-compose.yml`, `.env`, deployment scripts, infrastructure-as-code, host path migrations, etc.) are in scope for CE. Do not treat them as ad-hoc live edits.

For smaller commits without a full PR, use `ce-commit` to create a well-formated commit with issue reference.

If CE skills are unavailable, fall back to the manual steps in the Git workflow section below.

Do not stop after making the file edit — the workflow is not complete until the PR is open and its URL has been reported to the user for review.

## Git workflow

All changes go through **pull requests** — never push directly to `main`. `main` is protected: the `Test Suite` CI check must pass before merging.

The canonical way to ship changes is via the `ce-commit-push-pr` skill, which handles the full flow:
1. Creates a feature branch (or uses the current one)
2. Commits changes with an issue reference
3. Pushes to the branch
4. Opens a PR via `gh pr create --fill`

**Never enable auto-merge.** Every PR waits for the user to review and merge it personally — `allow_auto_merge` is disabled at the repository level, so `gh pr merge --auto` fails; do not work around that. Where `ce-commit-push-pr` or older docs say to enable auto-merge, skip that step and report the PR URL instead.

For smaller commits without a full PR, use `ce-commit` to create a well-formatted commit with issue reference.

Manual fallback (if CE skills are unavailable):
1. Create a feature branch: `git checkout -b feat/short-description`
2. Commit and push changes to the branch
3. Create a PR: `gh pr create --fill` and report its URL — the user reviews and merges
4. After the merge, tests pass on main and the "Deploy" workflow builds the Docker image and pushes it to GHCR; Watchtower on the VPS picks it up and restarts the container automatically

Author: `NamalD` on GitHub, `namald@users.noreply.github.com`.

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

- `app/loadouts/[id]/requirement-combobox.jsx` uses a `justSelectedRef` guard to stop the dropdown from reopening immediately after a selection (blur/focus race) — preserve this guard if touching combobox
- When converting client `.js` modules to `.ts` in `src/data/`, the Oxc parser used by Vite 6 / Vitest 4 currently fails on `import type` and typed instance fields. Use `// @ts-nocheck` plus JSDoc `@typedef` / `@type` typing instead. See `docs/solutions/nextjs/ts-migration-oxc-workaround.md`.
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

This project follows the compound engineering loop: **Brainstorm → Plan → Work → Review → Compound → Repeat**. All CE skills are installed as Pi skills and can be invoked directly.

### Available CE skills

| Skill | Purpose |
|-------|---------|
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
| `ce-riffrec-feedback-analysis` | Analyze Riffrec feedback captures |
| `ce-simplify-code` | Simplify recently changed code for clarity and quality |
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

### Workflow

**For new features or changes:**
0. **Brainstorm** (optional) — use `ce-brainstorm` if the idea is vague or needs scoping before planning
1. **Plan** — use `ce-plan`: research codebase + external docs, produce implementation plan in `docs/plans/`
2. **Work** — use `ce-work`: execute the plan step by step, run validations after each change
3. **Review** — use `ce-code-review`: spawn parallel reviewer subagents, prioritize findings (P0-P3), fix issues
4. **Compound** — use `ce-compound`: capture what worked/didn't, update AGENTS.md patterns, create solution docs

**For bugs:**
- Use `ce-debug` instead of the Plan→Work→Review→Compound loop. It runs a structured diagnosis loop: reproduce → isolate → root cause → fix → verify.

**For shipping:**
- Use `ce-commit-push-pr` to commit, push, open a PR, and enable auto-merge in one step.
- Use `ce-commit` for smaller commits without a full PR.

Every completed unit of work should end with the compound step — this is what makes the system get smarter over time.
