# Mod Tracking Feature Specification

> **Author:** daedalus | **Date:** 2026-07-07 | **Status:** Design / Planning
>
> Specifies the Mod Tracking feature — a new domain for tracking Warframe mod collection
> (owned/not-owned, rank, duplicates). Follows existing patterns: prebuilt cache + Repository +
> localStorage for user state.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [Data Source: @wfcd/items Mods Category](#3-data-source-wfcditems-mods-category)
4. [Architecture](#4-architecture)
5. [Repository Design](#5-repository-design)
6. [UI Pages](#6-ui-pages)
7. [Dashboard Integration](#7-dashboard-integration)
8. [Edge Cases & States](#8-edge-cases--states)
9. [Implementation Order](#9-implementation-order)
10. [Task Breakdown](#10-task-breakdown)

---

## 1. Overview

Users want to track Warframe mods (like Condition Overload, Primed mods, Galvanized mods) similarly to how they track craftable items and materials.

**Phase 1 scope (this spec):**
- Load mod reference data from `@wfcd/items` (Mods category)
- Mod browser/search page with filters by type, rarity, polarity
- Mod detail page with owned toggle and rank slider
- User collection persisted in localStorage
- Dashboard integration: mod count summary

**Future phases (not in this spec):**
- Duplicate/sell tracking
- Farming state & drop location display
- Loadout integration (which mods equipped where)
- Shopping list / missing mod recommendations

---

## 2. Data Model

### 2.1 Mod (reference data — from WFCD cache)

Stored in the prebuilt cache, read-only.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `id` | string | Generated | App identifier, e.g. `"mod-1"` |
| `name` | string | `@wfcd/items` | In-game mod name (e.g., `"Condition Overload"`) |
| `mod_type` | string | Derived from `type` | Normalized mod category (e.g., `"Warframe Mod"`, `"Rifle Mod"`, `"Shotgun Mod"`, `"Melee Mod"`, `"Pistol Mod"`, `"Archwing Mod"`, `"Sentinel Mod"`, `"Stance Mod"`, `"Aura"`, `"Parazon Mod"`) |
| `polarity` | string | `@wfcd/items` | `"madurai"`, `"vazarin"`, `"naramon"`, `"zenurik"`, `"unairu"`, `"penjaga"`, `"umbra"`, `"universal"`, `""` |
| `rarity` | string | `@wfcd/items` | `"Common"`, `"Uncommon"`, `"Rare"`, `"Legendary"` |
| `base_drain` | integer | `baseDrain` | Base mod drain (before polarity matching) |
| `fusion_limit` | integer | `fusionLimit` | Maximum rank (0-10 typically; 3 for primed, 0 for no rank) |
| `is_prime` | boolean | `isPrime` | Whether this is a Primed mod |
| `is_augment` | boolean | `isAugment` | Whether this is an augment mod |
| `is_umbral` | boolean | Derived from name | `name.includes("Umbral")` — special polarity group |
| `compat_name` | string | `compatName` | Compatible weapon/warframe name (or `null`) |
| `unique_name` | string | `uniqueName` | WFCD uniqueName for cross-referencing |
| `wiki_url` | string | `wikiaUrl` | Warframe wiki URL |

**Not included in v1 (can be added later):**
- `drops` array — drop location data (available in WFCD but out of scope)
- `levelStats` — per-rank stat descriptions
- `tradable` / `transmutable` flags
- `introduced` / `releaseDate`

### 2.2 Mod Collection (user data — localStorage)

Stored under a single `warframe-mod-collection` key.

```json
{
  "mods": {
    "mod-1": { "owned": true, "rank": 5 },
    "mod-42": { "owned": true, "rank": 10 }
  }
}
```

Only mods the user interacts with get entries. A missing key = not owned, rank 0.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `owned` | boolean | false | Whether the user owns this mod |
| `rank` | integer | 0 | Current upgrade rank (0 to `fusion_limit`) |

**Future fields (add later):**
- `duplicates` (integer) — spare copies for trade/sell
- `farming` (boolean) — actively farming
- `equipped_in` (string[]) — loadout ids where this mod is used

---

## 3. Data Source: @wfcd/items Mods Category

### 3.1 Available Data

The installed `@wfcd/items` package exposes a `Mods` category with **1,803 mods**. Each mod object includes:

```js
{
  uniqueName: "/Lotus/Powersuits/Trinity/LinkAugmentCard",
  name: "Abating Link",
  polarity: "zenurik",
  rarity: "Rare",
  baseDrain: 6,
  fusionLimit: 3,
  compatName: "Trinity",
  type: "Warframe Mod",
  levelStats: [{ stats: ["..."] }, ...],
  category: "Mods",
  isAugment: true,
  tradable: true,
  drops: [{ location: "...", type: "Mission", rarity: "Common", chance: 0.125 }],
  wikiaUrl: "https://warframe.fandom.com/wiki/Abating_Link",
  wikiaThumbnail: "...",
  isPrime: false,
  masterable: true,
  transmutable: true,
  introduced: { name: "Update 17.0" }
}
```

### 3.2 Field Mapping

```js
@wfcd/items Mod          →  App Mod
─────────────────────────────────
item.name                 →  name
deriveType(item.type)     →  mod_type
item.polarity || ""       →  polarity
item.rarity || "Common"   →  rarity
item.baseDrain ?? 0       →  base_drain
item.fusionLimit ?? 0     →  fusion_limit
item.isPrime ?? false     →  is_prime
item.isAugment ?? false   →  is_augment
item.name.includes("Umbral") → is_umbral
item.compatName || null   →  compat_name
item.uniqueName           →  unique_name
item.wikiaUrl || null     →  wiki_url
index (sequential)        →  id ("mod-${index}")
```

### 3.3 Type Normalization

The `type` field from WFCD has varied casing and granularity. Normalize:

| Raw type | Normalized mod_type |
|----------|-------------------|
| `"Warframe Mod"` / `"Warframe"` | `"Warframe Mod"` |
| `"Rifle Mod"` / `"Rifle"` | `"Rifle Mod"` |
| `"Shotgun Mod"` / `"Shotgun"` | `"Shotgun Mod"` |
| `"Melee Mod"` / `"Melee"` | `"Melee Mod"` |
| `"Pistol Mod"` / `"Pistol"` | `"Pistol Mod"` |
| `"Archwing Mod"` / `"Archwing"` + variants | `"Archwing Mod"` |
| `"Sentinel Mod"` / `"Sentinel"` / `"Robotic"` | `"Sentinel Mod"` |
| `"Stance Mod"` / `"Stance"` | `"Stance Mod"` |
| `"Aura"` / `"Aura Mod"` | `"Aura"` |
| `"Parazon Mod"` / `"Parazon"` | `"Parazon Mod"` |
| `"Railjack Mod"` / `"Plexus Mod"` | `"Railjack Mod"` |
| Anything else | `"Other"` |

### 3.4 Cache Strategy

The prebuild script (`scripts/prebuild.mjs`) is extended to:

1. Load the `Mods` category from `@wfcd/items`
2. Transform each mod into the app model (filtered fields only)
3. Write to a new file: `public/data/mods-cache.json`
4. Include a `version` and `cachedAt` field matching the existing pattern

File size estimate: 1,803 mods × ~200 bytes each ≈ 360 KB of JSON (vs 7.01 MB raw). This is acceptable for a single fetch.

The ModRepository fetches this file at runtime via `fetch('/data/mods-cache.json')` and caches it in localStorage under key `warframe-mods-cache` for subsequent loads.

---

## 4. Architecture

### 4.1 Component Tree

```
NavBar
  └─ "Mods" link added to NAV_LINKS

/mods (ModsPage — Client Component)
  ├─ Filter bar: type dropdown, rarity dropdown, polarity filter, search input
  ├─ Show owned-only toggle
  ├─ Loading: skeleton cards
  ├─ Empty: "No mods match this filter."
  └─ Card grid (filtered)
       └─ ModCard: name, type badge, rarity indicator, polarity icon, owned checkbox

/mods/[id] (ModDetailPage — Client Component)
  ├─ Loading: skeleton
  ├─ Not found: "Mod not found."
  └─ Detail view:
       ├─ Header: name, type badge, rarity badge, polarity badge
       ├─ Stats: drain, max rank, compat_name
       ├─ Flags: prime/augment/umbral badges
       ├─ Owned toggle (checkbox)
       ├─ Rank slider (0 to fusion_limit, disabled when not owned)
       └─ Wiki link

/ (Dashboard)
  └─ Dashboard Mod Summary (Client Component child)
       ├─ "Mods: 45 / 1,803 owned"
       └─ Loading if mods not yet loaded
```

### 4.2 Data Flow

```
Browser start / navigate to any mods page
  └─ ModRepository.getMods() (or getModById, etc.)
       ├─ await #ensureInitialized()
       │    ├─ localStorage 'warframe-mods-cache' exists + version matches?
       │    │    └─ YES → parse and return
       │    └─ NO
       │         └─ fetch('/data/mods-cache.json')
       │              ├─ Set this.#mods = fetched.mods
       │              ├─ Persist to localStorage with version
       │              └─ Return
       │
       ├─ Merge with user collection from localStorage 'warframe-mod-collection'
       │    ├─ For each mod: mod.owned = collection[mod.id]?.owned ?? false
       │    ├─ For each mod: mod.rank = collection[mod.id]?.rank ?? 0
       │    └─ Return enriched mods
       │
       └─ UI renders with user state
```

### 4.3 Persistence

| Key | Contents | Managed by |
|-----|----------|-----------|
| `warframe-mods-cache` | Versioned mod reference data | ModRepository (read-only) |
| `warframe-mod-collection` | User owned/rank state | ModRepository (read-write) |

### 4.4 Integration Points

| File | Change |
|------|--------|
| `scripts/prebuild.mjs` | Add Mods category loading + transform, write `public/data/mods-cache.json` |
| `src/data/mod-repository.js` | **New file** — ModRepository class |
| `src/data/mod-store.js` | **New file** — singleton export |
| `app/mods/page.jsx` | **New page** — mod list with search/filter |
| `app/mods/[id]/page.jsx` | **New page** — mod detail with owned/rank |
| `app/components/NavBar.jsx` | Add `{ href: '/mods', label: 'Mods' }` to NAV_LINKS |
| `app/page.jsx` | Add `<ModDashboardSection />` client component |
| `src/components/mod-dashboard-section.jsx` | **New component** — dashboard summary |

---

## 5. Repository Design

### 5.1 New Files

**`src/data/mod-repository.js`** — mirrors `LoadoutRepository` pattern:

```js
'use client';

const CACHE_KEY = 'warframe-mods-cache';         // reference data (versioned)
const COLLECTION_KEY = 'warframe-mod-collection'; // user state

export default class ModRepository {
  #mods = [];             // All mods (from cache)
  #collection = {};       // User collection state
  #initialized = false;
  #initPromise = null;
  #version = null;

  constructor() { /* load collection from localStorage on instantiation */ }

  async #ensureInitialized() { /* fetch cache if needed, merge with collection */ }
  async #loadFromServer() { /* fetch /data/mods-cache.json */ }
  #persistCollection() { /* save user collection to localStorage */ }

  async getMods()              → mod[]         // All mods with user state merged
  async getModById(id)         → mod | null
  async getModsByType(type)    → mod[]
  async getModsByRarity(rarity)→ mod[]
  async setModOwned(id, owned) → void         // Toggle owned state
  async setModRank(id, rank)   → void         // Set rank (0 to fusion_limit)
  async getStats()             → { total, owned, unowned }
}
```

**`src/data/mod-store.js`** — singleton:

```js
'use client';
import ModRepository from './mod-repository.js';
const modRepo = new ModRepository();
export default modRepo;
```

### 5.2 Public API

| Method | Returns | Description |
|--------|---------|-------------|
| `getMods()` | `Promise<Mod[]>` | All mods, enriched with user owned/rank |
| `getModById(id)` | `Promise<Mod\|null>` | Single mod |
| `setModOwned(id, owned)` | `void` | Toggle ownership, persists |
| `setModRank(id, rank)` | `void` | Update rank, clamped to `[0, fusion_limit]`, persists |
| `getStats()` | `{total, owned, unowned}` | Quick stats for dashboard |

### 5.3 Data Shape

**`warframe-mods-cache`** (localStorage):
```json
{
  "version": "1.1275.0",
  "cachedAt": "2026-07-07T12:00:00Z",
  "mods": [ ... ]
}
```

**`warframe-mod-collection`** (localStorage):
```json
{
  "mod-1": { "owned": true, "rank": 5 },
  "mod-42": { "owned": true, "rank": 10 }
}
```

---

## 6. UI Pages

### 6.1 `/mods` — Mod Browser

**Route:** `app/mods/page.jsx`
**Type:** Client Component (`'use client'`)

**Layout:**
- Page title: **Mods**
- Filter bar (horizontal row):
  - Search input: filter by name (case-insensitive substring match)
  - Type dropdown: "All Types", "Warframe Mod", "Rifle Mod", ... (populated from distinct mod types in data)
  - Rarity dropdown: "All Rarities", "Common", "Uncommon", "Rare", "Legendary"
  - Polarity filter: buttons/icons for each polarity, multi-select
  - "Show owned only" checkbox
- Results grid:
  - Cards in a responsive grid (2-4 columns)
  - Each card shows:
    - Mod name
    - Type badge (e.g., "Rifle Mod")
    - Rarity indicator (color-coded: Common=gray, Uncommon=green, Rare=gold, Legendary=red-orange)
    - Polarity icon/letter
    - Owned checkbox (click toggles without navigating)
    - Rank display: "R5/10" if owned, "Not owned" if not
  - Card is a link to `/mods/{id}` (click on name/title area)
  - The owned checkbox click is a separate action that doesn't trigger navigation

**States:**
- **Loading**: skeleton cards (3-4 skeleton cards matching grid layout)
- **Empty (no filters)**: "No mods found. Try adjusting your filters." with search hint
- **Empty (all owned)**: "You've collected every mod! 🎉" (when show-owned-only + all owned)
- **Error**: "Failed to load mod data. Please refresh the page."

**Testability:**
- `data-testid="mods-page"`
- `data-testid="mod-search-input"`
- `data-testid="mod-type-filter"`
- `data-testid="mod-rarity-filter"`
- `data-testid="mod-polarity-filter"`
- `data-testid="mod-owned-filter"`
- `data-testid="mod-card-{id}"` on each card
- `data-testid="mod-owned-checkbox-{id}"` on each checkbox
- `data-testid="mod-loading"` skeleton state
- `data-testid="mod-empty"` empty state

### 6.2 `/mods/[id]` — Mod Detail

**Route:** `app/mods/[id]/page.jsx`
**Type:** Client Component (`'use client'`)

**Layout:**
- Back link: "← Back to Mods"
- Header row:
  - Mod name (large)
  - Type badge, rarity badge (color-coded), polarity badge (icon + name)
  - Prime / Augment / Umbral badges (if applicable)
- Stats card:
  - Base drain
  - Max rank (fusion_limit)
  - Compatible with (compat_name, or "All compatible weapons" if null)
- Collection card:
  - Owned toggle: large checkbox or switch with label "Owned"
  - Rank slider (only visible when owned):
    - Min: 0, Max: fusion_limit
    - Shows current value, e.g., "Rank 5 / 10"
    - Slider input element
  - Visual rank dots/bar (styled)
- Wiki link: external link to wiki page

**States:**
- **Loading**: skeleton detail view (title skeleton + two card skeletons)
- **Not found**: "Mod not found." (when mod id doesn't exist)
- **Owned false**: rank slider hidden, "Not owned" text shown
- **Owned true**: rank slider visible, current rank displayed

**Testability:**
- `data-testid="mod-detail-page"`
- `data-testid="mod-detail-name"`
- `data-testid="mod-detail-type-badge"`
- `data-testid="mod-detail-rarity-badge"`
- `data-testid="mod-detail-polarity-badge"`
- `data-testid="mod-detail-stats"`
- `data-testid="mod-detail-owned-toggle"`
- `data-testid="mod-detail-rank-slider"`
- `data-testid="mod-detail-rank-value"`
- `data-testid="mod-detail-wiki-link"`
- `data-testid="mod-detail-loading"`
- `data-testid="mod-detail-not-found"`

### 6.3 Navigation

Add to `NAV_LINKS` in `app/components/NavBar.jsx`:
```js
{ href: '/mods', label: 'Mods' }
```

Puts it between "Loadouts" and "Shopping List" (alphabetical or follow existing order logic).

---

## 7. Dashboard Integration

### 7.1 New Component

**`src/components/mod-dashboard-section.jsx`** — Client Component child embedded in `app/page.jsx`.

**Display:**
- Section title: **Mod Collection**
- Stats row:
  - "X / Y owned" (e.g., "45 / 1,803 owned")
  - Percentage bar: thin progress bar showing owned/unowned ratio
- Quick link: "Browse all mods →" linking to `/mods`

**States:**
- **Loading**: skeleton bar (short pulse bar)
- **Error**: silent — no section shown (mods are optional secondary data)
- **Empty**: "Start tracking your mod collection →" with link to `/mods`

**Testability:**
- `data-testid="mod-dashboard-section"`
- `data-testid="mod-dashboard-stats"`
- `data-testid="mod-dashboard-link"`

---

## 8. Edge Cases & States

| Situation | Resolution |
|-----------|-----------|
| `warframe-mods-cache` version mismatch | Discard cache, re-fetch from `/data/mods-cache.json` |
| `fetch('/data/mods-cache.json')` fails (network error) | Fall back to localStorage cache if it exists (even if version mismatch), otherwise show error state |
| Mod has no `fusionLimit` (null/0) | Show "Unrankable" text, no rank slider |
| User sets rank higher than `fusion_limit` | Clamp to `fusion_limit` in `setModRank()` |
| Mod with no `polarity` | Show "Variable" or hide polarity badge |
| Mod ID doesn't exist in cache | Show "Mod not found." with back link |
| First visit (no cache, no collection) | Empty collection `{}`, all mods show as unowned |
| localStorage corrupt on `warframe-mod-collection` | `try/catch` parse, reset to `{}` |
| `compatName` is very long | CSS `text-overflow: ellipsis` on the card |
| Rare mod filters yield no results | Show "No mods match these filters." with clear-filters hint |
| Mods data is not yet loaded when dashboard renders | Show skeleton; mods are non-critical so dashboard shouldn't block on them |

---

## 9. Implementation Order

1. **Extend prebuild.mjs** — add Mods category, filter/transform, write `public/data/mods-cache.json`
2. **Create ModRepository** — `src/data/mod-repository.js` and `src/data/mod-store.js`
3. **Build Mods list page** — `app/mods/page.jsx` with search/filter + card grid
4. **Build Mod detail page** — `app/mods/[id]/page.jsx` with owned toggle + rank slider
5. **Add navigation** — update `NavBar.jsx` with `/mods` link
6. **Add dashboard integration** — `src/components/mod-dashboard-section.jsx` embedded in home page
7. **Build and test** — run prebuild, verify pages render, test owned/rank persistence
8. **Write unit tests** — ModRepository CRUD, edge cases (corrupt localStorage, version mismatch, clamp rank)

---

## 10. Task Breakdown

### Task 1: Extend prebuild.mjs — Mods category

Extract mods from `@wfcd/items` alongside existing items. Write `public/data/mods-cache.json`.

**Files:** `scripts/prebuild.mjs`
**Acceptance:**
- [ ] Loads `Mods` category from `@wfcd/items`
- [ ] Transforms to app model (name, mod_type, polarity, rarity, base_drain, fusion_limit, etc.)
- [ ] Normalizes mod_type from raw WFCD type field
- [ ] Writes `public/data/mods-cache.json` with version + cachedAt
- [ ] Existing items/materials/tree behavior unchanged
- [ ] Running `node scripts/prebuild.mjs` produces both cache files

**Testability:** `public/data/mods-cache.json` is parseable JSON with expected fields

### Task 2: Create ModRepository + ModStore

Data layer for mods — handles fetching cache, merging with user collection, persisting changes.

**Files:** `src/data/mod-repository.js`, `src/data/mod-store.js`
**Acceptance:**
- [ ] `getMods()` returns all mods enriched with `owned`/`rank` from collection
- [ ] `getModById(id)` returns single mod or null
- [ ] `setModOwned(id, true/false)` persists to localStorage
- [ ] `setModRank(id, rank)` clamps to `[0, fusion_limit]`, persists
- [ ] `getStats()` returns `{ total, owned, unowned }`
- [ ] Lazy init: fetches cache on first call, caches in localStorage
- [ ] Cache version check: mismatched version re-fetches
- [ ] Fallback: network error falls back to local cache, or returns empty array
- [ ] Corrupt collection localStorage resets gracefully to `{}`

**Testability:**
- `data-testid="mod-repo-initialized"` — verify via console or unit test
- Unit tests for collection persistence, version invalidation, rank clamping

### Task 3: Build /mods — Mod browser page

Full-page mod browser with search, filters, and owned toggles.

**Files:** `app/mods/page.jsx`
**Acceptance:**
- [ ] Page title "Mods"
- [ ] Search input filters by name (case-insensitive)
- [ ] Type dropdown filters by mod_type (populated from data)
- [ ] Rarity dropdown filters by rarity
- [ ] Polarity multi-select filter buttons
- [ ] "Show owned only" checkbox
- [ ] Responsive card grid (2-4 columns)
- [ ] Each card: name, type badge, rarity indicator, polarity icon, owned checkbox, rank display
- [ ] Owned checkbox on card toggles without navigation
- [ ] Clicking card name/link navigates to `/mods/{id}`
- [ ] Loading skeleton state
- [ ] Empty state "No mods match this filter."
- [ ] All testid attributes present

### Task 4: Build /mods/[id] — Mod detail page

Single mod view with owned toggle and rank slider.

**Files:** `app/mods/[id]/page.jsx`
**Acceptance:**
- [ ] Back link to `/mods`
- [ ] Header: name, type badge, rarity badge (color-coded), polarity badge
- [ ] Stats card: base_drain, max_rank, compat_name
- [ ] Prime/Augment/Umbral badges if applicable
- [ ] Owned toggle (checkbox/switch)
- [ ] Rank slider (visible when owned): 0 to fusion_limit
- [ ] Rank value display: "Rank X / Y"
- [ ] Rank slider hidden when not owned, shows "Not owned"
- [ ] Wiki link with target="_blank"
- [ ] Loading skeleton
- [ ] "Mod not found." for invalid IDs
- [ ] All testid attributes present

### Task 5: Add navigation and dashboard integration

**Files:** `app/components/NavBar.jsx`, `app/page.jsx`, `src/components/mod-dashboard-section.jsx`
**Acceptance:**
- [ ] NavBar has "Mods" link
- [ ] Dashboard shows "Mod Collection" section
- [ ] Section shows "X / Y owned" count
- [ ] Progress bar showing owned ratio
- [ ] "Browse all mods →" link to `/mods`
- [ ] Loading skeleton on dashboard section
- [ ] Dashboard does NOT block on mod data loading
- [ ] All testid attributes present

### Task 6: Write tests

**Files:** `tests/unit/mod-repository.test.js`, `tests/mods.spec.ts` (Playwright E2E)
**Acceptance:**
- [ ] Unit test: ModRepository getMods returns enriched mods
- [ ] Unit test: setModOwned persists and reflects in getMods
- [ ] Unit test: setModRank clamps to fusion_limit
- [ ] Unit test: corrupt collection resets to {}
- [ ] Unit test: version mismatch triggers re-fetch
- [ ] E2E test: search by name filters results
- [ ] E2E test: owned checkbox toggles on card
- [ ] E2E test: rank slider updates on detail page
- [ ] E2E test: navigation works (NavBar → Mods → Mod detail → back)

---

## Workspace

dir:/home/namal/warframe-todo-tracker
