# Crafting Dependency Tree Enhancement — Issue #42 Spec

Version: 0.1.0
Date: 2026-07-12
Status: Draft for review

---

## 1. Problem Statement

The item detail page shows a flat list of required materials and a one-level tree. Players cannot currently see multi-level crafting dependencies (e.g. `Orokin Cell → Neuroptics → Oraxia`), which is the primary way players plan farming routes bottom-up. A user explicitly requested this for **Oraxia**, whose chassis and neuroptics each have their own sub-component pool that must be farmed first.

Two concrete issues block the feature:
1. The persisted `treeRelationships` in `public/data/wfcd-cache.json` is **empty** (`[]`). The prebuild derives parent links from `@wfcd/items`' `parents` array, which tells us *what an item is used in*, not *what an item is crafted from*. That is a child-to-parent mapping only and is the inverse of what we need for the recursive dependency tree.
2. The "Neuroptics mislabeled as helmet" issue is likely a display-layer label problem, not a data-model problem — to be pinned down by grepping the actual cache after the spec is accepted.

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
  // ...
}
```

`is_intermediate` is already set by prebuild — it is `true` when `compItem.components.length > 0`. This is the hook we need for tree rendering: intermediate materials are the inner nodes of the crafting tree.

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

---

## 3. Proposed Implementation

### 3.1 New Repository method: `getCraftingTreeForItem(itemId)`

Add to `src/data/repository.ts`.

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
function buildTree(itemId, multiplier = 1):
  item = items[id]
  materiales = materials.filter(m => m.craftable_item_id === itemId)
  children = []

  // component materials that are intermediate = sub-items that can be crafted
  for mat in materials where mat.is_intermediate:
    // find the Item record whose name === mat.material_name
    // (the Names are normalized in prebuild)
    subItem = items.find(i => i.name === mat.material_name)
    if subItem:
      subMultiplier = multiplier * mat.quantity_required
      childNode = buildTree(subItem.id, subMultiplier)
      childNode.quantityForParent = mat.quantity_required
      children.push(childNode)

  return { item, materials, children, quantityForParent: multiplier }
```

Notes:
- This avoids mutating `wfcd-cache.json` at all — it is a pure display-side computation.
- `is_intermediate` is the gate that decides whether a material row becomes a tree node or stays a leaf resource.
- Materials with `is_intermediate = false` (Orokin Cells, Alloy Plate, etc.) are shown as leaf nodes under their parent component.
- Cycle guard: if any recursive chain loops (malformed data), cap recursion depth at 8 and render a warning message.
- Quantity rollup: each node's `quantityForParent` represents "how many you need to make 1 of the item this component feeds into". The top-level node shows `1 × Oraxia = 1×Neuroptics + 1×Chassis + 1×Systems + 1×Blueprint + Orokin Cells`. Each inner node multiplies.

### 3.2 Updated Repository surface

Add this method signature in `src/data/repository.ts`:

```ts
async getCraftingTreeForItem(itemId) {
  await this.#ensureRefDataInitialized();
  // pure function — no caching needed, data is already in memory
  return buildCraftingTree(this.items, this.materials, itemId);
}
```

No existing method is removed. `getTreeForItem` stays for the existing flat parents/children section.

### 3.3 ItemDetail page changes (`app/items/[id]/page.jsx`)

Replace the flat **Crafting Tree** card (lines 220–247 currently):

- Fetch `craftingTree = await repo.getCraftingTreeForItem(id)` instead of `getTreeForItem`.
- Add a **Farming Path (bottom-up)** section above the materials table.
- Render the tree with a recursive component `CraftingTreeNode` inside the same file (shared components are minimal for v1; can be extracted later).

**`CraftingTreeNode` layout:**

```
┌─ ora (item) ──────────────────────────────────────┐
│  To craft Oraxia:                                   │
│    Neuroptics x1                                    │
│    Chassis    x1                                    │
│    Systems    x1                                    │
│    Orokin Cells x2 (raw resource)                   │
│  ▼                                                  │
│  ┌─ Neuroptics ──────────────────────────────────┐ │
│  │  Requires:                                      │ │
│  │    Temporal Dust    x3   [Interact]            │ │
│  │    Necracoil        x2   [Interact]            │ │
│  │    Aggristone       x1   [Interact]            │ │
│  │    Morphics         x3   [Interact]            │ │
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
| Link | Clickable to `/items/{subItem.id}` |

Progress text format: `{owned}/{total needed by THIS step}`. Example: Neuroptics needs 3 Morphics × 1 Oraxia need = `3/3` with `✓ done`.

### 3.4 Label fix: "Neuroptics" vs "Helmet"

After the spec review, check the actual data and decide which path applies:

**Case A — display rename only:** Some Warframe component rows have a `uniqueName` whose last CamelCase segment is misleading (e.g. a text label "Helmet" glued onto a neuroptics row). Fix in `prebuild.mjs` normalize step by mapping known name mismatches via a `COMPONENT_NAME_FIXES` map.

**Case B — `@wfcd/items` naming drift:** If the upstream data now calls Warframe head parts "Helmet" after a rename, treat it as intentional and rename all "Helmet" display entries to "Neuroptics" for clarity. Add a `COMPONENT_DISPLAY_ALIASES` map keyed by `uniqueName` → display name in prebuild.

Either way, the fix is a 10-line addition in `scripts/prebuild.mjs` followed by regenerating cache and bumping `SCHEMA_VERSION`.

**Action to take after spec sign-off:** grep `public/data/wfcd-cache.json` for `"Helmet"` and inspect the corresponding `component_unique_name` values, then fill in the map.

---

## 4. Acceptance Criteria

- `getCraftingTreeForItem(id)` returns a recursive tree with correct leaf/intermediate nodes for at minimum **Oraxia**, **Ash**, and **Karyst Prime**.
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
| `src/data/repository.ts` | Add `buildCraftingTree` function and `getCraftingTreeForItem` method |
| `app/items/[id]/page.jsx` | Replace flat tree card with recursive `CraftingTreeNode` rendering |
| `scripts/prebuild.mjs` | Add `COMPONENT_DISPLAY_ALIASES` or `COMPONENT_NAME_FIXES` map for neuroptics label |
| `public/data/wfcd-cache.json` | Regenerate after prebuild change; `SCHEMA_VERSION` bump |
| `tests/unit/prebuild-schema.test.js` | Update expected schema version if bumped |

New files: **none** in v1. The tree renderer lives inline in `page.jsx`.

---

## 6. Testing Plan

### 6.1 Unit: `buildCraftingTree` purity

Create `tests/unit/crafting-tree.test.js`:

```ts
describe('buildCraftingTree', () => {
  it('returns single node for item with no intermediate materials', () => {});
  it('recurses one level for warframe chassis', () => {});
  it('rolls up quantities correctly (aggristone×2 for chassis ×1 for warframe = 2)', () => {});
  it('handles cycles gracefully (max depth guard)', () => {});
  it('omits raw materials from children array', () => {});
});
```

Fixture data: inline `items[]` and `materials[]` matching the real schema — no external files.

### 6.2 E2E: item detail tree rendering

Add Playwright assertions to `tests/item-detail.spec.ts` (or a new spec):

1. Navigate to an item with known intermediate components (Oraxia once it is in cache, else Ash which definitely is).
2. Assert that a **Farming Path** section is visible.
3. Assert that neuroptics/chassis/systems sub-component labels are visible and contain expected material names.
4. Assert clicking a sub-component links to its own item page.

### 6.3 Label regression

Add a Playwright screenshot check (text assertion is sufficient) that the item detail page contains the text `Neuroptics` and does **not** contain `Helmet` for Oraxia or any known Warframe.

---

## 7. Out of Scope

- Importing bottom-up planned routes into existing `/sources` page or dashboard (`/`).
- Real-time aggregate material count across the whole tree into the materials dashboard (v1 does the work item-by-item as you open the page).
- Drag-drop tree reordering or manual tree editing — the tree is computed from `@wfcd/items` only.
- Persisting tree results server-side — this is client-computed.
- Modular weapons or Railjack (separate issue #32).

---

## 8. Implementation Order

1. Add `buildCraftingTree` in `repository.ts` + unit test.
2. Fix neuroptics label in prebuild if confirmed applicable.
3. Render recursive tree in `app/items/[id]/page.jsx`.
4. Wire color-coding using existing `repo.getMaterialInventory()`.
5. Run full test pack (`yarn test`).
6. Push plan branch for mobile review before touching item-detail e2e (per user preference).

---

## 9. References

- `scripts/prebuild.mjs` — `is_intermediate` flag logic (lines 459–476).
- `src/data/repository.ts` — `getTreeForItem` at line 366.
- `app/items/[id]/page.jsx` — current tree card at line 220.
- `docs/schema.md` — §4 CraftingTreeRelationships.
- GitHub Issue #42 — Crafting tree: visualize paths from resources to final item.
