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
(PnP resolution) and run via `yarn node`. Delete them before committing.

## Launch

```bash
DATA_DIR=$(mktemp -d) node .yarn/releases/yarn-*.cjs next dev -p 3005
```

- `DATA_DIR` isolates the SQLite DB — never verify against `./data/warframe.db`.
- No `PASSWORD` env → middleware allows all access (no login needed).
- Ready when `curl localhost:3005/api/materials` answers. First page compile takes ~10s.

## Drive

Playwright (deps already in the repo; `yarn playwright install chromium` if the
browser cache is missing). Useful surfaces:

- Item detail: `/items/<id>` — owned-count inputs labelled
  `Owned quantity for <material>` (number input when `quantity_required > 1`,
  checkbox when 1). Get ids/materials from `GET /data/wfcd-cache.json`.
- Shopping list `/shopping-list` only shows materials of *tracked* items —
  item detail is the deterministic surface for material counts.
- Inspect persistence directly: `curl localhost:3005/api/materials`
  (returns `{ data, versions }`).

## Gotchas

- `yarn vitest run` regenerates `public/data/*.json` (cachedAt churn) —
  `git checkout -- public/data` before committing.
- `.gitignore`'s `data/` rule also matches `src/data/`; tracked files are fine
  but `git add` on explicit `src/data/...` pathspecs is refused — use
  `git add -u` (or `-f`).
