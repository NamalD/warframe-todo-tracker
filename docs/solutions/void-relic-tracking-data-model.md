# Void Relic Tracking — Data Model Learnings

## Problem
Adding a "Relics Needed" section to the item detail page required extracting relic data from `@wfcd/items` and mapping it to prime item components.

## Solution

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

The prebuild script's `normalizeComponentDisplayName` must handle all three Warframe component suffixes.

### Prime Component Matching
Relic reward names don't always match material names exactly:
- Warframe parts: reward has `Blueprint` suffix (e.g., "Grendel Prime Systems Blueprint" vs material "Grendel Prime Systems")
- Weapon parts: no `Blueprint` suffix (e.g., "Akstiletto Prime Barrel")

Matching logic must handle both cases.

### Separate Cache Pattern
When adding a new data domain (relics), use a separate cache file (`relics-cache.json`) with its own localStorage cache key. The `initRelics` method should:
1. Fetch `/data/relics-cache.json`
2. Check localStorage for cached version matching package version + schema version
3. Fall back to localStorage on fetch failure (don't discard cached data)

## Files
- `scripts/prebuild.mjs` — relic extraction and `primeRelicMap` generation
- `src/data/repository.ts` — `initRelics()` and `getRelicsForItem()`
- `app/items/[id]/page.jsx` — "Relics Needed" section rendering
- `public/data/relics-cache.json` — generated cache (1.3 MB, 12K+ pairs)

## Stats
- 3,096 relics processed
- 130 prime items mapped
- 12,656 relic-component pairs (after normalization fixes)
- 18 Requiem relics (8 rewards each, all Rare)