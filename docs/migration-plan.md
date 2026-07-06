# Warframe TODO Tracker: Vite SPA → Next.js App Router Migration Plan

## 1. Current Architecture Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| Build | Vite + React plugin |
| Router | react-router-dom v6 (`BrowserRouter`) |
| State | Local component `useState` |
| Data | `Repository` class: static arrays + `localStorage` for todos |
| Styling | Global CSS (`src/index.css`) |

### Route Map
- `/` **Home** (static placeholder)
- `/items` **ItemsList** — read-only list with a tracked-only filter checkbox
- `/items/:id` **ItemDetail** — detail view + in-memory track/untrack toggle
- `/sources` **Sources** — grouped material drop sources, highlights via `useLocation().state`
- `/todos` **Todos** — create, edit status, edit notes, delete-implicit; all persisted to `localStorage`

### Data Model
- `items` — 15 rows, static
- `materials` — 31 rows, static
- `sources` — 22 rows, static
- `treeRelationships` — 3 rows, static
- `todos` — 2 seeded rows, mutable via `localStorage` (`warframe-todos`

---

## 2. Component Boundary: Server vs Client

**Rule:** A component is a Server Component unless it uses browser APIs (`localStorage`, `window`), interactivity (`useState`, `useEffect` for mutating ops), or React Router location state. Components that only read static data can be Server Components.

### Recommended Classification

| Component / Route | Classification | Rationale |
|-------------------|----------------|-----------|
| `app/layout.tsx` | Server | Root shell, no client logic |
| `app/page.tsx` (Home) | Server | Pure static markup |
| `app/items/page.tsx` (ItemsList) | **Client** | `useState(showTrackedOnly)` for filtering |
| `app/items/[id]/page.tsx` (ItemDetail) | **Client** | Track/untrack toggle mutates tracked state |
| `app/sources/page.tsx` (Sources) | **Client** | `useLocation().state` highlight from navigation; could be Server if rewritten to use `searchParams`, but the current linking from ItemDetail/Sources→Sources relies on location state in 2 places. |
| `app/todos/page.tsx` (Todos) | **Client** | `useState` + forms + `localStorage` persistence |

> Why not make `ItemsList` a Server Component? The tracked-only filter is live interactivity. A hybrid is possible (Server-rendered list + client filter), but this app's filter logic is tightly coupled to the list render, so the whole page becomes Client for simplicity. If optimization is needed later, extract the list markup into a Server Component child and hydrate filters separately.

> Why not Server Component for `Sources`? The `useLocation().state` highlight is currently the simplest path. It can be refactored later to `searchParams?highlight=`.

### Client Extractions (no boundary change needed)

- `TrackToggle` (`'use client'`) — mutates tracked flag; currently inlined in `ItemDetail`
- `TodoEditor` (`'use client'`) — edit forms used in `Todos`
- `TodoFilter` / `ShowTrackedOnly` (`'use client'`) — the checkbox in `ItemsList`

---

## 3. Data Layer Redesign for SSR

### Problem
`Repository` reads/writes `localStorage` in its constructor and mutator methods. Server Components cannot access `localStorage`, so the repository must be split.

### New Layout

```
lib/
  seed-data.ts          # Static arrays: items, materials, sources, treeRelationships, todos
  store.ts              # Client-only: localStorage read/write + in-memory cache
  repo.ts               # Thin façade that detects env and delegates to seed or store
```

#### `lib/seed-data.ts` (Server-safe)

```ts
export const items = [ ...seedItems ];
export const materials = [ ...seedMaterials ];
export const sources = [ ...seedSources ];
export const treeRelationships = [ ...seedTreeRelationships ];
export const todos = [ ...seedTodos ];
```

#### `lib/store.ts` (Client-only, `'use client'`)

```ts
'use client';

const STORAGE_KEY = 'warframe-todos';

export function getTodos() { ... localStorage read ... }
export function persistTodos(todos) { ... localStorage write ... }
export function getAllItems() { ... return items.map(clone) ... }
// read-only static data copied/imported from seed-data for convenience
```

#### `lib/repo.ts` (Legacy shim)

Keep a thin `Repository` class during migration that delegates to `getTodos`/`persistTodos` client-side and falls back to `seedData` server-side.

### SSR Approach for Todos

Because todos are user-generated, they **cannot** be SSRed from the server after the first visit without authentication. The practical path is:

1. **First render (server / static export):** show a loading state for the `/todos` page.
2. **Client hydration:** `useEffect` reads `localStorage`, hydrates the list, renders data.
3. **Alternative for static hosting:** export static; todos page is entirely client-hydrated.

If full SSR of todos is desired later, introduce:
- A database backend (SQLite / Turso / Vercel Postgres)
- A Next.js Route Handler (`app/api/todos/route.ts`)
- Client fetches from `/api/todos` and the server prerenders a shell.

---

## 4. Folder Structure

```
warframe-todo-tracker/
  app/
    layout.tsx
    page.tsx
    global.css
    items/
      page.tsx
      [id]/
        page.tsx
    sources/
      page.tsx
    todos/
      page.tsx
  components/
    client/
      TrackToggle.tsx
      TodoEditor.tsx
      TodoList.tsx
      FilterBar.tsx
    shared/
      Nav.tsx
  lib/
    seed-data.ts
    store.ts
    types.ts
  public/
  next.config.ts
öll  tsconfig.json
```

### Old → New Map
| Old | New |
|-----|-----|
| `src/App.jsx` | `components/shared/Nav.tsx` + `app/layout.tsx` |
| `src/pages/Home.jsx` | `app/page.tsx` |
| `src/pages/ItemsList.jsx` | `app/items/page.tsx` |
| `src/pages/ItemDetail.jsx` | `app/items/[id]/page.tsx` |
| `src/pages/Sources.jsx` | `app/sources/page.tsx` |
| `src/pages/Todos.jsx` | `app/todos/page.tsx` |
| `src/data/repository.js` | `lib/store.ts` |
| `src/data/seed.js` | `lib/seed-data.ts` |
| `src/main.jsx` | Removed (Next.js entrypoint) |
| `src/index.jsx` | Removed |
| `src/index.css` | `app/global.css` |
| `vite.config.js` | `next.config.ts` |

---

## 5. Routing Changes

### Current (Vite / react-router-dom)
BrowserRouter with `<NavLink>` and `<Routes><Route ...>`

### Next.js App Router
File-system routes. `NavLink` → `<Link>` from `next/link`. No router config file.

**Preserved semantics:**
- `/items/:id` parameter access via `params.id`
- `/sources` highlight from links: currently uses `state={{ material }}`; in App Router this becomes `href="/sources?highlight=Alloy+Plate"` and read via `searchParams`.
- Active nav state: Next.js `usePathname()` in a Server Component + `<Link className={...}>`.

---

## 6. Build Configuration

### `next.config.ts`
```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',         // static export; remove for Node SSR
  images: { unoptimized: true },
  trailingSlash: true,
};

export default config;
```

### `tsconfig.json` (incremental baseline)
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  }
}
```

> Keep `strict: false` initially to match existing loose typing, then tighten after verification.

### Dependencies
```json
{
  "dependencies": {
    "next": "^14",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.15",
    "@types/react-dom": "^18.2.7",
    "typescript": "^5",
    "@types/node": "^20"
  }
}
```

Remove: `vite`, `@vitejs/plugin-react`, `react-router-dom`, `eslint-plugin-react-refresh`.

---

## 7. Styling Strategy

Current `src/index.css` is global. Next.js supports global CSS **only** in `app/global.css` (imported in `layout.tsx`). Copy `index.css` content verbatim; no CSS modules migration needed.

If component-scoped styles are desired later, migrate to Tailwind or CSS Modules on a per-component basis.

---

## 8. Step-by-Step Migration

1. **Scaffold** `npx create-next-app@latest` with TypeScript + App Router into a temp dir, then copy `app/`, `components/`, `lib/`, `next.config.ts`, `tsconfig.json` into the project root replacing `/src`.
2. **Extract seed data**: port every row from `seed.js` into `lib/seed-data.ts` as typed objects.
3. **Port `store.ts`**: add `'use client'`, wrap `localStorage` reads/writes, re-export read-only seed slices.
4. **Port layout and home**: `app/layout.tsx` + `app/page.tsx`.
5. **Port `Nav`**: shared nav component using `next/link` and `usePathname`.
6. **Port `ItemsList`**: keep as Client Component; use `store.ts` instead of repo.
7. **Port `ItemDetail`**: Client Component; `useParams()` for `id`; call `store.ts` getters.
8. **Port `Sources`**: change highlight from `useLocation().state` to `searchParams`; can remain Client for now.
9. **Port `Todos`**: full Client Component; same creation/edit logic.
10. **Remove old artifacts**: `src/`, `vite.config.js`, `react-router-dom` code.
11. **Verify**: `npm run dev`, navigate all routes, toggle tracking, create/edit todos, sources highlight.

---

## 9. Risks & Decisions

| Risk | Mitigation |
|------|-----------|
| `localStorage` hydration mismatch | Use loading skeleton on `/todos`; only show data after `useEffect` hydrates |
| Old link state in `/sources` breaks | Replace with query-string highlight; update callers in `ItemDetail` and `Sources` |
| Static export disables dynamic APIs | If true SSR later, drop `output: 'export'` and deploy to Node/Vercel |
| Large seed strings in server components | Keep `seed-data.ts` as module-scope exports; no runtime parsing |

---

## 10. Complexity Assessment

**Medium.** The app is small (~6 views, 1 data class). The main challenge is the client-only `localStorage` coupling and the `useLocation` highlight. No authentication, API layer, or external fetch is required.

**Recommended execution order:**
1. Extract static data + client store (easy, low-risk)
2. Migrate layout, nav, home (trivial wins)
3. Migrate read-only pages (Static shell)
4. Migrate interactive pages (`todos` last because it owns persistence)
