# Crafting Dependency Tree Enhancement — Issue #42 Spec

Version: 0.2.0
Date: 2026-07-12
Status: Draft for review

---

## 1. Problem Statement

The item detail page shows a flat list of required materials and a one-level tree. Players cannot currently see multi-level crafting dependencies (e.g. `Orokin Cell → Neuroptics → Oraxia`), which is the primary way players plan farming routes bottom-up. A user explicitly requested this for **Oraxia**, whose chassis and neuroptics each have their own sub-component pool that must be farmed first.

Two concrete issues block the feature:
1. The persisted `treeRelationships` in `public/data/wfcd-cache.json` is **empty** (`[]`). The prebuild derives parent links from `@wfcd/items`' `parents` array, which tells us *what an item is used in*, not *what an item is crafted from*. That is a child-to-parent mapping only and is the inverse of what we need for the recursive dependency tree.
2. The "Neuroptics mislabeled as helmet" issue is a display-layer label problem in prebuild.

Core asymmetry the implementation must resolve:

```
User wants:      A is crafted FROM components B, C, D
treeRelationships currently stores: B is USED IN A (child → parent)
```

`getTreeForItem` currently returns only those direct "used in" links. We need to compute the inverse graph at display time: for a given item, walk its *components* list recursively and render the full chain from basic resources up.

---

## 2. Existing Data Model (as of main @ 893f2b0)

Relevant pieces already present in the cache, no schema migration required.

### 2.1 items (`public/data/wfcd-cache.json → items[]`)

```ts
interface Item {
  id: string;                   // item-N
  name: string;                 // e.g. "Orokin Cell"
  item_type: string;
  mastery_rank_required: number;
  has_incarnon_genesis: boolean;
  // ...
}
```

### 2.2 materials (`public/data/wfcd-cache.json → materials[]`)

```ts
interface Material {
  id: string;
  craftable_item_id: string;    // the item this row belongs to
  material_name: string;        // human name, e.g. "Neuroptics"
  component_unique_name: string;// e.g. "/Lotus/Types/Items/ShipMultiPieces/OrokinNeuroptics"
  quantity_required: number;
  is_intermediate: boolean;     // true if the component itself has components
  sub_item_id: string | null;   // item ID of the sub-component (if intermediate)
  // ...
}
```

`is_intermediate` is set by prebuild — it is `true` when the component's `uniqueName` resolves to an item in `@wfcd/items` that has its own `components`. This works for **weapons** (dual guns where each hand is a separately craftable weapon) but **NOT for Warframes**, whose Chassis/Neuroptics/Systems are recipe items not present in `@wfcd/items`.

### 2.3 treeRelationships (`public/data/wfcd-cache.json → treeRelationships[]`)

```ts
interface TreeRelationship {
  id: string;
  parent_item_id: string;       // item that REQUIRES the child
  child_item_id: string;        // item that is USED AS a component
  quantity_required: number;
}
```

Currently empty. We will leave it empty for now and compute the dependency tree dynamically.

### 2.4 warframeComponentSubMaterials (`public/data/wfcd-cache.json → warframeComponentSubMaterials{}`)

```ts
interface WarframeComponentSubMaterials {
  [itemId: string]: {
    [componentName: string]: {
      materials: Array<{ name: string; quantity: number }>;
      quantity: number;
    };
  };
}
```

Manual map injected by prebuild from DE's Public Export API (`ExportRecipes`). The map is keyed by item ID and populated automatically for all 115 Warframes in the cache.

**Caching:** The prebuild downloads the Public Export index (`index_en.txt.lzma`), extracts the current `ExportRecipes` content hash, and caches the JSON to `public/data/export-recipes-cache.json`. Subsequent prebuild runs skip the download unless the hash changes.

**Source:** `https://origin.warframe.com/PublicExport/index_en.txt.lzma` → `http://content.warframe.com/PublicExport/Manifest/ExportRecipes_en.json!<hash>`

**Note:** The wiki's `robots.txt` permits page scraping but blocks `api.php`. The Public Export API is the preferred data source because it is structured JSON (no fragile HTML parsing) and is the same data the game client uses.

**Known gaps:** ~60 newer materials (fish parts, gems, Railjack items, 1999 resources) appear in ExportRecipes but are not yet in `@wfcd/items`. These are logged as warnings during prebuild and fall back to derived display names.

---

## 3. Proposed Implementation

### 3.1 Data Source for Warframe Sub-Components

**Problem:** `@wfcd/items` does not expose sub-component breakdowns for Warframe parts (Chassis, Neuroptics, Systems). 0 of 589 Warframe components exist as separate craftable items in `@wfcd/items`.

**Initial approach (abandoned):** Wiki HTML scraping. This worked but was fragile (HTML structure changes break parsers) and the wiki `robots.txt` only permits it for non-`api.php` pages.

**Actual solution: Public Export API** (`ExportRecipes`). Digital Extremes publishes a public manifest at `https://origin.warframe.com/PublicExport/index_en.txt.lzma` containing hashed URLs to structured JSON files. `ExportRecipes_en.json` contains 1,861 blueprint recipes with exact `ItemType` → `ItemCount` ingredient mappings — including all Warframe component blueprints.

**How it works:**
1. Prebuild downloads the LZMA-compressed index and extracts the current `ExportRecipes` content hash
2. Downloads `ExportRecipes_en.json!<hash>` from `content.warframe.com/PublicExport/Manifest/`
3. Caches to `public/data/export-recipes-cache.json` keyed by hash
4. Only re-downloads when DE updates the manifest (new hash)
5. Parses Warframe main blueprints → finds component blueprints → maps `ItemType` uniqueNames to wfcd `material_name` via `component_unique_name` lookup

**Coverage:** 115 Warframes populated automatically. ~60 newer materials (fish parts, gems, Railjack items) log warnings and fall back to derived display names.

**Weapons** continue to use auto-detection from `@wfcd/items` (`is_intermediate` + `sub_item_id`).

### 3.2 New Repository method: `getCraftingTreeForItem(itemId)`

Add to `src/data/repository.ts`. The algorithm uses TWO sources for children:

1. **Auto-detected** from `is_intermediate` + `sub_item_id` in materials (works for weapons)
2. **Manual map** for known Warframe components (prebuild-injected)

**Return type:**

```ts
interface TreeNode {
  item: Item;
  materials: Material[];       // direct materials to craft this node
  children: TreeNode[];        // craftable sub-components (recursive)
  quantityForParent: number;   // how many of this item are needed by the parent
}
```

**Algorithm (client-side, no server change):**

```
function buildTree(itemId, multiplier = 1, depth = 0):
  if depth > 8: return cycle warning node
  
  item = items[id]
  materials = materials.filter(m => m.craftable_item_id === itemId)
  children = []
  
  // Source 1: auto-detected intermediates from @wfcd/items (weapons)
  for mat in materials where mat.is_intermediate === true:
    subItem = items.find(i => i.id === mat.sub_item_id)
    if subItem:
      children.push(buildTree(subItem.id, multiplier * mat.quantity_required, depth + 1))
  
  // Source 2: manual Warframe component map (prebuild-injected)
  if item.item_type === 'warframe' && manualWarframeComponents[itemId]:
    for each manualSubComp in manualWarframeComponents[itemId]:
      childNode = {
        item: { id: synthetic, name: compName, item_type: 'warframe_component' },
        materials: compData.materials,
        children: [],  // leaf nodes (raw resources)
        quantityForParent: compData.quantity
      }
      children.push(childNode)
  
  return { item, materials, children, quantityForParent: multiplier }
```

Notes:
- The prebuild script adds `sub_item_id` to materials where `is_intermediate` is true
- For Warframes, the prebuild injects `warframeComponentSubMaterials` keyed by item ID
- Cycle guard: cap recursion depth at 8 and render a warning message
- Quantity rollup: each node's `quantityForParent` represents "how many you need to make 1 of the item this component feeds into"

### 3.3 Updated Repository surface

Add this method signature in `src/data/repository.ts`:

```ts
async getCraftingTreeForItem(itemId) {
  await this.#ensureRefDataInitialized();
  return buildCraftingTree(this.items, this.materials, itemId, this.warframeComponentSubMaterials);
}
```

Also add the new field in `#loadData()`:

```ts
this.warframeComponentSubMaterials = fetched.warframeComponentSubMaterials || {};
```

No existing method is removed. `getTreeForItem` stays for the existing flat parents/children section.

### 3.4 Prebuild changes (`scripts/prebuild.mjs`)

**1. Resolve `sub_item_id` for intermediate materials** (around line 472):

```js
// After computing isIntermediate:
let subItemId = null;
if (isIntermediate) {
  const subItem = items.find(it => it.uniqueName === comp.uniqueName);
  if (subItem) subItemId = subItem.id;
}

materials.push({
  // ...existing fields...
  is_intermediate: isIntermediate,
  sub_item_id: subItemId,  // NEW: null for non-intermediates
});
```

**2. Add display name normalization for Neuroptics** (new function after helpers):

```js
/** Convert "Ash Helmet Component" → "Ash Neuroptics" */
function normalizeComponentDisplayName(materialName) {
  return materialName.replace(/ Helmet Component$/, ' Neuroptics');
}
```

Apply in material creation: `material_name: normalizeComponentDisplayName(displayName)`

**3. Add Public Export API fetch for Warframe recipes** (new section before custom vendor items):

```js
// Download functions, LZMA decompression, cache management
async function fetchExportRecipes() { ... }

// Build warframeComponentSubMaterials from ExportRecipes
function buildWarframeComponentSubMaterials(recipes, materials, itemsByUniqueName) { ... }
```

**4. Replace hardcoded Warframe data with dynamic population:**

```js
const exportRecipes = await fetchExportRecipes();
const itemsByUniqueName = new Map(items.map(i => [i.uniqueName, i]));
const WARFRAME_COMPONENT_SUB_MATERIALS = buildWarframeComponentSubMaterials(
  exportRecipes, materials, itemsByUniqueName
);
```

**5. Export the map in the cache output:**

```js
const output = {
  // ...existing fields...
  warframeComponentSubMaterials: WARFRAME_COMPONENT_SUB_MATERIALS,
};
```

### 3.5 ItemDetail page changes (`app/items/[id]/page.jsx`)

Replace the flat **Crafting Tree** card (lines 220–247 currently):

- Fetch `craftingTree = await repo.getCraftingTreeForItem(id)` instead of `getTreeForItem`.
- Add a **Farming Path (bottom-up)** section above the materials table.
- Render the tree with a recursive component `CraftingTreeNode` inside the same file.

**`CraftingTreeNode` layout:**

```
┌─ Oraxia ───────────────────────────────────────────┐
│  To craft:                                         │
│    Oraxia Neuroptics x1                            │
│    Oraxia Chassis x1                               │
│    Oraxia Systems x1                               │
│    Orokin Cell x3 (raw resource)                   │
│  ▼                                                 │
│  ┌─ Oraxia Neuroptics ───────────────────────────┐ │
│  │  Requires:                                      │ │
│  │    Morphics x3   [progress bar]                │ │
│  │    Plastids x2   [progress bar]                │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Color coding rules:**

| State | Style |
|---|---|
| Sub-component fully supplied (owned >= needed × multiplier) | Green progress bar + `✓` badge |
| Sub-component partially supplied | Yellow progress bar |
| Sub-component not owned at all | Red/muted progress bar |
| Raw material | Plain text, no progress bar |
| Link | Clickable to `/items/{subItem.id}` or `/sources?material=...` |

Progress text format: `{owned}/{total needed by THIS step}`.

### 3.6 Label fix: "Neuroptics" vs "Helmet"

**Fix applied in prebuild.mjs** — use `normalizeComponentDisplayName()`:

```js
function normalizeComponentDisplayName(materialName) {
  return materialName.replace(/ Helmet Component$/, ' Neuroptics');
}
```

This handles all cases:
- `Ash Helmet Component` → `Ash Neuroptics`
- `Ash Prime Helmet Component` → `Ash Prime Neuroptics`
- `Oraxia Helmet Component` → `Oraxia Neuroptics`

**Action after spec sign-off:** Populate `WARFRAME_COMPONENT_SUB_MATERIALS` with actual values from the Warframe wiki for Oraxia, Ash, and Karyst Prime.

---

## 4. Acceptance Criteria

- `getCraftingTreeForItem(id)` returns a recursive tree with correct leaf/intermediate nodes for at minimum **Oraxia**, **Ash**, **Ash Prime**, and **Akbolto**.
- Warframe component sub-materials are populated automatically for all 115 Warframes in the cache via the Public Export API (no manual transcription required).
- The prebuild caches `ExportRecipes` in `public/data/export-recipes-cache.json` and only re-downloads when the content hash changes.
- Material names from ExportRecipes match wfcd `component_unique_name` values exactly; unmatched materials log warnings and fall back to derived display names.
- The item detail page renders the recursive tree (expand/collapse with `useState` toggle per node).
- Each node shows `quantity_required` rolled up to current depth.
- Color-coded owned/missing state is visible and matches the progress bar color.
- Component "Neuroptics" renders as `Neuroptics` in both the materials table and the crafting tree (not "Helmet").
- Existing flat materials table and parent/children section remain intact (do not remove).
- `yarn vitest run tests/unit/prebuild-schema.test.js` continues to pass after any prebuild change.
- `yarn test` (full test pack) passes.

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/data/repository.ts` | Add `buildCraftingTree` function, `getCraftingTreeForItem` method, `warframeComponentSubMaterials` field |
| `app/items/[id]/page.jsx` | Replace flat tree card with recursive `CraftingTreeNode` rendering |
| `scripts/prebuild.mjs` | Add `normalizeComponentDisplayName()`, `sub_item_id` resolution, Public Export API fetch, `buildWarframeComponentSubMaterials()`, schema bump to 7 |
| `public/data/wfcd-cache.json` | Regenerate after prebuild change |
| `public/data/export-recipes-cache.json` | **NEW** — cached ExportRecipes JSON, keyed by content hash |
| `tests/unit/prebuild-schema.test.js` | Update expected schema version to 7 |
| `tests/unit/crafting-tree.test.js` | **NEW** — unit tests for `buildCraftingTree` |

---

## 6. Testing Plan

### 6.1 Unit: `buildCraftingTree` purity

Create `tests/unit/crafting-tree.test.js`:

```js
describe('buildCraftingTree', () => {
  it('returns single node for item with no intermediate materials', () => {});
  it('recurses one level for weapons with craftable sub-parts', () => {});
  it('uses manual warframe map when is_intermediate is false', () => {});
  it('rolls up quantities correctly', () => {});
  it('handles cycles gracefully (max depth guard)', () => {});
  it('omits raw materials from children array', () => {});
});
```

Fixture data: inline `items[]`, `materials[]`, and `warframeComponentSubMaterials{}` matching the real schema.

### 6.2 E2E: item detail tree rendering

Add Playwright assertions to `tests/item-detail.spec.ts` (or a new spec):

1. Navigate to Akbolto (auto-detected tree from weapons).
2. Assert that a **Farming Path** section is visible.
3. Assert that sub-component labels (Akbolto, Bolto) are visible.
4. Assert clicking a sub-component links to its own item page.

### 6.3 Label regression

Add a Playwright text assertion that the item detail page contains `Neuroptics` and does **not** contain `Helmet` for Oraxia, Ash, or any known Warframe.

---

## 7. Out of Scope

- Importing bottom-up planned routes into existing `/sources` page or dashboard (`/`).
- Real-time aggregate material count across the whole tree into the materials dashboard (v1 does the work item-by-item as you open the page).
- Drag-drop tree reordering or manual tree editing — the tree is computed from `@wfcd/items` only.
- Persisting tree results server-side — this is client-computed.
- Modular weapons or Railjack (separate issue #32).

---

## 8. Implementation Order

1. ~~**Fix prebuild data**~~ — DONE: `normalizeComponentDisplayName()`, `sub_item_id` resolution, schema bump to 7, regenerate cache.
2. ~~**Populate manual Warframe data**~~ — DONE via Public Export API: 115 Warframes populated automatically, `export-recipes-cache.json` caching by content hash.
3. ~~**Add `buildCraftingTree` in `repository.ts`**~~ — DONE + unit tests.
4. ~~**Render recursive tree in `app/items/[id]/page.jsx`**~~ — DONE with `CraftingTreeNode`.
5. **Wire color-coding** — IN PROGRESS: progress bars render, but intermediate nodes don't yet aggregate ownership across children.
6. **Run full test pack** (`yarn test`) — DONE: 649 tests pass.
7. **Push plan branch for mobile review** — PENDING.
8. **Add E2E test for crafting tree UI** — PENDING.

---

## 9. References

- `scripts/prebuild.mjs` — `fetchExportRecipes()`, `buildWarframeComponentSubMaterials()`, `is_intermediate` flag logic, `sub_item_id` resolution.
- `src/data/repository.ts` — `getCraftingTreeForItem` / `buildCraftingTree`.
- `app/items/[id]/page.jsx` — `CraftingTreeNode` recursive component.
- `public/data/wfcd-cache.json` — Generated cache (schema v7, 2711 KB, 115 Warframes in `warframeComponentSubMaterials`).
- `public/data/export-recipes-cache.json` — Cached ExportRecipes JSON keyed by content hash.
- `docs/schema.md` — §4 CraftingTreeRelationships.
- [Public Export wiki page](https://wiki.warframe.com/w/Public_Export) — Documents the index/manifest structure.
- GitHub Issue #42 — Crafting tree: visualize paths from resources to final item.
