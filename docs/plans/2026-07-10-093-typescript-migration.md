---
date: 2026-07-10
issue: "#93"
artifact_contract: ce-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Migrate Codebase from JavaScript to TypeScript (Strict Mode)

## Goal Capsule

Convert all ~85 source and test files from JavaScript/JSX to TypeScript/TSX with `strict: true`, adding type annotations for core data shapes while keeping the existing Next.js 14 architecture intact.

## Scope

**In scope:**
- `tsconfig.json` with `strict: true`, path aliases, and `allowJs` for incremental migration
- Type definitions for core data shapes (items, materials, todos, loadouts, mods, builds)
- Declaration file for untyped `@wfcd/items` package
- Convert all source files in `app/`, `src/`, `scripts/`, `tests/` to `.ts`/`.tsx`
- ESLint configured with `@typescript-eslint`
- `yarn build` and `yarn test:unit` pass with zero type errors
- `yarn test:e2e` passes (Playwright tests are already `.ts`)
- `AGENTS.md` updated with new language convention

**Out of scope:**
- Runtime validation (Zod, io-ts) — TypeScript compile-time only
- Converting `next.config.js` to ESM (Next.js doesn't support `next.config.ts`)
- Changing existing logic or architecture — types only, no behavior changes
- Upgrading Next.js, React, or other dependencies

## Affected Files

### New files to create:
- `tsconfig.json` — replaces `jsconfig.json`, strict mode with path aliases
- `types/wfcd.d.ts` — ambient declarations for `@wfcd/items`
- `types/data.ts` — shared interfaces for the data model
- `.eslintrc.json` — updated with TypeScript ESLint config

### Config files to modify:
- `jsconfig.json` — deleted (replaced by `tsconfig.json`)
- `.eslintrc.json` — add TypeScript parser and rules
- `vitest.config.ts` — update include glob to prioritize `.ts`/`.tsx`
- `package.json` — add `@types/*` dev dependencies

### Source files to convert (~50 files):

**Data layer (14 files):**
- `src/data/database.js` → `.ts`
- `src/data/server-store.js` → `.ts`
- `src/data/sqlite-todos.js` → `.ts`
- `src/data/sqlite-loadouts.js` → `.ts`
- `src/data/sqlite-materials.js` → `.ts`
- `src/data/sqlite-builds.js` → `.ts`
- `src/data/sqlite-user-items.js` → `.ts`
- `src/data/repository.js` → `.ts` (client component — stays `.ts` with `'use client'`)
- `src/data/loadout-repository.js` → `.ts`
- `src/data/mod-repository.js` → `.ts`
- `src/data/build-repository.js` → `.ts`
- `src/data/material-aggregator.js` → `.ts`
- `src/data/requirement-options.js` → `.ts`
- `src/data/seed.js` → `.ts`

**Stores (4 files):**
- `src/data/store.js` → `.ts`
- `src/data/loadout-store.js` → `.ts`
- `src/data/mod-store.js` → `.ts`
- `src/data/build-store.js` → `.ts`

**Utility (1 file):**
- `src/utils.js` → `.ts`

**Dashboard components (2 files):**
- `src/components/build-dashboard-section.jsx` → `.tsx`
- `src/components/loadout-dashboard-section.jsx` → `.tsx`

**App pages + components (18 files):**
- All `app/**/page.jsx` → `.tsx` (13 files: items, items/[id], mods, mods/[id], loadouts, loadouts/[id], builds, builds/[id], todos, shopping-list, sources, login, home + layout, not-found)
- `app/components/NavBar.jsx` → `.tsx`
- `app/components/MultiSelectPillFilter.jsx` → `.tsx`
- `app/components/searchable-select.jsx` → `.tsx`
- `app/loadouts/[id]/requirement-combobox.jsx` → `.tsx`

**API routes (8 files):**
- `app/api/todos/route.js` → `.ts`
- `app/api/todos/[id]/route.js` → `.ts`
- `app/api/loadouts/route.js` → `.ts`
- `app/api/loadouts/[id]/route.js` → `.ts`
- `app/api/materials/route.js` → `.ts`
- `app/api/materials/batch/route.js` → `.ts`
- `app/api/builds/route.js` → `.ts`
- `app/api/user-items/route.js` → `.ts`
- `app/api/sync/route.js` → `.ts`
- `app/api/login/route.js` → `.ts`

**Scripts (2 files):**
- `scripts/prebuild.mjs` → `.mts` (or `.ts` — stay ESM with `.mts`)
- `tests/test-pack.mjs` → `.mts`

**Unit tests (~35 files):**
- All `tests/unit/**/*.test.js` → `.test.ts`
- All `tests/unit/**/*.test.jsx` → `.test.tsx`

### Config files left as-is:
- `next.config.js` — Next.js does not support TypeScript config files
- `Dockerfile` — no changes needed (`next build` handles TS)
- `.dockerignore` — no changes needed
- `docker-compose.yml` — no changes needed

## Existing Patterns to Follow

- **E2e tests already TypeScript**: `tests/*.spec.ts` files use Playwright's TypeScript API with typed `page`, `expect`, etc. Follow their import style and type usage.
- **vitest.config.ts already TypeScript**: Uses `import` syntax, typed config. Keep this pattern.
- **Client components use `'use client'`**: Repository files have `'use client'` at the top. TypeScript doesn't change this — `.ts` files with `'use client'` work fine in Next.js App Router.
- **API routes follow Next.js Route Handler pattern**: Each exports named HTTP method functions (`export async function GET`, etc.). Next.js provides `NextRequest` / `NextResponse` types.
- **Server-only modules use `import 'server-only'`**: `database.js` and sqlite helpers. Keep this guard — TypeScript won't enforce it but it's runtime-critical.

## Implementation Units

### U1: Infrastructure Setup

**Files**: `tsconfig.json` (new), `.eslintrc.json` (modify), `package.json` (modify), `jsconfig.json` (delete)

**What to do:**
1. Add dev dependencies: `typescript`, `@types/react`, `@types/react-dom`, `@types/better-sqlite3`, `@types/node`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`
2. Create `tsconfig.json` with:
   - `strict: true` (enables all strict checks: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, etc.)
   - `allowJs: true` (lets unconverted JS files compile during migration)
   - `checkJs: false` (don't type-check JS files — we're converting them all anyway, avoids noise)
   - `jsx: preserve` (Next.js handles JSX transform)
   - `paths`: `{ "@/*": ["./*"] }` (matches existing `@/` imports)
   - `include`: `["app/**/*", "src/**/*", "scripts/**/*", "tests/**/*"]`
   - `moduleResolution: "bundler"` (modern resolution for Next.js)
   - `module: "esnext"`
   - `target: "ES2017"`
3. Update `.eslintrc.json`:
   - Add `parser: "@typescript-eslint/parser"`
   - Add `plugins: ["@typescript-eslint"]`
   - Add `extends: ["next/core-web-vitals", "plugin:@typescript-eslint/recommended"]`
   - Keep existing `@next/next/no-img-element: off`
   - Add `@typescript-eslint/no-explicit-any: warn` (discourage `any` but don't block)
4. Delete `jsconfig.json` (replaced by `tsconfig.json`)
5. Update `vitest.config.ts`: change `include` from `['tests/unit/**/*.test.{js,jsx,ts,tsx}']` to `['tests/unit/**/*.test.{ts,tsx}']` once all tests are converted
6. Update `package.json` scripts: no changes needed — `next dev/build`, `vitest`, and `playwright test` all support TS natively

**Verification**: `npx tsc --noEmit` returns zero errors on a clean checkout (before any files are converted — `allowJs: true` lets JS files through).

**Pitfall**: `next build` does its own type checking. We configure `tsconfig.json` for the IDE + `tsc --noEmit` workflow, but the final gate is `yarn build` passing.

---

### U2: Type Definitions

**Files**: `types/wfcd.d.ts` (new), `types/data.ts` (new)

**What to do:**
1. Create `types/wfcd.d.ts` — ambient module declaration for `@wfcd/items`:
   - Declare the module with `declare module '@wfcd/items'`
   - Export the `Items` class constructor signature
   - Provide minimal types for the methods we use (based on usage in `prebuild.mjs`)
2. Create `types/data.ts` — shared interfaces matching the existing data shapes:
   - `Item` (id, name, item_type, mastery_rank_required, blueprint_source, etc.)
   - `Material` (id, craftable_item_id, material_name, component_unique_name, quantity_required, etc.)
   - `TreeRelationship` (id, parent_item_id, child_item_id, quantity_required)
   - `Source` (id, material_name, source_name, source_type, etc.)
   - `Todo` (id, craftable_item_id, status, priority, etc.)
   - `MaterialInventory` (Record<string, number>)
   - `WfcdCache` (version, cachedAt, items, materials, treeRelationships, sources)
   - `ModEntry`, `BuildEntry`, `LoadoutEntry`, `LoadoutSlot`, `Requirement`
   - Derive from actual usage patterns in repository.js, loadout-repository.js, mod-repository.js, build-repository.js

**Pattern**: Read existing data usage in repository/store files to extract the exact shape. These aren't just guesses — they're documenting what already exists.

**Verification**: `npx tsc --noEmit` still passes. Types are defined but not yet used anywhere.

---

### U3: Server Data Layer

**Files**: `src/data/database.js` → `.ts`, `src/data/server-store.js` → `.ts`, `src/data/sqlite-todos.js` → `.ts`, `src/data/sqlite-loadouts.js` → `.ts`, `src/data/sqlite-materials.js` → `.ts`, `src/data/sqlite-builds.js` → `.ts`, `src/data/sqlite-user-items.js` → `.ts`

**What to do:**
1. Rename each `.js` → `.ts`
2. Add `import type` for data interfaces from `types/data.ts`
3. Add return types to exported functions (e.g., `getDb(): Database`, `getAllTodos(): Todo[]`)
4. Add type annotations to function parameters
5. Use `Database` type from `@types/better-sqlite3` for `better-sqlite3` usage
6. Add `RowType` generic to `.all()`, `.get()` calls where practical
7. Keep `import 'server-only'` as-is (it's a side-effect import)
8. Keep CJS-style `require` if present, or convert to ESM `import` if the file already uses ESM

**Pattern to follow**: `tests/unit/database.test.js` already imports from these modules. The test file imports shape how the modules are consumed — match those patterns.

**Test scenarios** (after conversion, run):
- `yarn vitest run tests/unit/database.test.js` — database lifecycle tests
- `yarn vitest run tests/unit/sqlite-todos.test.js` — todo CRUD
- `yarn vitest run tests/unit/sqlite-loadouts.test.js` — loadout CRUD
- `yarn vitest run tests/unit/sqlite-materials.test.js` — material CRUD

**Pitfall**: `better-sqlite3` is synchronous. Its TypeScript types reflect this — no `await` needed. The `@types/better-sqlite3` package provides `Database`, `Statement`, `RunResult` types.

---

### U4: Client Repositories

**Files**: `src/data/repository.js` → `.ts`, `src/data/loadout-repository.js` → `.ts`, `src/data/mod-repository.js` → `.ts`, `src/data/build-repository.js` → `.ts`, `src/data/store.js` → `.ts`, `src/data/loadout-store.js` → `.ts`, `src/data/mod-store.js` → `.ts`, `src/data/build-store.js` → `.ts`, `src/data/seed.js` → `.ts`, `src/data/material-aggregator.js` → `.ts`, `src/data/requirement-options.js` → `.ts`

**What to do:**
1. Rename each `.js` → `.ts`
2. Keep `'use client'` directive at top of client-component files
3. Add type annotations to public fields (e.g., `items: Item[] = []`)
4. Add return types to all methods (`async initTodos(): Promise<void>`)
5. Add parameter types to all method signatures
6. Type `fetch` responses with the data interfaces from `types/data.ts`
7. Remove defensive type guards that TypeScript makes redundant — e.g., `typeof x === 'object' && x !== null` can become just `x !== null` when TypeScript knows the type
8. Use private fields with `#` where appropriate (already present in repository.js)
9. Type `localStorage` reads/writes — parse with type assertion after validation

**Key files with complex typing:**
- `repository.js` (410 lines) — largest file, has `items`, `materials`, `todos`, `materialInventory` fields + the most defensive type guards
- `loadout-repository.js` — nested JSON structure (slots, requirements, materials)
- `mod-repository.js` — mod data from `mods-cache.json`

**Pattern to follow**: Look at how `tests/unit/repository.test.js` constructs mock data — the test fixtures define the expected shapes.

**Test scenarios** (after conversion):
- `yarn vitest run tests/unit/repository.test.js`
- `yarn vitest run tests/unit/loadout-repository.test.js`
- `yarn vitest run tests/unit/mod-repository.test.js`
- `yarn vitest run tests/unit/build-repository.test.js`

**Pitfall**: Client components import from `types/data.ts` — ensure the types file has no server-only imports or Node.js dependencies. Pure interface types only (no `better-sqlite3`, no `fs`, no `server-only`).

---

### U5: Utility and Aggregation Files

**Files**: `src/utils.js` → `.ts`, `src/data/requirement-options.js` → `.ts`, `src/data/material-aggregator.js` → `.ts`

**What to do:**
1. Rename `.js` → `.ts`
2. Add parameter and return types to every exported function
3. `utils.js` — utility functions (likely string formatting, date helpers). Type generically where appropriate.

**Test scenario**: `yarn vitest run tests/unit/utils.test.js`

---

### U6: Dashboard Components

**Files**: `src/components/build-dashboard-section.jsx` → `.tsx`, `src/components/loadout-dashboard-section.jsx` → `.tsx`

**What to do:**
1. Rename `.jsx` → `.tsx`
2. Add `React.FC` or explicit props interface for each component
3. Type any hooks used (`useState`, `useEffect`, etc.)

---

### U7: App Pages and Shared Components

**Files**: 13 page files + 4 component files in `app/`

**What to do:**
1. Rename each `.jsx` → `.tsx` (pages), `.jsx` → `.tsx` (components)
2. Pages: add `export default function PageName()` — Next.js infers types from the file location. No explicit `NextPage` type needed for basic pages.
3. Components: add explicit props interfaces
4. `layout.jsx` → `.tsx`: type the `children` prop as `React.ReactNode`
5. For pages that fetch data server-side: add return types, type API responses
6. For client components with `useState`: add generic type parameter (e.g., `useState<Item[]>([])`)
7. For event handlers: type the event parameter (`React.ChangeEvent<HTMLInputElement>`)

**Pattern to follow**: Existing code structure doesn't change. The `'use client'` directive stays. Type annotations are additive.

**Pitfall — `requirement-combobox.jsx`**: The `justSelectedRef` guard (documented in AGENTS.md) must be preserved. Type the ref as `React.MutableRefObject<boolean>`.

**Test scenarios** (after conversion):
- `yarn vitest run tests/unit/items-list.test.jsx`
- `yarn vitest run tests/unit/mods-page.test.jsx`
- `yarn vitest run tests/unit/todos.test.jsx`
- `yarn vitest run tests/unit/loadouts.test.jsx`
- `yarn vitest run tests/unit/navbar.test.jsx`
- `yarn vitest run tests/unit/dashboard.test.jsx`

---

### U8: API Routes

**Files**: 10 route files in `app/api/**/`

**What to do:**
1. Rename each `route.js` → `route.ts`
2. Type exported HTTP method functions: `export async function GET(request: NextRequest): Promise<NextResponse>`
3. Type JSON response bodies with data interfaces
4. Type request body parsing (e.g., `const body: Partial<Todo> = await request.json()`)
5. Type query parameters from `request.nextUrl.searchParams`
6. Use `NextRequest` from `next/server` and `NextResponse` from `next/server`

**Test scenarios** (after conversion):
- `yarn vitest run tests/unit/routes-sqlite.test.js`
- `yarn vitest run tests/unit/routes-phase2.test.js`
- `yarn vitest run tests/unit/routes-version.test.js`

---

### U9: Scripts

**Files**: `scripts/prebuild.mjs` → `scripts/prebuild.mts`, `tests/test-pack.mjs` → `tests/test-pack.mts`

**What to do:**
1. Rename `.mjs` → `.mts` (keeps ESM semantics, adds TypeScript)
2. `prebuild.mts`: type the `@wfcd/items` usage with declarations from `types/wfcd.d.ts`, type the output shape using `types/data.ts`, type all helper functions
3. `test-pack.mts`: type the phase runner, child process calls, HTTP requests
4. Update `package.json` scripts if they reference `.mjs` by name (check `test-pack.mjs` reference in `scripts.test` if any)

**Pitfall**: `prebuild.mjs` is `#!/usr/bin/env node`. The `.mts` extension with a Node.js hashbang should work with `tsx` or `ts-node`, but since Next.js doesn't use these, we can also stick with `.mjs` + JSDoc types (like `vitest.config.ts` does). Simpler: convert to `.ts` and run with `npx tsx scripts/prebuild.ts` or keep as `.mjs` with JSDoc. **Decision**: keep `prebuild.mjs` + `test-pack.mjs` as `.mjs` but add JSDoc type annotations (`/** @type {import('./types/data').Item} */`). Simpler and avoids adding `tsx` as a dependency. Alternatively, import `tsx` at runtime. **Recommendation: convert to `.ts` and add `tsx` as a dev dependency, update `package.json` scripts.**

**Test scenario**: `node scripts/prebuild.mts` produces identical output to current `node scripts/prebuild.mjs` (diff the generated JSON).

---

### U10: Unit Test Conversion

**Files**: ~35 test files in `tests/unit/`

**What to do:**
1. Rename `.test.js` → `.test.ts`, `.test.jsx` → `.test.tsx`
2. Add type annotations to test fixtures (mock data should match `types/data.ts` interfaces)
3. Type mock functions: `vi.fn<Parameters, ReturnType>()`
4. The `mockFetchOk`/`mockFetchFail` helpers in `repository.test.js`: type the return as `vi.Mock`
5. Component tests: add proper types for rendered elements, queries, and assertions
6. `tests/unit/setup.ts` is already TypeScript — no changes needed
7. `tests/unit/mocks/server-only.js` stays as `.js` (it's a mock shim)
8. Update `vitest.config.ts` include glob once all tests are converted

**Pattern to follow**: The existing E2E tests (`tests/*.spec.ts`) use TypeScript — follow their style.

**Verification**:
- `yarn test:unit` — all tests pass
- `yarn test:e2e` — all Playwright tests pass (already `.ts`, should be unaffected)

---

### U11: Build Verification and Cleanup

**Files**: `AGENTS.md` (modify), `package.json` (verify scripts)

**What to do:**
1. Run `yarn build` — must produce a successful production build with zero type errors
2. Run `yarn test:unit` — all ~300+ tests pass
3. Run `yarn test:e2e` — all Playwright tests pass
4. Delete `jsconfig.json` if not already done
5. Update `AGENTS.md`:
   - Change `Language: JavaScript/JSX (app code), TypeScript (tests only)` to `Language: TypeScript/TSX`
   - Add note about `strict: true` and `tsconfig.json`
   - Update file extension references (`.js` → `.ts`, `.jsx` → `.tsx`)
6. Run `yarn test` (test-pack) — full suite including asset checks
7. Run Docker build: `docker compose build` — verifies containerized build works

**Verification contract**: All of the above must pass with zero new failures.

**Pitfall**: `next build` runs TypeScript checking during build. If we have `strict: true` and missed any type errors, the build fails. Fix errors before marking complete.

---

## Dependencies

```
U1 (Infrastructure) ─────────────────────────────────────────────┐
    │                                                             │
    ├── U2 (Type Definitions) ──────────────────────────────────┐ │
    │       │                                                    │ │
    │       ├── U3 (Server Data Layer) ─────────────────────────┤ │
    │       │       │                                            │ │
    │       │       ├── U4 (Client Repositories) ───────────────┤ │
    │       │       │       │                                    │ │
    │       │       │       ├── U5 (Utilities) ─────────────────┤ │
    │       │       │       │                                    │ │
    │       │       │       ├── U6 (Dashboard Components) ──────┤ │
    │       │       │       │                                    │ │
    │       │       │       ├── U7 (App Pages + Components) ────┤ │
    │       │       │       │                                    │ │
    │       │       │       ├── U8 (API Routes) ────────────────┤ │
    │       │       │       │                                    │ │
    │       │       │       └── U9 (Scripts) ───────────────────┘ │
    │       │       │                                              │
    │       │       └── U10 (Unit Tests) ← depends on all above   │
    │       │                                                      │
    │       └── U11 (Verification + Cleanup) ← final gate         │
    │                                                              │
    └── (U1 must complete before any file conversion)              │
```

- **U1 → U2**: Need tsconfig before writing type files
- **U1 → U3-U9**: Need tsconfig before converting files
- **U2 → U3-U10**: Type definitions are imported by all converted files
- **U3 → U4**: Client repositories consume server data shapes
- **U4 → U7, U8**: Pages and routes consume typed repository/store data
- **U3-U9 → U10**: Tests must be converted last since they import from all source files
- **U3-U10 → U11**: Verification after all conversions complete

**Parallelism note**: U4-U9 can be done in parallel once U3 is stable, since they don't depend on each other (they share types from U2 but not implementation details from each other).

---

## Risks

- **`@wfcd/items` has no types**: We create `types/wfcd.d.ts` with minimal declarations. If usage changes in future `@wfcd/items` versions, the declarations may need updating. **Mitigation**: The prebuild schema test already catches output shape changes.
- **`next.config.js` stays CJS**: This blocks importing `tsconfig.json` paths in the config. **Mitigation**: Already handled — Next.js doesn't support `.ts` config files. No impact.
- **`better-sqlite3` type coverage**: The `@types/better-sqlite3` package is community-maintained and may lag behind the actual package. **Mitigation**: We only use basic operations (`.all()`, `.get()`, `.run()`, `.prepare()`) which are well-covered.
- **Client/server type confusion**: `types/data.ts` must only contain pure interfaces (no Node.js imports). If a server-only type sneaks in, client bundling breaks. **Mitigation**: Explicitly check before importing — if it uses `Buffer`, `fs`, `path`, `better-sqlite3`, or `server-only`, it doesn't belong in shared types.
- **Test breakage**: Renaming files changes import paths. Vitest resolves imports based on the config, but double-check the `include` glob catches all renamed files. **Mitigation**: Run `yarn test:unit` after each unit to catch regressions early.
- **`allowJs: true` masks unconverted files**: After U11, all files should be `.ts`/`.tsx`. If `allowJs` is left `true`, a stray `.js` file won't be caught. **Mitigation**: In U11, set `allowJs: false` and verify no JS files remain (except explicitly exempted ones: `next.config.js`, `.yarn/`, `node_modules/`, `tests/unit/mocks/server-only.js`).

---

## Verification Contract

```bash
# After U1
npx tsc --noEmit                              # zero errors with allowJs

# After each unit
yarn test:unit                                # all tests pass for that domain

# After U10 (all conversions)
yarn test:unit                                # all ~300+ unit tests pass
yarn test:e2e                                 # all Playwright tests pass
npx tsc --noEmit                              # zero type errors

# After U11 (final)
yarn build                                    # production build succeeds
yarn test                                     # test-pack all phases pass
docker compose build                          # Docker image builds

# Manual checks
# - `git ls-files '*.js' '*.jsx' | grep -v node_modules | grep -v .yarn | grep -v next.config`
#   should return only: next.config.js, tests/unit/mocks/server-only.js
# - Open app at localhost:3000 — all pages load, no console errors
# - AGENTS.md reflects TypeScript
```
