---
title: "Relic cache prebuild: load Relics separately, don't deduplicate by relic name"
date: 2026-07-14
problem_type: knowledge
module: scripts/prebuild.mjs, src/data/repository.ts
tags: [prebuild, wfcd-items, relics, caching, prime-items]
---

## Context

Adding a derived `relics-cache.json` to the prebuild pipeline (issue #29) required extracting the Relics category from `@wfcd/items` and mapping prime items to their relic drops. Two mistakes surfaced during implementation.

## Guidance

### 1. Load the Relics category explicitly

`@wfcd/items` categories are opt-in. The prebuild script's standard pool (`Warframes`, `Primary`, `Secondary`, `Melee`, `Sentinels`) does not include `Relics`. Passing the raw item pool to `buildRelicCache` and filtering by `relic.type === 'Relic'` silently produced an empty map.

```js
// Correct: load Relics as a separate category
const { default: Items } = await import('@wfcd/items');
const relics = new Items({ category: ['Relics'], i18n: false, i18nOnObject: false });
```

### 2. Don't deduplicate relic entries by relic name

A single relic can drop multiple components for the same prime item (e.g., Axi V3 drops both Neuroptics Blueprint and Systems Blueprint for a prime warframe). The plan requires listing each relic once **per component** it drops. Deduplicating by `relicName` collapses these into one entry and violates the requirement.

```ts
// Wrong: collapses multi-component relics
const seen = new Set();
if (seen.has(entry.relicName)) continue;

// Correct: return all entries; cache is already one per (relic, component)
return entries.map((e) => ({ ...e }));
```

### 3. Prime item detection regex

Prime items in `@wfcd/items` carry "Prime" in their name, either as the base item (`"Acceltra Prime"`) or with a component suffix (`"Ash Prime Chassis"`, `"Mesa Prime Neuroptics"`). The regex must accept both forms:

```js
/ Prime(?: (?:Blueprint|Neuroptics|Chassis|Systems|Carapace|Cerebrum|...))?$/
```

## Why This Matters

The prebuild cache is the single source of truth for client-side relic data. A silent empty map or collapsed entries produce a broken UI that shows no relics or incomplete relic lists — the exact planning-loop breakage the feature is meant to fix.

## When to Apply

Any new `@wfcd/items`-derived cache that needs the Relics category, or any derived map where one source entity maps to multiple target entries per key.
