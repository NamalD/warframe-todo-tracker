---
problem_type: best_practice
category: tooling-decisions
tags:
  - relics
  - wfcd-items
  - prebuild
  - cache
  - prime-relic-map
date: 2026-07-17
---

# Void Relic Tracking — Data Model Learnings

## Context
Adding a "Relics Needed" section to the item detail page required extracting relic data from `@wfcd/items` and mapping it to prime item components. The `@wfcd/items` package ships 3,096 relics with complete reward tables, vaulting status, and rarity tiers, but the app's prebuild script previously skipped the Relics category entirely.

## Guidance

### @wfcd/items Relic Object Shape
Relic objects expose:
- `vaulted` — boolean
- `rewards[]` — array of `{ item: { name, uniqueName, warframeMarket }, rarity: string, chance: number }`
- `name` — includes tier (Axi/Meso/Neo/Lith/Requiem) and era (e.g., "Axi A1 Exceptional")
- **No separate `tier` or `era` fields** — these are embedded in the name

### Component Name Normalization
`@wfcd/items` uses different naming conventions for components:
- Warframe parts: `Helmet Component` → `Neuroptics`, `Chassis Component` → `Chassis`, `Systems Component` → `Systems`
- Weapon parts: `Barrel`, `Handle`, `Stock`, `Receiver`, `Boot`, `Cerebrum`, etc.

The prebuild script's `normalizeComponentDisplayName` handles all three Warframe component suffixes.

### Prime Component Matching
Relic reward names don't always match material names exactly:
- Warframe parts: reward has `Blueprint` suffix (e.g., "Grendel Prime Systems Blueprint" vs material "Grendel Prime Systems")
- Weapon parts: no `Blueprint` suffix (e.g., "Akstiletto Prime Barrel")

The matching logic handles both cases.

### Separate Cache Pattern
When adding a new data domain (relics), use a separate cache file (`relics-cache.json`) with its own localStorage cache key. The `initRelics` method:
1. Fetches `/data/relics-cache.json`
2. Checks localStorage for a cached version matching package version + schema version
3. Falls back to localStorage on fetch failure (does not discard cached data)

## Why This Matters
Without these patterns, relic data integration would require schema migrations to the core `wfcd-cache.json`, and missing cache fallbacks would break the item detail page for offline users. The separate cache keeps relic data isolated as it grows (drop rates, refinement tables, farming routes).

## When to Apply
- Integrating a new `@wfcd/items` category into the prebuild pipeline
- Adding a new client-side data domain with its own cache lifecycle
- Matching game-item names across different `@wfcd/items` object shapes

## Examples

### Prebuild: primeRelicMap extraction
```js
// scripts/prebuild.mjs
const relicsRaw = new Items({ category: ['Relics'], i18n: false, i18nOnObject: false });
// Build primeRelicMap: itemId → componentName → [{ relicName, vaulted, rarity }]
```

### Repository: separate cache with fallback
```ts
// src/data/repository.ts
async initRelics() {
  try {
    const res = await fetch('/data/relics-cache.json');
    // ... version check, localStorage cache ...
  } catch (err) {
    // Fall back to localStorage on fetch failure
    this.primeRelicMap = {};
  }
}
```

## Related
- Issue #29 — feature request
- PR #194 — implementation