---
date: 2026-07-10
issue: "#80"
artifact_contract: ce-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Filter Items by Category (Multi-Select)

## Goal Capsule

Add a multi-select category filter (pill buttons) to the Items page that combines with the existing search text and tracked-only toggle.

## Scope

**In scope:**
- Category filter bar with pill/toggle buttons for each item type
- Multi-select support (any combination of categories)
- Select All / Clear All utility buttons
- Dynamically derived categories from available items in cache
- Human-readable labels (snake_case → Title Case)
- Filter combines with existing search and tracked-only toggle
- No selection = show all categories (current behavior)
- Unit tests for the new filter logic
- E2e test for category filtering

**Out of scope:**
- Persistent filter state across page reloads (future)
- Filtering by other item attributes (mastery rank, blueprint source)

## Affected Files

- `app/items/page.jsx` — add category filter state + UI + filter logic
- `tests/unit/items-list.test.jsx` — add category filter tests
- `tests/items.spec.ts` — add e2e test for category filtering

## Existing Patterns to Follow

**Multi-select pill buttons**: `app/mods/page.jsx` lines 71-72, 129-134. The polarity filter uses:
- State: `selectedPolarities` array (empty = all)
- Toggle: `prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]`
- Filter: `selectedPolarities.length > 0 ? filtered.filter(m => selectedPolarities.includes(m.polarity)) : filtered`
- Styling: inline `style={{}}` with conditional border/background based on `selectedPolarities.includes(pol)`

**Item type field**: `it.item_type` — snake_case values from prebuild cache (warframe, primary, secondary, melee, sentinels, tektolyst_artifact)

**Filter ordering in Items page**: search input → tracked-only checkbox → item list. The category filter should go between search and tracked-only.

## Implementation Units

### U1: Add category filter logic to Items page

**File**: `app/items/page.jsx`

1. Add `selectedCategories` state: `const [selectedCategories, setSelectedCategories] = useState([]);`
2. Derive distinct categories from items: `const distinctCategories = useMemo(() => [...new Set(items.map(i => i.item_type))].sort(), [items]);`
3. Add a label mapping for human-readable names: `{ warframe: 'Warframe', primary: 'Primary', secondary: 'Secondary', melee: 'Melee', sentinels: 'Sentinels', tektolyst_artifact: 'Tektolyst Artifact' }`
4. Add toggle function: `const toggleCategory = (cat) => { setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]); };`
5. Add filter step in the chain (after search, before rendering): `if (selectedCategories.length > 0) { filtered = filtered.filter(it => selectedCategories.includes(it.item_type)); }`
6. Add the category pill button row between the search input `<div>` and the tracked-only `<div>`, following the mods page pattern exactly

**Filter chain order**: items → tracked-only filter → search filter → **category filter** → render

**Pattern reference**: `app/mods/page.jsx` lines 129-134 (pill buttons), lines 71-72 (toggle function), line 79 (filter logic)

**Test scenarios:**
- Selecting "Warframe" shows only warframe items
- Selecting "Warframe" + "Primary" shows both
- Selecting all categories then deselecting one removes it
- No selection = all items shown
- Category filter combines with search (search "Excalibur" + select "Warframe" → only Excalibur)
- Category filter combines with tracked-only

### U2: Update empty-state message

**File**: `app/items/page.jsx`

The existing empty-state messages (lines 73-80) check `showTrackedOnly` and `searchText`. Update to also mention category filter when active:

- When categories are selected and nothing matches: mention the category filter in the "no matches" message
- Don't overcomplicate — just ensure the generic "No items match this filter" message covers all filter combinations

### U3: Unit tests

**File**: `tests/unit/items-list.test.jsx`

Add tests following the existing pattern (mock repo with known item data):

- Category pills render for all 6 distinct types
- Clicking a pill selects it (visual state change)
- Clicking again deselects it
- Selecting "Warframe" filters to only warframe items
- Selecting multiple categories shows items from both
- No selection = all items shown
- Category filter combines with search text
- Category filter combines with tracked-only toggle
- "Select All" button selects all categories
- "Clear All" button deselects all categories

### U4: E2e test

**File**: `tests/items.spec.ts`

Add a test block for category filtering:

- Navigate to /items, verify pill buttons are visible
- Click "Warframe" pill, verify only warframe items shown
- Click "Primary" pill (multi-select), verify warframe + primary items shown
- Click "Warframe" again (deselect), verify only primary items
- Click "Select All", verify all pills selected and all items shown
- Click "Clear All", verify no pills selected (but all items shown)
- Category filter works with search input
- Category filter works with tracked-only toggle

Use `data-testid="category-btn-{type}"` for each pill button, `data-testid="category-select-all"` and `data-testid="category-clear-all"` for the utility buttons.

### U5: Select All / Clear All buttons

**File**: `app/items/page.jsx`

Add two small utility buttons next to the category pills:

- **Select All**: sets `selectedCategories` to all distinct categories
- **Clear All**: sets `selectedCategories` to `[]`
- Style: small text buttons, same inline style pattern, distinct from the category pills (e.g., lighter weight, no border when inactive)
- Only show when categories exist (items loaded)

**Pattern**: No exact pattern in the codebase. Design as small text links styled like: `fontSize: 12, color: '#7a8194', cursor: 'pointer', background: 'none', border: 'none', marginLeft: 8`

**Test scenarios** (added to U3 + U4 above):

## Dependencies

- U1 → U2 (empty-state update depends on filter being in place)
- U1 → U5 (Select All/Clear All depends on category state being in place)
- U1 → U3 (tests depend on implementation)
- U1 → U4 (e2e tests depend on implementation)
- U3 and U4 can be done in parallel after U1+U2+U5

## Risks

- **Label mapping maintenance**: If new item types are added to `@wfcd/items`, the label map needs updating. Mitigation: fall back to raw snake_case if no mapping exists.
- **Pill button styling**: Inline styles like mods page. No CSS file changes needed, keeps the diff minimal.
- **Performance**: 684 items with client-side filtering is fine. The filter chain is pure array operations, no re-fetches.

## Verification Contract

- `npm run test:unit` — all existing + new tests pass
- `npm run test:e2e` — all existing + new e2e tests pass
- Manual: visit /items, verify pills appear, click around, combine with search
- Manual: verify no flash of incorrect items on initial load
