# Warframe TODO Tracker — Core Data Schema

Version: 0.1.0  
Last updated: 2026-07-06  

## Overview

This schema defines the core entities required to track Warframe craftable items, their material requirements, drop sources, crafting tree relationships, and user TODO entries. The schema is expressed in a storage-agnostic form suitable for implementation in SQLite, PostgreSQL, or an ORM.

---

## 1. Craftable Items

Represents Warframe items that can be crafted by the player (weapons, Warframes, companions, etc.).

### Fields

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | string / uuid | Primary key | Unique identifier for the craftable item. |
| name | string | Required, unique | In-game display name (e.g., `"Excalibur"`). |
| item_type | string | Required, indexed | Category of the item (`warframe`, `primary`, `secondary`, `melee`, `companion`, `archwing`, `other`). |
| mastery_rank_required | integer | Required, min 0 | Minimum mastery rank needed to equip/craft the item. |
| is_user_tracked | boolean | Required, default false | Whether the user has marked this item for tracking / TODO follow-up. |
| blueprint_source | string | Optional | Where the blueprint is acquired (`market`, `drop`, `research`, `quest`, `clan`). |
| wiki_url | string | Optional | Link to the item's page on the Warframe wiki (https://wiki.warframe.com/w/). |
| created_at | datetime | Required | Timestamp when the record was first created. |
| updated_at | datetime | Required | Timestamp of the last update. |

### Relationships

- One `CraftableItem` has many `RequiredMaterials`.
- One `CraftableItem` has many `CraftingTreeRelationships` as a parent.
- One `CraftableItem` has many `CraftingTreeRelationships` as a child.
- One `CraftableItem` has many `SourceLocations` (via required materials or direct blueprint/part drops).
- One `CraftableItem` has many `UserTodoEntries`.

### Example Entries

1. `Excalibur` — warframe, mastery rank 0, tracked: true, `wiki_url` = `"https://wiki.warframe.com/w/Excalibur"`.
2. `Galatine Prime` — melee, mastery rank 13, tracked: false, `wiki_url` = `"https://wiki.warframe.com/w/Galatine_Prime"`.

---

## 2. Required Materials

Defines the materials and quantities needed to craft a specific craftable item.

### Fields

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | string / uuid | Primary key | Unique identifier for this material requirement record. |
| craftable_item_id | string / uuid | Required, foreign key → `CraftableItem.id` | The item this material is required for. |
| material_name | string | Required | In-game material name (e.g., `"Polymer Bundle"`). |
| quantity_required | integer | Required, min 1 | Number of units of the material needed for the craft. |
| wiki_url | string | Optional | Link to the material's page on the Warframe wiki (https://wiki.warframe.com/w/). |
| created_at | datetime | Required | Timestamp when the record was first created. |

### Relationships

- Belongs to exactly one `CraftableItem`.
- Material names may appear in multiple `RequiredMaterials` records across items.
- Material names may correspond to one or more `SourceLocations`.

### Example Entries

1. `craftable_item_id` = Excalibur, `material_name` = `"Alloy Plate"`, `quantity_required` = 500, `wiki_url` = `"https://wiki.warframe.com/w/Alloy_Plate"`.
2. `craftable_item_id` = Galatine Prime, `material_name` = `"Argon Crystal"`, `quantity_required` = 2, `wiki_url` = `"https://wiki.warframe.com/w/Argon_Crystal"`.

---

## 3. Source Locations

Defines where a material or part can be obtained (planet, mission, enemy, relay, or random drop table).

### Fields

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | string / uuid | Primary key | Unique identifier for this source record. |
| material_name | string | Required | The material or part name this location provides. |
| source_name | string | Required | Display name of the source (e.g., `"Hepit"`, `"Grineer Manic"`). |
| source_type | string | Required, indexed | Type of source (`planet`, `mission`, `enemy`, `drop`, `relay`). |
| location_details | string | Required | Additional location/context info (e.g., `"Void Tile 3 on Hepit ( Capture )"`). |
| drop_chance_pct | decimal | Required, 0–100 | Approximate drop chance for the material from this source. |
| is_user_tracked | boolean | Required, default false | Whether the user has flagged this source for tracking. |
| created_at | datetime | Required | Timestamp when the record was first created. |

### Relationships

- May link to many `RequiredMaterials` by matching `material_name`.
- Many `SourceLocations` may provide the same material name.

### Example Entries

1. `material_name` = `"Polymer Bundle"`, `source_name` = `"Hepit"`, `source_type` = `mission`, `location_details` = `"Void, continuous mission rotation C"`, `drop_chance_pct` = 12.5.
2. `material_name` = `"Argon Crystal"`, `source_name` = `"Orokin Void"`, `source_type` = `planet`, `location_details` = `"Any Orokin Void fissure mission, time-limited resource pickup"`, `drop_chance_pct` = 7.3.

---

## 4. Crafting Tree Relationships

Represents parent-child item relationships inside crafting trees (components that are crafted separately and then combined into final items).

### Fields

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | string / uuid | Primary key | Unique identifier for this tree relationship. |
| parent_item_id | string / uuid | Required, foreign key → `CraftableItem.id` | The item that requires the child item as a component. |
| child_item_id | string / uuid | Required, foreign key → `CraftableItem.id` | The component item required by the parent. |
| quantity_required | integer | Required, min 1 | Number of child items needed per parent craft. |
| created_at | datetime | Required | Timestamp when the record was first created. |

### Relationships

- `parent_item_id` references a `CraftableItem`.
- `child_item_id` references a `CraftableItem`.
- A single item can appear as both parent and child in different relationships.
- Relationships are directed; the same pair with a different quantity should reuse the same record, not duplicate it.

### Example Entries

1. `parent_item_id` = Excalibur Prime, `child_item_id` = Excalibur Prime Chassis, `quantity_required` = 1.
2. `parent_item_id` = Amesha, `child_item_id` = Amesha Harness, `quantity_required` = 1.

---

## 5. User TODO Entries

Personal tracking entries a user creates to follow progress on craftable items, material farming, or sources.

### Fields

| Field | Type | Constraints | Description |
|---|---|---|---|
| id | string / uuid | Primary key | Unique identifier for this TODO entry. |
| craftable_item_id | string / uuid | Optional, foreign key → `CraftableItem.id` | The craftable item this TODO is associated with (if any). |
| linked_material_name | string | Optional | A specific material name associated with this TODO (if any). |
| user_notes | text | Optional | Free-form notes from the user (e.g., `"Farm on Venus during double resource weekend"`). |
| status | string | Required, default `pending` | Completion state (`pending`, `in_progress`, `completed`, `abandoned`). |
| priority | string | Optional | Relative priority hint (`low`, `medium`, `high`). |
| due_at | datetime | Optional | Optional deadline or target completion date. |
| created_at | datetime | Required | Timestamp when the TODO was created. |
| updated_at | datetime | Required | Timestamp of the most recent status or note change. |

### Relationships

- Optionally linked to one `CraftableItem`.
- Optionally linked to a material name that may correspond to `SourceLocations`.
- No cascading delete; removing a linked item does not auto-delete the TODO.

### Example Entries

1. `craftable_item_id` = Excalibur, `user_notes` = `"Need to craft before void fissure farming sprint"`, `status` = `pending`, `priority` = `high`.
2. `craftable_item_id` = Galatine Prime, `linked_material_name` = `"Argon Crystal"`, `user_notes` = `"Argon decays — farm in Void first"`, `status` = `in_progress`, `priority` = `medium`.

---

## Entity Relationship Summary

```
CraftableItem
  └─< RequiredMaterials
  └─< CraftingTreeRelationships (parent)
  └─< CraftingTreeRelationships (child)
  └─< UserTodoEntries

MaterialName
  └─< RequiredMaterials
  └─< SourceLocations

CraftableItem
  └─< UserTodoEntries
```

## Notes

- All entities use ISO 8601 timestamps and UTC.
- `item_type` and `source_type` values should be constrained at the application layer via enums or a lookup table.
- `mastery_rank_required` follows Warframe's in-game mastery progression (0–16+).
- `drop_chance_pct` is a precision decimal and may come from community-sourced drop table data; it should be treated as approximate.
