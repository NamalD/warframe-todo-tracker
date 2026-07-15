
# Disable tracked-only filter while searching (#130)

**Goal**
Disable the "Show tracked items only" checkbox when the Items page has active search text so searches always return matching items regardless of tracked state, while keeping the checkbox’s value unchanged when search clears.

**Scope**
In: checkbox disable behavior, empty-state copy update, e2e assertions for checkbox `disabled` during search, regression pass for existing tracked-only behaviors.
Out: category-filter disabled behavior, search-field UX, tracked-only default logic.

**Affected files**
- `app/items/page.jsx`
- `tests/items.spec.ts`
- `src/index.css` — only if empty-state copy introduces a new semantic class; likely none.

**Context**
- `app/items/page.jsx` already has the correct `Link from 'next/link'` import; no implicit Error #130 hop.
- `tests/items.spec.ts` covers tracked-only checks, badge/category/search interactions, so the mental model and selectors are already established.
- Board state currently shows this item in Todo with `ready` label.

**Plan**

1. Move #130 from Todo → In Progress on the project board.
2. Create a fresh worktree/branch from `origin/main`:
   ```bash
   git fetch origin
   git worktree add -b fix/items-tracked-filter /home/namal/apps/warframe-todo-tracker/worktrees/fix/items-tracked-filter origin/main
   ```
3. Implement `app/items/page.jsx`:
   - Add `isTrackedDisabled = !!searchText.trim()` (or equivalent) after state declarations.
   - Pass `disabled={isTrackedDisabled}` to the tracked-only `<input type="checkbox">`.
   - Do not change `showTrackedOnly` state while searching; only disable UI interaction.
   - Update the empty-state paragraph so the tracked-only no-results message explains that search temporarily disables the filter, while the generic no-results message stays for active filters.
4. Implement `tests/items.spec.ts`:
   - Add a new test in the tracked-filter suite asserting checkbox is disabled immediately after search input is filled.
   - Add a test asserting checkbox re-enables after search text is cleared, with its retained value preserved.
   - Leave existing tracked-only and category/search combo tests unchanged.
5. Validate:
   - Run `yarn vitest run` for unit coverage.
   - Run Playwright e2e `tests/items.spec.ts` to confirm the new disabled-state assertions and regression tests pass.
   - If only `tests/items.spec.ts` is feasible, run the full e2e pack only if headless Chrome is available in this environment; otherwise document manual checks.
6. Commit:
   - Conventional commit referencing the issue, e.g. `[Items] Disable tracked-only checkbox during search (#130)`
   - Push to `fix/items-tracked-filter`, open PR against `main`.
7. Merge and verify board card moves to Done via `gh issue view 130 --json state,projectItems`.
8. Run `ce-compound` to capture learnings.

**Risks**
- `showTrackedOnly` defaulting to true after `useEffect` when tracked items exist may visually disable a checked filter on page load if search state is pre-populated; unlikely, but the disable gate should only depend on non-empty `searchText`.
- Empty-state tests currently match exact strings; changing copy requires updating the e2e assertions to avoid false failures.

**Verification**
- `yarn vitest run` green.
- `tests/items.spec.ts` passes, including new checkbox-disable assertions.
- Manual spot check: search "Wisp" with tracked-only previously checked now returns matches instead of 0 cards.
- PR merge moves issue to Done on the project board.
