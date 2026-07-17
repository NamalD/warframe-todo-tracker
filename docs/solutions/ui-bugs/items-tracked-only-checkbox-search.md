---
title: Disable "Show tracked items only" checkbox when searching in Items page
date: 2026-07-17
category: docs/solutions/ui-bugs/
module: items-page
problem_type: ui_bug
component: frontend_stimulus
severity: medium
symptoms:
  - Searching for an untracked item returns zero results when "Show tracked items only" is checked
  - Users cannot discover untracked items via search while the tracked-only filter is active
  - Checkbox state persists across search input changes, causing stale filtering behavior
root_cause: scope_issue
resolution_type: code_fix
tags:
  - items-page
  - search
  - tracked-only
  - checkbox
  - filter
  - ui-bug
---

# Disable "Show tracked items only" checkbox when searching in Items page

## Problem

The Items page applies the "Show tracked items only" filter before the search filter, so searching while the checkbox is active silently hides every non-tracked match and produces zero results.

## Symptoms

1. User checks "Show tracked items only" on `/items`.
2. User types a search query for an item they do not track.
3. The list empties out and the page shows either:
   - "No tracked items yet — showing 0 of N items. Uncheck 'Show tracked items only' to browse everything." (when no categories are selected), or
   - "No items match this filter." (otherwise).
4. Unchecking the box reveals that matching items do exist; the search itself works.

## What Didn't Work

Leaving the checkbox always enabled and relying on the empty-state messaging. The empty states are correctly written, but they do not help the user understand that the tracked-only filter is hiding valid search matches. The only workaround is manually unchecking the box, which is not discoverable from the empty message alone.

## Solution

Disable the "Show tracked items only" checkbox while `searchText` is non-empty so the search can reveal matching items regardless of tracked state. This is a small behavioral guard rather than a restructuring of the filter chain.

**Before** (`app/items/page.jsx`, current checkout):

```jsx
<label>
  <input
    type="checkbox"
    checked={showTrackedOnly}
    onChange={(e) => setShowTrackedOnly(e.target.checked)}
  />
  &nbsp;Show tracked items only
</label>
```

**After** (PR #188):

```jsx
<label>
  <input
    type="checkbox"
    checked={showTrackedOnly}
    onChange={(e) => setShowTrackedOnly(e.target.checked)}
    disabled={searchText.trim().length > 0}
  />
  &nbsp;Show tracked items only
</label>
```

The disabled state is driven directly by `searchText.trim().length > 0`, keeping the UI rule colocated with the input that owns the state.

## Why This Works

The filter chain in `app/items/page.jsx` is intentionally ordered: tracked-only, then search, then categories:

```js
let filtered = showTrackedOnly
  ? items.filter((it) => it.is_user_tracked)
  : items;

if (searchText.trim()) {
  const query = searchText.toLowerCase();
  filtered = filtered.filter((it) =>
    it.name.toLowerCase().includes(query)
  );
}
```

Because tracked-only runs first, any non-tracked match is removed before the search can include it. Disabling the checkbox while searching forces the tracked-only branch off (`showTrackedOnly` stays checked visually but cannot be toggled on while searching; the user must clear search first). Search therefore always operates on the full item list and returns every name match.

## Prevention

1. **Document filter-chain order** in a component comment or adjacent design doc so future contributors know the tracked-only-first ordering is intentional and that search must not be sandwiched between tracked-only and categories without a corresponding UX guard.
2. **Add a component test** that asserts the checkbox is disabled when `searchText` is non-empty and enabled when it is empty. This catches regressions where the disabled attribute is accidentally removed.
3. **Reuse the same disabled-by-search pattern** on other list pages if they share a tracked-only-then-search filter chain, so the behavior is consistent across the app.

## Related Issues

- Issue #130: "Disable 'show tracked items only' checkbox when searching in Items page"
- PR #188: "[Items] Disable tracked-only checkbox while searching (#130)" — open, mergeable, clean, 5 commits, 4 changed files, +83/-4 lines
- Related: [Strengthen E2e Assertions for Filter Components](../testing/e2e-filter-assertions.md) — same filter chain, content-verification pattern applies here too