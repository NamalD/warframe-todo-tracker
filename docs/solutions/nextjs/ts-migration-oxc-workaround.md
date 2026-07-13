---
problem_type: pattern
category: nextjs
tags: [typescript, oxc, vite, vitest, jsdoc, migration]
date: 2026-07-10
issue: #93
status: resolved (2026-07-13, vite@8.1.3 / vitest@4.1.10) — see Prevention/Update
---

# TypeScript migration with JSDoc typing under Vite 6 / Vitest 4

> **Update 2026-07-13**: re-tested against the currently installed toolchain
> (vite@8.1.3, vitest@4.1.10, @vitejs/plugin-react@6.0.3) — the parser bug no
> longer reproduces. A probe file using real `import type` and typed class
> instance fields ran clean under both `yarn vitest run` and `yarn tsc --noEmit`.
> New `src/data/*.ts` files should be written as real TypeScript; the
> `@ts-nocheck`/JSDoc pattern below is now only needed for files not yet
> migrated. Migrate existing files opportunistically (when already doing a
> substantial edit to one), not as a dedicated sweep. Also note: several
> existing `@typedef {import('../types/data')...}` paths are actually wrong
> (missing a `../` — the real path from `src/data/` is `../../types/data`)
> and were never caught because `@ts-nocheck` suppresses resolution errors;
> real `import type` will catch this class of mistake going forward.

## Problem
When converting Next.js 14 client code from JavaScript to TypeScript (.js → .ts), the Oxc-based transformer in Vite 6 / Vitest 4 throws parse/build errors on valid TS syntax, specifically:
- `import type { ... } from '...'`
- Typed instance fields in class bodies (`items: Item[] = []`)

This blocks the migration because `.ts` extensions are required by the project's strict TypeScript plan, but the build toolchain cannot parse the ideal TypeScript patterns.

## Root Cause
Oxc parser bug: oxc-project/oxc#8141 — tokenizer/transformer fails on `import type` declarations and typed class field initializers in this toolchain version. Workaround does not exist in project config; individual file-level bypass is needed.

## Solution
Use `@ts-nocheck` at the top of converted files to disable TS type checking for that file, paired with JSDoc `@typedef` imports and `@type` casts instead of TS-native `import type` and typed fields.

Working pattern for `src/data/*.ts` client modules:
```
// @ts-nocheck
'use client';

/** @typedef {import('../../types/data').Item} Item */
/** @typedef {import('../../types/data').Build} Build */

export default class Repository {
  /** @type {{ items: Item[] }} */
  #data = { items: /** @type {Item[]} */ ([]) };

  /** @returns {Item[]} */
  getItems() {
    // @ts-ignore - JSDoc type on private field
    return this.#data.items.map((i) => {
      // @ts-ignore
      return { ...i };
    });
  }
}
```

Key rules:
1. Always lead with `// @ts-nocheck` in converted `.ts` files
2. Use `/** @typedef {import('...').Type} Type */` for type imports
3. Use `/** @type {Type[]} */ ([])` for typed initializers
4. Use `// @ts-ignore` whenever accessing #private fields with JSDoc types
5. Build succeeds; tests succeed; IDE still gets some type hints from JSDoc

## Prevention
When upgrading Vite / Vitest / Oxc, retry without `@ts-nocheck` to see if the upstream parser bug is fixed. If fixed, migrate file-by-file from JSDoc typing to native TS syntax.
