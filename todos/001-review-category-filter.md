# Review Findings — Category Filter (#80)

Review date: 2026-07-10
Reviewers: Correctness, Testing, Maintainability (3 parallel subagents)

## Resolved

All P1 and most P2 findings addressed in commit `4facd4f`.

## Deferred

### P2 — Extract shared MultiSelectPillFilter component

Both `app/items/page.jsx` and `app/mods/page.jsx` have identical pill button inline styles and toggle logic. Extract into `app/components/multi-select-pill-filter.jsx` accepting `items`, `selected`, `onToggle`, and `getLabel` props. Also add Select All/Clear All to mods page for consistency.

### P3 — "All" / "None" button margin asymmetry

The "All" button has `marginLeft: 4` but "None" does not. Use a consistent wrapper gap or remove the asymmetric margin.

### P3 — Filter chain order divergence

Items page: tracked-only → search → category. Mods page: search → type → rarity → polarity → owned. Either align or document the rationale.
