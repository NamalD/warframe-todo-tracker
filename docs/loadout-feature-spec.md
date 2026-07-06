# Loadout Tracking Feature Spec

Version: 0.1.0
Date: 2026-07-06

## 1. Overview

This spec defines a **Loadout Tracking** feature for the Warframe TODO Tracker. A loadout lets the user group equipment items (warframe, primary, secondary, melee, companion, archwing) and record per-item requirements that are not modeled elsewhere in the app (e.g., adapters, catalysts). Loadout slots and requirements each carry an `acquired` flag, so the dashboard can show only what is still needed.

Non-goals are explicit: no import/export, no sharing, no drag-and-drop reordering, and no complex batch validation.

---

## 2. Data Model

All new tables are stored in `localStorage` under a single `warframe-loadouts` key. The implementation should add a `LoadoutRepository` class in `src/data/loadout-repository.js`, mirroring the existing `Repository` pattern for `todos` and `items`.

### 2.1 Loadout

Top-level container for one player equipment setup.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | string | Primary key, required | Stable identifier. Use a short lowercase slug or `loadout-{timestamp}`. |
| name | string | Required, non-empty | Display name (e.g., `"Saryn Loadout"`). |
| created_at | datetime | Required, ISO 8601 | When the loadout was first created. |
| updated_at | datetime | Required, ISO 8601 | When the loadout was last modified. |

### 2.2 LoadoutSlot

An equipment slot inside a loadout. The slot type is restricted to a fixed set matching the app's existing `item_type` enum, plus `other`.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | string | Primary key, required | Stable identifier. |
| loadout_id | string | Required, FK → `Loadout.id` | Parent loadout. |
| slot_type | string | Required, indexed | One of: `warframe`, `primary`, `secondary`, `melee`, `companion`, `archwing`, `other`. |
| item_id | string | Optional, FK → `CraftableItem.id` | Linked item if it exists in the tracked items seed store. Empty for custom entries. |
| custom_item_name | string | Optional | Free-text name when the user types a custom item not in `CraftableItem`. |
| acquired | boolean | Required, default false | Whether the user already owns this slot's item. |
| notes | text | Optional | Per-slot notes (e.g., farm source, forma plan). Default empty. |
| display_order | integer | Required, default 0 | Optional sort hint; for v1 the UI can simply insert new slots at the end. |

**Validation rules**:
- `item_id` and `custom_item_name` are mutually exclusive.
- `slot_type = warframe` should be limited to at most one slot per loadout in validation, but v1 can enforce this at the UI level only.

### 2.3 SlotRequirement

A specific additional thing this slot still needs — not necessarily a `CraftableItem` or `RequiredMaterial`, but any adapter, catalyst, resource, or misc upgrade step.

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | string | Primary key, required | Stable identifier. |
| loadout_slot_id | string | Required, FK → `LoadoutSlot.id` | Parent slot. |
| name | string | Required | Requirement name shown in the UI (e.g., `"melee arcane adapter"`). |
| wiki_url | string | Optional | Warframe wiki link. Opens in new tab. |
| user_notes | text | Optional | Acquisition notes (e.g., `"Netracells for melee arcane adapter"`). Default empty. |
| acquired | boolean | Required, default false | Whether the user has this requirement already. |
| display_order | integer | Required, default 0 | Order within a slot's requirements list. |

### 2.4 Serialization / Storage Shape

`localStorage` key: `warframe-loadouts`

Example value (trimmed):

```json
{
  "loadouts": [
    {
      "id": "loadout-1",
      "name": "Saryn Loadout",
      "created_at": "2026-07-06T12:00:00Z",
      "updated_at": "2026-07-06T12:00:00Z",
      "slots": [
        {
          "id": "slot-1",
          "slot_type": "warframe",
          "item_id": "item-1",
          "custom_item_name": null,
          "acquired": false,
          "notes": "",
          "display_order": 0,
          "requirements": [
            {
              "id": "req-1",
              "name": "Orokin Catalyst",
              "wiki_url": "https://wiki.warframe.com/w/Orokin_Catalyst",
              "user_notes": "Baro",
              "acquired": true,
              "display_order": 0
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 3. UI Pages

All new pages are **Client Components** because they mutate `localStorage` via a `LoadoutRepository` instance. They follow the same `'use client'` + `useState` pattern already used by `app/todos/page.jsx` and `app/items/[id]/page.jsx`.

### 3.1 Navigation

Update `app/layout.jsx` nav links to include:

- `Loadouts` → `/loadouts`

No breadcrumb nav is required by the current app; a simple top-level link is sufficient.

### 3.2 `/loadouts` — Loadouts List

Wireframe description:

- Page title: **Loadouts**
- Top button: **New Loadout** → prompts for name via inline form or `prompt()`.
- List of cards, one per loadout:
  - Title: loadout name.
  - Metadata card: slot summary (e.g., `"Warframe: Saryn • Melee: Ceti Lacera • 1 / 5 acquired"`).
  - Actions: **Open** (link to detail), **Delete** (with `confirm()`).
- Empty state: `"No loadouts yet."` with a prompt to create one.

Empty slot handling:
- If the slot has no `item_id` and no `custom_item_name`, show `"Empty slot"` in italics.
- Empty slots should still count toward slot summary but do not contribute to dashboard aggregation.

### 3.3 `/loadouts/[id]` — Loadout Detail

Wireframe description:

- Header: loadout name + **Back to Loadouts** link + **Delete Loadout** button.
- Slot list:
  - Each slot is a card with:
    - Slot type badge (`warframe`, `melee`, etc.)
    - Item name (link to `/items/{id}` if `item_id` is set; otherwise `custom_item_name`).
    - `Acquired` checkbox and notes inline.
    - Expand/collapse toggle: **Requirements (N)**.
    - Inside the expanded area:
      - Table or list of requirements.
      - Each requirement row:
        - Checkbox `acquired`.
        - Name (link to wiki if `wiki_url` is set).
        - Notes (collapsed by default, expandable? For v1, show inline as plain text).
        - Delete requirement button.
      - Add requirement form: name input, wiki URL input, notes input, **Add** button.
    - Slot actions: **Move up / down** are out of scope; **Delete slot** with `confirm()`.
- Bottom: **+ Add Slot** button that opens a small form:
  - Slot type dropdown.
  - Item search/select dropdown populated from `repo.getAllItems()`, plus a text field for custom name.
  - Notes field.
  - **Add** button.
  - If slot type is `warframe`, warn visually when there is already one, but still add unless you implement UI-level enforcement.

Custom items not in seed data:
- When `custom_item_name` is provided, render as plain text; do not link to `/items/[id]`.
- Custom items should still appear on the dashboard aggregation section as `"Custom: Ceti Lacera"`.

### 3.4 Dashboard Integration (`/`)

The home page currently renders only `Home`. Update it to show a new **Loadout Progress** section above the empty home content:

- Title: **Loadout Progress**
- For each loadout, render a compact summary card:
  - Loadout name (link to `/loadouts/{id}`).
  - For each slot with `acquired === false`, show item name + type badge.
  - If a slot has unacquired requirements, show requirements under the slot in a nested list.
- If no loadouts exist, show `"No loadouts yet."` without the section.

This keeps typing consistent with existing `client` component pages while keeping the home page as a Server Component. Concretely:

- Load `repo` and the new `loadoutRepo` inside a Client Component child (e.g., `<LoadoutDashboardSection />`) embedded in `app/page.jsx`.
- Do not change the existing root layout or server data strategy.

---

## 4. Key Interactions

### 4.1 Create Loadout

1. Ask for name.
2. Create record with empty slots array.
3. Navigate to `/loadouts/{id}`.

### 4.2 Add Item to Slot

1. Choose slot type.
2. Either choose existing tracked item from dropdown, or type a custom name.
3. Optionally add notes now, or edit later.
4. Save → slot is appended.

### 4.3 Add Requirement to Item

1. Expand slot.
2. Fill name (required), wiki URL (optional), notes (optional).
3. Save → requirement appended.

### 4.4 Mark Acquired

- Loadouts list: show acquired count per loadout.
- Loadout detail: clicking slot checkbox hides it from dashboard automatically.
- Requirement checkbox hides requirement from dashboard.

### 4.5 Expand / Collapse

- Slot requirements list should collapse by default to keep detail page readable.
- Use a simple state toggle per slot card (`requirementsExpanded[id]`).

### 4.6 Delete

- Deleting a slot hard-removes its requirements.
- Deleting a loadout removes all slots recursively.
- Both use `confirm()`; no soft-delete in v1.

---

## 5. Repository + Integration Points

### 5.1 New file

`src/data/loadout-repository.js`

- Export `LoadoutRepository` class.
- Constructor loads `warframe-loadouts` from localStorage; falls back to `{ loadouts: [] }` on missing/corrupt data.
- Private `#persist()` writes back to localStorage.
- Methods (minimum surface for v1):

```text
getLoadouts()
getLoadoutById(id)
createLoadout({ name })
updateLoadout(id, updates)
deleteLoadout(id)

addSlot(loadoutId, slot)
updateSlot(loadoutId, slotId, updates)
deleteSlot(loadoutId, slotId)

addRequirement(slotId, requirement)
updateRequirement(slotId, requirementId, updates)
deleteRequirement(slotId, requirementId)

getDashboardSummary() -> unacquired slots + requirements across all loadouts
```

### 5.2 Store wiring

`src/data/store.js` continues to export the items/materials/sources repo. Import `LoadoutRepository` from `loadout-repository.js` in clients. We do **not** merge loadouts into the existing `Repository` class because they are a distinct domain (no todos, no items). If cross-cutting queries become necessary later, a small helper in a future `aggregation-service.js` can join them.

### 5.3 Existing code touch points

| File | Change |
|---|---|
| `app/layout.jsx` | Add `<Link href="/loadouts">Loadouts</Link>` in `<nav-links>`. |
| `app/page.jsx` | Add `<LoadoutDashboardSection />` as a Client Component child. |
| `src/data/seed.js` | No changes; loadouts have no seed data. |
| `src/data/repository.js` | No changes. |
| `src/index.css` | Add minor styles (`.loadout-list`, `.slot-card`, etc.) matching existing app styling. |

### 5.4 Data relationships

```
Loadout
  └─< LoadoutSlot
        └─< SlotRequirement

LoadoutSlot.item_id ── CraftableItem (optional)
```

There is **no** reverse link from `CraftableItem` to `LoadoutSlot`. The dashboard aggregation is the only derived view; it is computed by reading all loadouts and filtering rather than by following back-references.

---

## 6. Edge Cases

| Situation | Resolution |
|---|---|
| Custom item name collides with an existing tracked item | Allow it. Display the custom text, do not auto-link. If linked later, future enhancement can re-wire the FK. |
| Duplicate slot names in one loadout | Allow for v1; add a small disambiguation when displaying (e.g., append count or show item name). |
| Empty loadout after deleting all slots | Keep the loadout; show empty message with **Add Slot** button. |
| `wiki_url` malformed | Store as text only; render with `target="_blank"` and `rel="noreferrer"` exactly like existing item detail pages do. |
| `localStorage` quota exceeded | Extremely unlikely for loadout-sized data; do not implement eject logic in v1. |
| Concurrent client edits | Not a concern; single-user single-browser. |
| Ops of requirements list expansion | Collapsed by default; grow list does not cause layout thrash because slot cards are independent dom nodes. |
| User deletes a tracked item in Items page while it is linked in a loadout | Continue showing it by cached name until explicitly refreshed; `getItemById` returns `null`, render `"Custom: <name>"` fallback. |

---

## 7. Component Breakdown

| Component / Module | Type | Description |
|---|---|---|
| `LoadoutRepository` | Class (`src/data/loadout-repository.js`) | Persistence and CRUD for loadouts, slots, requirements. |
| `LoadoutsPage` | Client page (`app/loadouts/page.jsx`) | List and create loadouts. |
| `LoadoutDetailPage` | Client page (`app/loadouts/[id]/page.jsx`) | Single loadout with slots/requirements. |
| `LoadoutDashboardSection` | Client component (`src/components/loadout-dashboard-section.jsx`) | Compact unacquired summary embedded in home. |
| `SlotForm` | Client component (`src/components/loadout/slot-form.jsx`) | Form for choosing slot type + item. |
| `SlotCard` | Client component (`src/components/loadout/slot-card.jsx`) | Renders one slot with expand/collapse requirements. |
| `RequirementRow` | Client component (`src/components/loadout/requirement-row.jsx`) | One requirement checkbox + wiki link + notes. |
| `RequirementForm` | Client component (`src/components/loadout/requirement-form.jsx`) | Add-requirement form. |
| Nav link | JSX fragment | Single text node in `app/layout.jsx`. |

If the team prefers fewer files for the initial pass, `SlotForm`, `SlotCard`, `RequirementRow`, and `RequirementForm` can all live in `app/loadouts/[id]/page.jsx` as nested function components, to be extracted later.

---

## 8. Implementation Order (Recommended)

1. Repository: `LoadoutRepository` + localStorage serialization.
2. Nav: add `/loadouts` link.
3. Loadouts list page (`/loadouts`).
4. Loadout detail page (`/loadouts/[id]`) including slot and requirement CRUD.
5. Dashboard integration on home page.
6. CSS polish to match the existing `card` / `badge` style system.

---

## 9. Estimated Scope

- **Repository**: ~80–120 lines of JS, simple class.
- **UI**: 3 pages / 1 section, ~250–350 lines across components in the first pass.
- **Nav / layout**: trivial.
- **Tests**: at minimum one unit-ish test passing the repo through create/slot/add/delete; existing Jest / Playwright setup can be reused.

Overall estimate is **small to medium** and comfortably achievable as a single feature branch.
