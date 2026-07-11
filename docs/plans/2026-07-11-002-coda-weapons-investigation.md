# Coda Weapons Missing from Items List - Plan

**artifact_contract:** ce-unified-plan/v1
**artifact_readiness:** requirements-only
**product_contract_source:** ce-brainstorm
**date:** 2026-07-11

## Goal Capsule

Investigate and resolve why Coda weapons are missing from the items list fetched from `@wfcd/items`.

**Primary authority:** Bug fix for missing Warframe items data.

**Open blockers:** None

## Product Contract

### What to Build

1. **Investigate the root cause** - Determine why Coda weapons are not included in the `@wfcd/items` package data
2. **Verify data source** - Check if this is a `@wfcd/items` package issue or a data processing issue
3. **Implement fix** - Either update the data source or add Coda weapons to the local cache

### In-Scope

- Check the `@wfcd/items` package for Coda weapon data
- Verify the prebuild script (`scripts/prebuild.mjs`) processes all items correctly
- If needed, add Coda weapons to the local cache or data files
- Test that Coda weapons appear in the items list

### Out-of-Scope

- Implementing Coda weapon-specific features (tracking, etc.)
- Changes to the UI/UX for displaying Coda weapons

### Success Criteria

- [ ] Coda weapons (e.g., Coda Mire) appear in the items list
- [ ] All Coda weapons are included (not just one example)
- [ ] No regression in other item categories

### Key Risks

1. **Data source issue** - If `@wfcd/items` is missing Coda weapons, we may need to wait for an upstream fix
2. **Data processing** - The prebuild script might be filtering out Coda weapons incorrectly

## Outstanding Questions

1. Are Coda weapons present in the raw `@wfcd/items` package but filtered out during prebuild?
2. If missing from `@wfcd/items`, should we add them manually or file an upstream issue?

## GH Issue

- #147 - Coda weapons missing from items list

## Investigation Steps

1. Check `@wfcd/items` package for Coda weapon entries
2. Review `scripts/prebuild.mjs` for any filtering logic
3. Check `public/data/wfcd-cache.json` for Coda weapons
4. Determine the best fix approach

## Dependencies

- None