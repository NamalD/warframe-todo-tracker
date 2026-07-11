---
name: verify
description: Build, run, and drive the Warframe TODO Tracker app to verify a change end-to-end at the UI surface.
---

# Verifying changes in this app

## Toolchain gotcha

`yarn` and `corepack` are not on PATH. Use the repo-local release:

```bash
node .yarn/releases/yarn-*.cjs <command>       # e.g. ... vitest run, ... next dev
node .yarn/releases/yarn-*.cjs node script.mjs # PnP-resolved node (needed for playwright imports)
```

Scripts that import repo deps (e.g. `playwright`) must live **inside the repo**
(PnP resolution) and run via `yarn node`. Don't write one-off drive scripts —
extend `scripts/verify-sweep.mjs` instead; if a throwaway is unavoidable,
delete it before committing.

## Launch

```bash
DATA_DIR=$(mktemp -d) node .yarn/releases/yarn-*.cjs next dev -p 3001
```

- Use port **3001**: the Playwright e2e suite reuses an already-running server
  there (`reuseExistingServer`), and its own webServer command (`npx next dev`)
  fails under PnP — npx resolves a non-PnP Next and Turbopack aborts. Booting
  3001 yourself serves both the sweep and `yarn playwright test`.
- `DATA_DIR` isolates the SQLite DB — never verify against `./data/warframe.db`.
- No `PASSWORD` env → middleware allows all access (no login needed).
- Ready when `curl localhost:3001/api/materials` answers. First page compile ~10s.

## Keep it cheap (token discipline)

Verification cost is dominated by reading screenshots into context — one
full-page PNG costs more than this entire skill. Prefer, in order:

1. **The committed sweep** — one line of numbers per page (load status,
   console/page errors, HTTP ≥400s, page-level horizontal overflow;
   exit code 1 if anything failed):

   ```bash
   node .yarn/releases/yarn-*.cjs node scripts/verify-sweep.mjs \
     --pages /items,:item-detail --widths 375,1280 --seed
   ```

   `--seed` populates demo data (tracked items, todos, a full loadout) so
   pages aren't empty-state; `:item-detail`/`:loadout-detail` resolve to
   data-rich detail routes; `--json out.json` dumps offender details;
   omit `--pages` for the full route matrix.
2. **Targeted Playwright assertions** (element visible, value persisted,
   API response shape) — they return strings, not pixels.
3. **Screenshots** (`--shots DIR`) — only when appearance itself is the
   question, and only for pages the sweep flagged. Crop tall pages before
   reading (`magick shot.png -crop 375x1200+0+0 top.png`) — Read fails
   above ~2000px and full-page shots of list pages easily exceed that.

Scope the sweep to routes your change touches; the full matrix is for
layout-wide changes only.

## Drive

Playwright deps are already in the repo (`yarn playwright install chromium` if
the browser cache is missing). Useful surfaces:

- Item detail: `/items/<id>` — owned-count inputs labelled
  `Owned quantity for <material>` (number input when `quantity_required > 1`,
  checkbox when 1). Get ids/materials from `GET /data/wfcd-cache.json`.
- Shopping list `/shopping-list` only shows materials of *tracked* items —
  item detail is the deterministic surface for material counts.
- Inspect persistence directly: `curl localhost:3001/api/materials`
  (returns `{ data, versions }`).

## Gotchas

- `yarn vitest run` no longer touches `public/data/*.json` (the schema test
  generates its fresh cache into a temp dir via `PREBUILD_OUT_DIR`, #127) —
  if `git status` shows churn there, something regenerated them manually;
  `git checkout -- public/data` to restore.
