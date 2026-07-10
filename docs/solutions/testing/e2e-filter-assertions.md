---
problem_type: pattern
category: testing
tags: [e2e, playwright, assertions, filter, false-positive]
date: 2026-07-10
issue: "#80"
---

# Strengthen E2e Assertions for Filter Components

## Problem

Initial e2e tests for the category filter used weak assertions that would pass even if the filter was completely broken:

- `expect(count).toBeGreaterThan(0)` — passes if any items render, even wrong ones
- `expect(filteredCount).toBeLessThan(allCount)` — passes if the filter removed some items, even the wrong ones
- No verification of what was actually visible

The review caught this: 3 of 5 e2e tests were effectively no-ops.

## Root Cause

Writing filter tests that only check card count is tempting because it's fast and simple. But count-based assertions don't verify the filter's core behavior — that it shows the right items and excludes the wrong ones.

## Solution

Every e2e test for a filter component should verify **content, not just count**:

### Pattern 1: Verify selected category badges

```typescript
// After clicking "Warframe" pill:
const filteredCount = await page.locator('.card').count();
const warframeBadges = await page.locator('.card .badge.warframe').count();
expect(warframeBadges).toBe(filteredCount);  // every card is a warframe
```

### Pattern 2: Verify exclusions

```typescript
// After selecting Warframe + Primary (not Melee):
expect(await page.locator('.badge.warframe').count()).toBeGreaterThan(0);
expect(await page.locator('.badge.primary').count()).toBeGreaterThan(0);
expect(await page.locator('.badge.melee').count()).toBe(0);  // excluded
```

### Pattern 3: Verify equivalence after reset

```typescript
// Select All should restore full count:
const allCount = await page.locator('.card').count();
await page.getByTestId('category-select-all').click();
expect(await page.locator('.card').count()).toBe(allCount);
```

### Pattern 4: Verify intermediate state in toggle tests

```typescript
// When testing deselect (click → click again):
await page.getByTestId('category-btn-warframe').click();
expect(await page.locator('.card').count()).toBeLessThan(allCount);  // filter applied
await page.getByTestId('category-btn-warframe').click();
expect(await page.locator('.card').count()).toBe(allCount);  // restored
```

## Prevention

- The `ce-review` testing reviewer now flags count-only assertions as P1
- AGENTS.md documents this pattern under "Known gotchas"
- Template for new filter e2e tests: always include at least one content verification (badge, text, or exclusion check)
