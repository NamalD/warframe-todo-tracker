# @wfcd/items Integration Specification

> **Author:** daedalus | **Date:** 2026-07-06 | **Status:** Design / Planning
>
> Replaces static `src/data/seed.js` (674 items, 800 KB of hand-curated JS) with the auto-updated
> `@wfcd/items` npm package, which sources data directly from Warframe's mobile API.

---

## Table of Contents

1. [Current State](#1-current-state)
2. [@wfcd/items API Surface](#2-wfcditems-api-surface)
3. [Target Categories](#3-target-categories)
4. [Data Transform: WFCD → App Model](#4-data-transform-wfcd--app-model)
5. [Repository Redesign](#5-repository-redesign)
6. [Performance & Bundle Strategy](#6-performance--bundle-strategy)
7. [Source Data (Drops)](#7-source-data-drops)
8. [Migration Plan](#8-migration-plan)
9. [Architecture Diagram](#9-architecture-diagram)
10. [Implementation Tasks](#10-implementation-tasks)

---

## 1. Current State

### 1.1 Data Files

| File | Size | Contents |
|------|------|----------|
| `src/data/seed.js` | 807 KB / 28,192 lines | Hardcoded items (674), materials (2,384), sources (169), tree relationships, seed todos |
| `src/data/repository.js` | 6.5 KB / 250 lines | Class that loads seed + localStorage; CRUD for items, materials, todos, material inventory |
| `src/data/store.js` | 110 bytes | Singleton: `export default new Repository()` |
| `src/data/loadout-repository.js` | 8.8 KB / 296 lines | Separate localStorage-backed loadout CRUD (unaffected by this change) |

### 1.2 App Data Model

**items:**
```
{
  id: "item-1",
  name: "Ash",
  item_type: "warframe",           // one of: warframe, primary, secondary, melee
  mastery_rank_required: 0,
  is_user_tracked: false,           // user toggle
  blueprint_source: "market",       // "market" | "drop" | "dojo" | "quest" | "event"
  wiki_url: "https://wiki.warframe.com/w/Ash",
  created_at: ISO8601,
  updated_at: ISO8601
}
```

**materials:**
```
{
  id: "mat-1",
  craftable_item_id: "item-1",
  material_name: "Chassis",
  quantity_required: 1,
  wiki_url: "https://wiki.warframe.com/w/Chassis",
  created_at: ISO8601
}
```

**sources:**
```
{
  id: "src-1",
  material_name: "Alloy Plate",
  source_name: "Gabii",
  source_type: "mission",           // "mission" | "drop" | "vendor" | "trade"
  location_details: "Ceres (Dark Sector Survival)",
  drop_chance_pct: 15.0,
  is_user_tracked: false,
  created_at: ISO8601
}
```

**treeRelationships:**
```
{
  id: "tree-1",
  parent_item_id: "item-2",
  child_item_id: "item-3",
  quantity_required: 2
}
```

### 1.3 Repository Public API (exercise surface)

```js
// Items
repo.getAllItems()           → item[]
repo.getItemById(id)         → item | null
repo.updateItem(id, updates) → item | null

// Materials (nested under items)
repo.getMaterialsForItem(id) → material[]

// Sources
repo.getAllSources()           → source[]
repo.getSourcesForMaterial(name) → source[]

// Tree
repo.getTreeForItem(id)        → {children, parents}

// Todos (user data — persist unchanged)
repo.getTodos() / addTodo() / updateTodoStatus() / updateTodoNotes() / deleteTodo()

// Material Inventory (user data — persist unchanged)
repo.getMaterialInventory() / getOwnedQuantity(name) / setOwnedQuantity(name, qty)

// Server sync
repo.syncFromServer()
```

### 1.4 Consumers (pages that call repo)

| Route | Calls |
|-------|-------|
| `app/page.jsx` (Dashboard) | `getAllItems()`, `getMaterialsForItem(id)`, `getTodos()`, `syncFromServer()` |
| `app/items/page.jsx` | `getAllItems()` |
| `app/items/[id]/page.jsx` | `getItemById(id)`, `getMaterialsForItem(id)`, `getTreeForItem(id)`, `getMaterialInventory()`, `setOwnedQuantity(name, qty)`, `updateItem(id, updates)` |
| `app/sources/page.jsx` | `getAllSources()` |

---

## 2. @wfcd/items API Surface

### 2.1 Constructor

```js
import Items from '@wfcd/items';

const items = new Items({
  category: ['Warframes', 'Primary', 'Secondary', 'Melee', 'Resources'],
  i18n: false,
  i18nOnObject: false,
});
```

`Items` extends `Array<Item>`, so `items` is an array with extra properties:
- `items.options` — the options object
- `items.i18n` — i18n bundle (undefined when i18n=false)

### 2.2 Category File Sizes (v1.1275.0)

| Category | File Size | Relevance |
|----------|-----------|-----------|
| Warframes | 4.62 MB | High |
| Primary | 2.16 MB | High |
| Secondary | 2.22 MB | High |
| Melee | 2.68 MB | High |
| Resources | 406 KB | Medium (may help resolve component names to resources) |
| Arcanes | 355 KB | Low |
| Mods | 7.01 MB | None (not tracked) |
| Relics | 8.71 MB | None |
| Skins | 4.92 MB | None |

**Core four categories ≈ 11.7 MB** of JSON that must be loaded before the app renders.

### 2.3 Relevant Item Shape (from TypeScript definitions)

All craftable items (Warframes, weapons) extend these key interfaces:

```ts
// From Buildable interface
{
  masteryReq?: number;          // Mastery rank required
  buildPrice?: number;          // Credit cost to build
  buildQuantity?: number;       // Quantity produced (usually 1)
  buildTime?: number;           // Build time in seconds
  skipBuildTimePrice?: number;  // Platinum rush cost
  consumeOnBuild?: boolean;     // Whether the item is consumed
  components?: Array<{          // ← THIS IS THE MATERIALS LIST
    uniqueName: string;         //   e.g. "/Lotus/Types/Items/MiscItems/OrokinCell"
    itemCount: number;          //   quantity required
  }>;
  marketCost?: number;          // Platinum cost from market
  bpCost?: number;              // Blueprint credit cost
  itemCount?: number;
}

// From WikiaItem interface
{
  wikiaThumbnail?: string;
  wikiaUrl?: string;            // Full wiki URL ← maps to our wiki_url
  tags?: string[];
  introduced?: { name: string; url: string; aliases?: string[] };
  wikiAvailable?: boolean;
}

// From BaseItem / MinimalItem
{
  uniqueName: string;           // e.g. "/Lotus/Powersuits/Ash/Ash"
  name: string;                 // "Ash"
  category: string;             // "Warframes" | "Primary" | "Secondary" | "Melee" | ...
  type?: string;                // e.g. "Warframe" (not always present)
  tradable: boolean;
  imageName?: string;           // For CDN: https://cdn.warframestat.us/img/${imageName}
  description?: string;
  isPrime?: boolean;
  vaulted?: boolean;
  productCategory?: string;    // e.g. "LongGuns", "Pistols", "WarframeSuits"
  drops?: Array<{              // Drop location data
    location: string;
    type: string;
    rarity?: string;
    chance?: number;
    rotation?: string;
  }>;
  parents?: string[];          // uniqueNames of parent items
}
```

### 2.4 Key Observations

- **`components` is the materials list**: Each component has `uniqueName` (a path slug) and `itemCount`. We must resolve `uniqueName` to a human-readable name by looking up that item elsewhere in the array.
- **`drops` provides source data**: We previously had hand-curated sources. Now we can derive them from `drops` on each item. However, `drops` is on the *item* (the Warframe part, e.g. "Ash Chassis Blueprint"), not on raw materials like "Orokin Cell". Resources.json may have `drops` for raw resources.
- **`parents` provides craft tree**: Items like "Nikana Prime" list their required upstream items via `parents`.
- **No direct `blueprint_source` field**: The current app's `blueprint_source` (market/drop/dojo/quest) must be **derived** from:
  - `productCategory` presence → probably market-buyable
  - `drops` presence → dropped in missions
  - We may need heuristics; the field may also become less critical
- **`wikiaUrl` is the old Fandom wiki URL**: The app currently uses `wiki.warframe.com` URLs. These are *different*. We should normalize: use `wikiaUrl` if present, else construct from `https://wiki.warframe.com/w/${name}`.

### 2.5 Constructor Behavior

The `Items` constructor (and its individual category loaders) uses **synchronous `require()` / dynamic `import()`** internally to load JSON files from `node_modules/@wfcd/items/data/json/`. This means:

- The data files are on disk in `node_modules` — they can be loaded at runtime
- In a Next.js bundler context, webpack will try to bundle them unless excluded
- The constructor is synchronous (reads from disk/cache synchronously)
- When initialized with specific categories (not 'All'), only those files are loaded

---

## 3. Target Categories

We load these four categories:

| Category | Mapped item_type | Filtered for craftability |
|----------|-----------------|--------------------------|
| `Warframes` | `"warframe"` | Keep items with `components` array AND `buildPrice` |
| `Primary` | `"primary"` | Keep items with `components` array |
| `Secondary` | `"secondary"` | Keep items with `components` array |
| `Melee` | `"melee"` | Keep items with `components` array |

### Filtering to Craftable Items Only

Many items in these categories are **not craftable** — they include Prime parts (from relics), Syndicate weapons (purchasable), and Kuva/Tenet variants. To match the app's purpose, we keep only items where:

```js
item.components && item.components.length > 0
```

This excludes:
- Prime parts (components are relics, not sub-components)
- Event reward weapons
- Pure market-purchase weapons with no build process

Additional filtering we may want:
- Exclude items where `productCategory === 'SentinelWeapons'` (sentinel weapons aren't player-craftable items in the typical sense)
- Exclude items where `category === 'Archwing'` (unless we want archwing as item_type)

---

## 4. Data Transform: WFCD → App Model

### 4.1 Item Mapping

```
@wfcd/items Item                    →  App Item
─────────────────────────────────────────────────
item.name                            →  name
item.category                        →  item_type (lowercased: "Warframe" → "warframe")
item.masteryReq ?? 0                 →  mastery_rank_required
false                                →  is_user_tracked (always fresh; persisted in localStorage overlay)
deriveBlueprintSource(item)          →  blueprint_source
item.wikiaUrl ?? constructWiki(name) →  wiki_url
now()                                →  created_at
now()                                →  updated_at
index (sequential)                   →  id ("item-${index}")
```

### 4.2 `deriveBlueprintSource(item)` Heuristic

Since `@wfcd/items` has no direct "blueprint_source" field, derive it:

| Condition | blueprint_source |
|-----------|-----------------|
| `item.productCategory` is set AND `item.drops` is empty/absent | `"market"` |
| `item.drops` array has at least one entry with type `"Mission"` | `"drop"` |
| Item name contains "Vandal" or "Wraith" | `"event"` |
| Default | `"market"` |

Note: This heuristic is approximate. The `blueprint_source` field is mainly used for display in the item list card — it shows "Blueprint: market" or "Blueprint: drop". Post-migration, we may want to enrich this with a more nuanced classification, but the heuristic above is sufficient for v1.

### 4.3 Material Mapping (flattening `components`)

For each craftable item, iterate `item.components`:

```
component.uniqueName  →  resolveName(uniqueName)    →  material_name
component.itemCount   →  quantity_required
constructWiki(name)   →  wiki_url
now()                 →  created_at
```

**Critical: `resolveName(uniqueName)`** — `component.uniqueName` is a path like `"/Lotus/Types/Items/MiscItems/OrokinCell"`. We must resolve this to the human-readable name "Orokin Cell". Strategy:

1. Build a **lookup map** at transform time: `Map<uniqueName, item>` from all loaded items.
2. For each component's `uniqueName`, look up the corresponding item and use its `name` field.
3. If not found in the map (some uniqueNames refer to items not in our loaded categories), extract the last path segment as a fallback: `uniqueName.split('/').pop()` → `"OrokinCell"`, then camelCase-split to `"Orokin Cell"`.

Additionally, some components refer to **the same item we're crafting** (sub-components, like "Chassis", "Neuroptics", "Systems" for Warframes). These are intermediate craftable items. We need to handle these:

- Store the component entry as a material **with its `uniqueName`** so the frontend can look it up.
- Add a `component_unique_name` field to the material model for these intermediate entries.

### 4.4 Updated Material Model

```
{
  id: "mat-${seq}",
  craftable_item_id: "item-${parentSeq}",
  material_name: "Orokin Cell",
  component_unique_name: "/Lotus/Types/Items/MiscItems/OrokinCell",  // NEW
  quantity_required: 1,
  wiki_url: "https://wiki.warframe.com/w/Orokin_Cell",
  is_intermediate: false,        // NEW: true if this is itself a craftable item
  created_at: ISO8601
}
```

### 4.5 Crafting Tree from `parents`

Items that are sub-components (e.g., "Ash Chassis") have a `parents` array pointing to the item they belong to (e.g., "Ash"). We build treeRelationships from this:

```
item.parents[i]  →  find item with matching uniqueName  →  parent_item_id
current item.id  →  child_item_id
1                →  quantity_required (default, since parents only indicates lineage, not count)
```

Note: This is a **partial** tree — it captures Warframe part → Warframe relationships but not weapon component → sub-component trees. Since the current app's tree view is already sparse, this is an improvement over hand-curated data.

---

## 5. Repository Redesign

### 5.1 Key Changes

The Repository no longer imports from `seed.js`. Instead, it:

1. **Lazy-loads** items from `@wfcd/items` on first access.
2. **Transforms** the raw WFCD items into the app model.
3. **Caches** the transformed data in `localStorage` for subsequent loads.
4. **Maintains** the same public API — no consumer changes needed.

### 5.2 New Private Fields & Methods

```js
class Repository {
  // Existing: items, materials, sources, treeRelationships, todos, materialInventory

  #initialized = false;     // Has lazy init completed?
  #initPromise = null;      // Promise for concurrent init calls
  #packageVersion = null;   // version of @wfcd/items we last cached (for invalidation)

  async #ensureInitialized() {
    // Guard: if already initialized, return immediately
    // Guard: if init in progress, await existing promise
    // 1. Check localStorage for cached version
    // 2. If version mismatch or no cache → load & transform
    // 3. Store transformed data + version in localStorage
  }

  #loadAndTransform() {
    // 1. Dynamic import Items from '@wfcd/items'
    // 2. new Items({ category: ['Warframes', 'Primary', 'Secondary', 'Melee'] })
    // 3. Build uniqueName → item lookup map
    // 4. Filter to craftable items (has components)
    // 5. Map each item → app item shape
    // 6. Flatten components → materials
    // 7. Build tree relationships from parents
    // 8. Set this.items, this.materials, this.treeRelationships
    // 9. Persist to localStorage with version stamp
  }
}
```

### 5.3 Public API — What Stays, What Changes

| Method | Change | Notes |
|--------|--------|-------|
| `getAllItems()` | Unchanged | Returns `[...items]` — but items now live in `this.items` set by `#ensureInitialized` |
| `getItemById(id)` | Unchanged | |
| `updateItem(id, updates)` | Unchanged | `is_user_tracked` toggle still works, persists to localStorage |
| `getMaterialsForItem(id)` | Unchanged | Filter logic unchanged |
| `getAllSources()` | **Changed** | Sources are no longer a separate table. Instead, derive them from item `drops` at query time or return an empty array with a deprecation note |
| `getSourcesForMaterial(name)` | **Changed** | Same — sources are now derived from `drops` on individual items. For v1 of this migration, we may keep the sources table as-is from the old format in localStorage, or degrade gracefully |
| `getTreeForItem(id)` | Unchanged | Filter logic unchanged; data now built from `parents` |
| `getTodos()` / `addTodo()` / etc. | Unchanged | User data — no changes |
| `getMaterialInventory()` / etc. | Unchanged | User data — no changes |

### 5.4 Sources Strategy

The current static `sources` data in seed.js (169 sources) is sparse and mostly placeholder ("Obtained from missions and enemies", 10% chance). The `@wfcd/items` `drops` field is richer and auto-updated.

**Decision: Phase out the separate sources table.** Instead:

1. Each material entry gets an `item_unique_name` field pointing back to its source item's `uniqueName`.
2. When the frontend requests sources for a material, we look up the item by `component_unique_name` and return its `drops`.
3. The Sources page (`app/sources/page.jsx`) is refactored to accept this new shape.

**For v1 migration:** Keep `getAllSources()` returning an empty array. The Sources page shows "Sources not yet available — coming in a follow-up release." This prevents blocking the core items/materials migration on the sources feature.

### 5.5 Initialization Flow

```
User visits any page
  └─ repo.getAllItems() (or any data method)
       └─ await #ensureInitialized()
            ├─ Cached in localStorage (version matches)?
            │    └─ YES → parse from localStorage, set this.items etc., return
            └─ NO
                 └─ #loadAndTransform()
                      ├─ const Items = await import('@wfcd/items')
                      ├─ const raw = new Items({ category: ['Warframes', 'Primary', 'Secondary', 'Melee'] })
                      ├─ Build lookup map (uniqueName → raw item)
                      ├─ Filter to craftable (has components)
                      ├─ Transform items, materials, tree relationships
                      ├─ Persist to localStorage with version stamp
                      └─ Return
```

### 5.6 localStorage Caching Strategy

```
Key: "warframe-items-cache"
Value: {
  version: "1.1275.0",          // @wfcd/items package version
  cachedAt: ISO8601,
  items: [...],                  // transformed app items
  materials: [...],              // flattened materials
  treeRelationships: [...]       // from parents
}
```

Cache invalidation:
- On load, compare `cache.version` to the installed `@wfcd/items` version (from `package.json` or runtime check)
- If versions mismatch → discard cache, re-transform
- If cache missing → re-transform
- User can clear cache by clearing localStorage

---

## 6. Performance & Bundle Strategy

### 6.1 The Core Problem

`@wfcd/items` ships 32+ MB of JSON files in `node_modules`. The four categories we need are ~12 MB. If webpack bundles these into the client JS, the first-load JS bundle balloons by 12 MB — unacceptable.

### 6.2 Solution: Dynamic Import + webpack Ignore

**Step 1: Mark the package as external**

In `next.config.js`:
```js
module.exports = {
  webpack: (config, { isServer }) => {
    // Don't bundle @wfcd/items — it loads JSON at runtime from node_modules
    config.externals.push({
      '@wfcd/items': 'commonjs @wfcd/items'
    });
    return config;
  }
};
```

**Step 2: Load at runtime**

```js
// In repository.js, not at module scope:
async #loadAndTransform() {
  // Dynamic import — webpack won't bundle; it's resolved at runtime
  const Items = (await import('@wfcd/items')).default;
  const raw = new Items({ category: ['Warframes', 'Primary', 'Secondary', 'Melee'] });
  // ...
}
```

This approach means:
- The `@wfcd/items` package is a runtime dependency (must be in `node_modules` in production)
- The JSON files are loaded from disk at runtime on the client (works because Next.js serves `node_modules` from `_next/static` or the filesystem)
- Initial bundle size is unaffected

### 6.3 Alternative: Static Extraction (Build-Time)

If dynamic import is unreliable (Next.js 14 + app router edge cases), a **build script** can extract data at build time into a smaller pre-processed file:

```
scripts/prebuild.mjs
  1. require('@wfcd/items')
  2. new Items({ category: [...] })
  3. Filter + transform
  4. Write to public/data/items.json (~500 KB compressed)
```

The app then fetches `public/data/items.json` at runtime via `fetch('/data/items.json')`. This approach:
- Pros: No runtime dependency on `@wfcd/items` in production, smaller payload, works with static export
- Cons: Adds a build step, data is stale until next build (not auto-updated)

### 6.4 Recommended Approach (v1)

Use **dynamic import** (Section 6.2). The package is designed for this pattern — its constructor reads files from disk at runtime. If issues arise in production, fall back to the static extraction approach.

### 6.5 Performance Numbers

| Phase | Time (est.) | Notes |
|-------|------------|-------|
| `import('@wfcd/items')` | < 50ms | Module load, cached by Node |
| `new Items({ category: [...] })` | 200-500ms | Reads & parses 4 JSON files (~12 MB) |
| Transform (map 500+ items) | < 50ms | Pure JS, no I/O |
| localStorage serialize | < 20ms | ~200 KB of transformed data |
| **First load total** | **~300-600ms** | One-time cost |
| Subsequent loads (cached) | < 10ms | Parse from localStorage |

The 300-600ms first-load cost is acceptable — it happens once per package version update. The app should show a loading skeleton during init.

---

## 7. Source Data (Drops)

### 7.1 The `drops` Field

Many items in `@wfcd/items` have a `drops` array:

```json
{
  "drops": [
    {
      "location": "Void/Hepit",
      "type": "Mission",
      "rarity": "Common",
      "chance": 0.125,
      "rotation": "A"
    }
  ]
}
```

For **resources** (loaded from `Resources` category), `drops` provides farming locations. For **Warframe parts** (e.g., "Ash Neuroptics Blueprint"), `drops` provides relic/rotation data.

### 7.2 Mapping to App Sources Model

```
{location, type, rarity, chance}  →  {
  material_name: (resolved from the item),                          // "Orokin Cell"
  source_name: location,                                            // "Void/Hepit"
  source_type: type.toLowerCase(),                                  // "mission"
  location_details: `${rarity} (${rotation || 'any rotation'})`,   // "Common (A)"
  drop_chance_pct: chance * 100,                                    // 12.5
  is_user_tracked: false,
  created_at: now()
}
```

### 7.3 Implementation Plan for Sources

The sources feature is **not in scope for v1** of the wfcd integration. The current `getAllSources()` and `getSourcesForMaterial()` methods will return empty arrays. A follow-up task will:

1. Add `Resources` category to the loaded categories
2. Build a material_name → drops lookup at transform time
3. Implement source derivation in the repository
4. Update the Sources page UI

---

## 8. Migration Plan

### 8.1 Preserving User Data

User data that MUST survive the migration:

| Storage Key | Contents | Action |
|-------------|----------|--------|
| `warframe-todos` | User's todo list | **Keep** — no changes needed |
| `warframe-materials-inventory` | Owned material quantities | **Keep** — keyed by material_name, persists across migration |
| `warframe-items` | Current localStorage items cache | **Replace** — old format, discard |
| `warframe-loadouts` | Loadout data | **Keep** — separate repository, unaffected |

### 8.2 Migration Steps

1. **Install** `@wfcd/items` as a dependency: `npm install @wfcd/items`
2. **Add** webpack external config in `next.config.js`
3. **Rewrite** `src/data/repository.js`:
   - Remove `import { seedItems, seedMaterials, ... } from './seed.js'`
   - Add `#ensureInitialized()`, `#loadAndTransform()`
   - Update constructor to call `#ensureInitialized()` lazily
   - All public method signatures remain identical
4. **Update** all consumers (Dashboard, Items, Item Detail, etc.) to `await` repo initialization:
   - Change `repo.getAllItems()` to `await repo.getAllItems()` (or keep sync by making repo block internally)
5. **Mark** `getAllSources()` / `getSourcesForMaterial()` as returning empty arrays with a comment: `// TODO: wfcd sources — see docs/wfcd-integration.md §7`
6. **Test** full app flow: Dashboard → Items → Item Detail → Track/untrack → Material inventory
7. **Delete** or archive `src/data/seed.js`
8. **Update** any tests that reference seed data

### 8.3 Rollback Plan

If the integration fails in production:

1. `git revert` the migration commit
2. Re-deploy — the old seed.js data is still in git history
3. User todos and material inventory survive because they use separate localStorage keys
4. Any `is_user_tracked` state set during the wfcd period is lost (user must re-track)

### 8.4 Gradual Rollout

For safety, implement a **feature flag**:

```js
// In repository.js constructor
const USE_WFCD = process.env.NEXT_PUBLIC_USE_WFCD === 'true';
if (USE_WFCD) {
  // Use @wfcd/items
} else {
  // Fall back to seed.js
}
```

This allows deploying the code while keeping seed.js as a fallback until we're confident.

---

## 9. Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                     Browser (Client)                      │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐             │
│  │ Dashboard│  │  Items   │  │ Item Detail│  ...pages   │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘             │
│       │              │              │                     │
│       └──────────────┼──────────────┘                     │
│                      │                                    │
│              ┌───────▼────────┐                          │
│              │  Repository    │                          │
│              │  (singleton)   │                          │
│              │                │                          │
│              │  #ensureInit() │──► localStorage cache    │
│              │  #loadTransfm()│      (versioned)         │
│              │                │                          │
│              │  getAllItems() │◄── transformed items     │
│              │  getMaterials()│◄── flattened materials   │
│              │  getTree()     │◄── parent relationships  │
│              │  getTodos()    │◄── localStorage todos    │
│              │  getInventory()│◄── localStorage inv      │
│              └───────┬────────┘                          │
│                      │                                    │
│              ┌───────▼────────┐                          │
│              │  @wfcd/items   │ (dynamic import)         │
│              │  node_modules  │                           │
│              │                │                           │
│              │  /data/json/   │                           │
│              │  Warframes.json│  4.62 MB                 │
│              │  Primary.json  │  2.16 MB                 │
│              │  Secondary.json│  2.22 MB                 │
│              │  Melee.json    │  2.68 MB                 │
│              └────────────────┘                          │
└──────────────────────────────────────────────────────────┘
```

---

## 10. Implementation Tasks

These tasks are scoped for the **hephaestus** profile (implementation). File paths are relative to the workspace root.

### Task 1: Install @wfcd/items and configure webpack

- `npm install @wfcd/items`
- Add `externals` configuration in `next.config.js`
- Verify the app still builds

### Task 2: Rewrite Repository constructor with lazy init

- Add `#initialized`, `#initPromise`, `#packageVersion` private fields
- Add `#ensureInitialized()` method with localStorage cache check
- Add `#loadAndTransform()` method skeleton
- Update constructor to not load seed.js

### Task 3: Implement #loadAndTransform — Items

- Dynamic import `@wfcd/items`
- Filter to craftable items (has `components` array)
- Map WFCD items to app item shape (name, item_type, mastery_rank_required, blueprint_source via heuristic, wiki_url)
- Build uniqueName → item lookup map

### Task 4: Implement #loadAndTransform — Materials

- Flatten each item's `components` array into material entries
- Resolve component `uniqueName` to human-readable name
- Add `component_unique_name` and `is_intermediate` fields

### Task 5: Implement #loadAndTransform — Tree Relationships

- Use `parents` field to build treeRelationships
- Map `uniqueName` references to item IDs

### Task 6: Implement localStorage caching

- Cache transformed data with version stamp
- Check version on init; invalidate if mismatched
- Fall back gracefully if cache parse fails

### Task 7: Update async consumers

- Update Dashboard page to await repo init (or make repo.getAllItems() internally handle async)
- Test: Dashboard, Items list, Item Detail, track/untrack, material inventory all work

### Task 8: Mark sources as deprecated

- `getAllSources()` returns empty array with TODO comment
- Sources page shows a note: coming in follow-up

### Task 9: Remove seed.js and clean up

- Delete `src/data/seed.js`
- Remove seed imports from repository.js
- Verify full app flow works without seed

### Task 10: Commit and push

- Use Conventional Commits: `feat: integrate @wfcd/items for live Warframe item data`

---

## Appendix A: Item Count Estimates

Based on category file sizes and known game content:

| Category | Estimated items | Craftable | After filter |
|----------|----------------|-----------|-------------|
| Warframes | ~90 | ~85 (all Warframes + Archwings) | ~85 |
| Primary | ~180 | ~120 (excludes Prime/variant parts) | ~120 |
| Secondary | ~150 | ~100 | ~100 |
| Melee | ~200 | ~140 | ~140 |
| **Total** | **~620** | **~445** | **~445** |

Transformed data size in localStorage: ~200-300 KB (compressed).

## Appendix B: Next.js Compatibility Notes

- **Next.js 14 (App Router)**: `import()` works with client components marked `'use client'`. Since all consumers are client components, this is fine.
- **SSR/SSG**: Not a concern — the app runs entirely client-side with `'use client'` on all pages.
- **`next build`**: The external config prevents webpack from resolving `@wfcd/items`. The package must be installed at build time so Node can parse `package.json` for version info, even though the JSON data files aren't bundled.
- **Docker**: The Dockerfile must copy `node_modules` to the production image. This adds ~35 MB to the image size (acceptable given current image is ~300+ MB for Next.js apps).

## Appendix C: Open Questions

1. **Should we load the `Resources` category?** It's 406 KB and would let us resolve material drops. But it adds complexity to the transform. Recommendation: defer to a follow-up (covers §7).

2. **Should we keep `blueprint_source` as a field?** It's used in the item list card display. We can derive it heuristically. If the heuristic is too inaccurate, consider removing the field from the card display and replacing it with something more reliable (like drop count).

3. **How to handle items with `buildQuantity > 1`?** Some items produce multiple copies (e.g., Ciphers build in batches of 10). These currently don't appear in the seed data. For v1, we can note this in the item's display but not change the material calculation.
