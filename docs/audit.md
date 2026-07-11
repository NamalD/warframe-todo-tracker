# Architecture Audit — Warframe TODO Tracker

Date: 2026-07-11

## Application Profile

- **Type:** Server-rendered React app (Next.js 14 App Router)
- **Framework:** Next.js 14 with React 18
- **Backend:** Next.js API Route Handlers
- **Database:** SQLite via `better-sqlite3` (`data/warframe.db`)
- **API calls:** Client-side fetch to local `/api/*` routes for user data; static JSON for reference data
- **Authentication:** Session-based via `jose` JWTs, optional password gate

## Build Requirements

- Node.js ≥ 18 (uses node:22-alpine in Docker)
- Yarn 4 (uses `node-modules` linker in Docker; PnP locally per `.yarnrc.yml`)
- No git dependency

## Build Output

- `yarn build` → Next.js standalone output in `.next/`
- `.next/standalone/` — Node.js server bundle
- `.next/static/` — client JS/CSS chunks
- `public/` — static assets including prebuilt `public/data/*.json`

## Runtime Requirements

- **Server:** Node.js 22+ (standalone Next.js server)
- **Port:** 3000
- **Environment variables:** `PASSWORD`, `SESSION_SECRET`, `DATA_DIR` (optional)
- **Filesystem:** Write access to `DATA_DIR` for SQLite DB (`warframe.db`) and prebuild cache
- **Network:** No outbound API calls at runtime

## Docker Image Design

- **Builder:** node:22-alpine — installs deps, runs Next.js build
- **Runtime:** node:22-alpine — runs standalone Next.js server
- **Port:** 3000
- **Volumes:** `DATA_DIR` must be persisted (bind mount or named volume) to survive container recreation
