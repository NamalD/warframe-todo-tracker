---
problem_type: gotcha
category: testing
tags: [e2e, playwright, worktree, next-dev, reuseExistingServer, ports]
date: 2026-07-13
issue: "#55"
---

# Running Playwright e2e From a Worktree Hits the Wrong Server

## Problem

While building #55 in a worktree, `yarn playwright test` passed the assertions'
locators against a page that showed the **main branch** — the new `/worldstate`
route 404'd and the NavBar lacked the new link, even though the worktree's files
were correct. Separately, running `yarn build` mid-session then made a
previously-working dev server start returning `500`s and `404`s for
`_next/static/*` chunks.

## Root Cause

Two independent traps, both specific to working in a worktree alongside a
long-running main checkout:

1. **`reuseExistingServer` grabs whatever is on :3001.** `playwright.config.ts`
   sets `webServer: { command: 'npx next dev -p 3001', reuseExistingServer:
   !process.env.CI }`. If *any* `next dev` is already listening on 3001 — e.g. a
   dev server started hours ago from the **main** checkout — Playwright reuses
   it and silently runs the whole suite against that other checkout's code. Your
   worktree edits are never exercised.

2. **`yarn build` clobbers a running `next dev`.** Both write to the same
   `.next/` directory. Building while a dev server is up corrupts its build
   manifest, so the dev server then serves stale/missing chunks (home page
   `500`, `_next/static/*` `404`) until it's restarted and `.next` is cleared.

## Solution

When validating a UI change from a worktree:

1. Start the worktree's **own** dev server on a distinct free port and point
   Playwright at it via `BASE_URL` (the config reads `BASE_URL` for `baseURL`):

   ```bash
   node .yarn/releases/yarn-*.cjs next dev -p 3005 > /tmp/dev.log 2>&1 &
   BASE_URL=http://localhost:3005 node .yarn/releases/yarn-*.cjs playwright test tests/<spec>
   ```

   The config's `webServer` block still "reuses" whatever is on 3001, but the
   tests navigate to `BASE_URL`, so they hit your server.

2. **Don't `yarn build` while that dev server is running.** If you must build,
   do it first, or restart the dev server afterward: `rm -rf .next` then relaunch.

3. Confirm you're on the right server before trusting a failure: a 404 on the
   new route + a NavBar missing the new link is the tell that you're on a stale
   or foreign server, not a real bug.

## Related

- `AGENTS.md` notes Playwright "reuses an already-running server outside CI" —
  this doc is the worktree-specific consequence.
- [[warframe-worktree-pnp-setup]] — worktrees also need `yarn install` first.
