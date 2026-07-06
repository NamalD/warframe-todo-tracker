# Docker Runtime Audit — Warframe TODO Tracker

Date: 2026-07-06

## Application Profile

- **Type:** Client-side SPA (React)
- **Framework:** React 18 + React Router, built with Vite
- **Backend:** None — fully client-side
- **Database:** None — state stored in browser localStorage
- **API calls:** None at runtime (seed data is bundled)

## Build Requirements

- Node.js ≥ 18 (uses node:20-alpine in Docker)
- npm (for `npm ci` and `npm run build`)
- No git dependency (unlike the Task-Checklist, no commit hash injection)

## Build Output

- `npm run build` → static assets in `dist/`
- `dist/index.html` — entry point (~0.44 KB)
- `dist/assets/index-*.js` — bundled JS (~190 KB)
- `dist/assets/index-*.css` — bundled CSS (~2.94 KB)

## Runtime Requirements

- **Server:** Any static file server with SPA fallback (nginx, caddy, etc.)
- **SPA routing:** Server must serve `index.html` for all unknown routes (handled by nginx `try_files`)
- **Port:** 80 (configurable)
- **Environment variables:** None required
- **Filesystem:** Read-only, no persistence needed
- **Network:** No outbound API calls at runtime

## Docker Image Design

- **Builder:** node:20-alpine — installs deps, runs build
- **Runtime:** nginx:alpine — serves static files on port 80 with SPA routing
- **Base path:** `/` (nginx serves from root; app's Vite base path `/warframe-todo-tracker/` is handled client-side)
