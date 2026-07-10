---
problem_type: pattern
category: testing
tags: [async, await, repository, test-maintenance, signature-changes, loadout-repository]
date: 2026-07-10
issue: "#90"
---

# Async repository method signatures break tests silently

## Problem

Repository tests fail with `expected [Promise] to have property 'id'` or `Cannot read properties of null`. Tests that worked before now fail because repository method signatures changed:

1. `createLoadout()` changed from sync to `async` — tests call it without `await`, getting a Promise instead of the loadout object
2. `deleteLoadout()` changed from sync to `async` — same
3. `updateLoadout()` changed from sync to `async` — same
4. `updateRequirement()` signature changed to `(slotId, requirementId, updates)` — old tests pass only `(requirementId, updates)`
5. `deleteRequirement()` signature changed to `(slotId, requirementId)` — old tests pass only `(requirementId)`
6. `deleteSlot()` return type changed from slot object to boolean — old tests check `.item_id` on the return value

## Root Cause

Repository methods were refactored (async server sync, slot-scoped requirement operations) but the corresponding unit tests were never updated. Vitest doesn't flag unawaited Promises as failures by default — they silently pass assertions against the Promise object.

## Solution

For any async method call in tests: add `await` before the call and make the test function `async`.

```js
// Before (broken — returns Promise)
it('creates a loadout', () => {
  const loadout = repo.createLoadout({ name: 'Test' });
  expect(loadout.name).toBe('Test'); // fails — loadout is a Promise
});

// After (fixed)
it('creates a loadout', async () => {
  const loadout = await repo.createLoadout({ name: 'Test' });
  expect(loadout.name).toBe('Test');
});
```

For changed method signatures, match the current implementation:
```js
// Before (broken — old signature)
repo.updateRequirement(req.id, { name: 'New' });
repo.deleteRequirement(req.id);

// After (fixed — new signature with slotId)
repo.updateRequirement(slot.id, req.id, { name: 'New' });
repo.deleteRequirement(slot.id, req.id);
```

## Prevention

- **Vitest config**: enable `--fail-on-unhandled-errors` in CI to catch unawaited Promises
- **Code review checklist**: when changing a method to `async`, grep for call sites in `tests/` and update them
- **TypeScript**: if/when the project adopts TS, the compiler catches unawaited Promises at build time
- **Component tests**: read the component's `useEffect` before writing mocks. Every `await repo.something()` call needs a corresponding mock method that resolves. Missing mocks cause silent timeouts (1000ms+) rather than clear errors — vitest's `waitFor` hangs on unresolved promises.

## Related: component test mock checklist

When a component test fails with a timeout (not an assertion error), the component is calling an un-mocked async method. Check these common misses:

1. `repo.initTodos()` / `repo.initMaterials()` — initialization methods added to Repository
2. `loadoutRepo.init()` / `lr.init()` — LoadoutRepository async init
3. `loadoutRepo.getAllRequirements()` — dashboard aggregation
4. `modRepo.getTrackedMods()` — dashboard mods card
5. Any `globalThis.*` variables used in server modules (e.g. `device`, `device_id` for conflict logging) must be set in `tests/unit/setup.ts`

## Related: data-driven test expectations

When a test asserts against generated/cached data (e.g. "has exactly 45 Incarnon weapons", "all mod_types are normalized"), and the data is stale:

1. **Read the actual data first** — use `python3 -c "import json; ..."` to extract unique values from the cache JSON
2. **Batch-update all expectations at once** — don't add types one at a time ("Companion Mod" → "Secondary Mod" → "Primary Mod" → ...). Read the full list, write the full list.
3. **Pattern**: `prebuild-incarnon.test.js` (weapon count 45→63), `prebuild-mods.test.js` (mod_type list 12→21 entries), `repository.test.js` (fetch call count 1→2)
