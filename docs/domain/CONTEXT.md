# Warframe TODO Tracker — Domain Context

A companion app for Warframe players that tracks craftable items, materials, mods,
loadouts, and TODOs across personal play sessions. It distinguishes static
game-reference data from the user's own progress, sync state, and custom configs.

## Language

**Craftable item**:
An in-game item that can be constructed from a blueprint, consumes materials, and
has a build time or location.
_Avoid_: item, asset, object

**Material**:
A resource or ingredient consumed in crafting, trading, or upgrading — owned by
the player and tracked as a quantity.
_Avoid_: resource, ingredient, drop

**Mod**:
An equipment modification discoverable through drops or relics, tracked as owned/
ranked in the player's collection.
_Avoid_: upgrade, card

**Loadout**:
A named, reusable equipment arrangement of Warframe, weapons, and chosen upgrade
requirements/slots. Conceptually separate from whether the player has acquired
those items yet.
_Avoid_: build, setup, kit

**Build**:
A named player-designed equipment setup targeting a specific goal or playstyle,
combining Warframe, weapons, mods, and upgrade requirements (e.g., a Saryn Venom
Dose build focused on her augment mod for high damage). Conceptually distinct from
a Loadout: a Build is the *plan or goal*, while a Loadout is the *equipment
arrangement* — though overlaps are common.
_Avoid_: loadout, blueprint, list

**TODO**:
A user-scoped action tied to a craftable item or material, with status and priority
for planning farming/crafting sessions.
_Avoid_: task, reminder

**Material inventory**:
The player's current stock of each material, reflected as an owned quantity state.

**Tracked item flag / User item data**:
Per-item metadata such as tracked status, Incarnon install tracking, and installed
state — purely user-scoped, not part of game data.
_Avoid_: preferences, flags, settings

**Requirement option**:
Predefined, slot-permissioned upgrade/bindings choices applicable to loadout
equipment slots (e.g., Orokin Catalyst for weapons).
_Avoid_: upgrade, attachment, mod

**Requirement**:
A specific need for a build, expressed minimally as name, optional wiki URL, notes,
and acquired state. Discouraged from being fully normalized into dedicated tables
in the current persistence shape; requirements are embedded in JSON build data.
_Avoid_: checklist item, sub-item, dependency

**Version**:
The optimistic concurrency token used for conflict detection on user data mutations.

**Client version**:
The version carried by the client when issuing writes; server rejects updates when
this falls below the stored version.

**Sync**:
The protocol for multi-device reconciliation using version vectors plus last-writer-wins
fallback, including automatic migration of legacy localStorage data.

## Single-context repo

This repo uses one domain context in `CONTEXT.md`.
