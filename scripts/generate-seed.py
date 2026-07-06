#!/usr/bin/env python3
"""
Generate seed.js from warframe-items JSON data.
Reads from ~/warframe-items/data/json/ and produces seed data
in the format expected by the Warframe TODO Tracker app.
"""

import json
import os
import sys
from datetime import datetime, timezone

ITEMS_DIR = os.path.expanduser("~/warframe-items/data/json")
OUTPUT_FILE = os.path.expanduser("~/warframe-todo-tracker/src/data/seed.js")

# Item type mapping
CATEGORY_TO_TYPE = {
    "Warframes": "warframe",
    "Primary": "primary",
    "Secondary": "secondary",
    "Melee": "melee",
}

# Categories to include as top-level craftable items
INCLUDE_CATEGORIES = ["Warframes", "Primary", "Secondary", "Melee"]

# Names to skip (necramechs, k-drives, etc that aren't warframes/weapons)
SKIP_PATTERNS = [
    "K-Drive", "Necramech", "Operator", "Drifter",
]

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(filename):
    path = os.path.join(ITEMS_DIR, filename)
    with open(path) as f:
        return json.load(f)


def is_top_level_item(item):
    """Filter to main craftable items, not sub-components or blueprints."""
    name = item.get("name", "")
    unique = item.get("uniqueName", "")

    # Skip sub-component blueprints (Chassis, Neuroptics, Systems, etc.)
    blueprint_suffixes = [
        "Blueprint", "Chassis", "Neuroptics", "Systems",
        "Harness", "Wings", "Blade", "Handle", "Guard",
        "Barrel", "Receiver", "Stock", "Link", "Grip",
        "Upper Limb", "Lower Limb",
    ]
    # Only skip if the name CONTAINS these AND is short (suggesting it's a part, not a full item)
    for suffix in blueprint_suffixes:
        if name.endswith(f" {suffix}") or name.endswith(f" Prime {suffix}"):
            return False

    # Skip things that are just component names
    if len(name.split()) <= 2 and any(s in name for s in ["Chassis", "Neuroptics", "Systems", "Harness"]):
        return False

    # Skip necramechs, k-drives, etc
    for pattern in SKIP_PATTERNS:
        if pattern in name:
            return False

    # Must have components (be craftable) or drops (prime parts from relics)
    if not item.get("components") and not item.get("drops"):
        return False

    return True


def get_blueprint_source(item):
    """Derive blueprint source from item data."""
    name = item.get("name", "")
    unique = item.get("uniqueName", "")

    # Tenet weapons = Sisters of Parvos (lich system)
    if "Tenet" in name:
        return "drop"  # Sisters of Parvos

    # Kuva weapons = Kuva Liches
    if "Kuva" in name:
        return "drop"  # Kuva Lich

    # Primes come from relics
    if item.get("isPrime") or "Prime" in name:
        if item.get("vaulted"):
            return "drop"  # vaulted prime - from relics when unvaulted
        return "drop"  # currently available from relics

    # Clan research
    if "Dojo" in unique or "Research" in unique:
        return "clan"

    # Market available (has credit cost for blueprint)
    if item.get("marketCost") or item.get("bpCost"):
        return "market"

    # Has drops = relic/event drop
    if item.get("drops"):
        return "drop"

    return "market"


def lookup_item_by_uniquename(all_items, unique_name):
    """Find an item by its uniqueName across all loaded items."""
    # Try exact match first
    for item in all_items:
        if item.get("uniqueName") == unique_name:
            return item
    # Try substring match (sometimes names are partial)
    for item in all_items:
        if item.get("uniqueName", "").endswith(unique_name):
            return item
    return None


def flatten_materials(item, all_items, depth=0):
    """
    Recursively flatten crafting materials.
    For items whose components are sub-craftable (like Warframe parts),
    recurse into those sub-components to get actual materials.
    """
    if depth > 3:
        return []

    materials = []
    components = item.get("components", [])

    for comp in components:
        comp_name = comp.get("name", "")
        comp_unique = comp.get("uniqueName", "")
        quantity = comp.get("itemCount", 1)

        # Check if this component is itself a craftable item
        sub_item = lookup_item_by_uniquename(all_items, comp_unique)

        if sub_item and sub_item.get("components"):
            # This is a sub-craftable component - recurse
            sub_mats = flatten_materials(sub_item, all_items, depth + 1)
            # Multiply quantities by the parent requirement
            for sm in sub_mats:
                materials.append({
                    "material_name": sm["material_name"],
                    "quantity_required": sm["quantity_required"] * quantity,
                })
        else:
            # This is a raw material (or the blueprint itself)
            # Skip blueprints (they're not materials to farm)
            if "Blueprint" in comp_name or "blueprint" in comp_unique.lower():
                continue
            materials.append({
                "material_name": comp_name,
                "quantity_required": quantity,
            })

    # Merge duplicate materials
    merged = {}
    for m in materials:
        name = m["material_name"]
        if name in merged:
            merged[name] += m["quantity_required"]
        else:
            merged[name] = m["quantity_required"]

    return [{"material_name": k, "quantity_required": v} for k, v in merged.items()]


def main():
    # Load all item categories
    all_items = []
    categorized = {}

    for cat_filename in INCLUDE_CATEGORIES:
        items = load_json(f"{cat_filename}.json")
        categorized[cat_filename] = items
        all_items.extend(items)

    print(f"Total items loaded: {len(all_items)}")

    # Filter to top-level craftable items
    top_items = []
    for cat_name, items in categorized.items():
        item_type = CATEGORY_TO_TYPE[cat_name]
        for item in items:
            if is_top_level_item(item):
                top_items.append((item, item_type))

    print(f"Top-level craftable items: {len(top_items)}")

    # Generate seed data
    seed_items = []
    seed_materials = []
    seed_tree = []
    seed_sources = []
    seed_todos = []

    item_id_map = {}  # uniqueName -> our id
    item_counter = [0]
    mat_counter = [0]
    tree_counter = [0]

    def next_item_id():
        item_counter[0] += 1
        return f"item-{item_counter[0]}"

    def next_mat_id():
        mat_counter[0] += 1
        return f"mat-{mat_counter[0]}"

    def next_tree_id():
        tree_counter[0] += 1
        return f"tree-{tree_counter[0]}"

    # First pass: create items
    for item, item_type in top_items:
        name = item.get("name", "")
        unique = item.get("uniqueName", "")
        mr = item.get("masteryReq", 0) or 0
        wiki = item.get("wikiaUrl", "") or f"https://wiki.warframe.com/w/{name.replace(' ', '_')}"
        bp_source = get_blueprint_source(item)

        iid = next_item_id()
        item_id_map[unique] = iid

        seed_items.append({
            "id": iid,
            "name": name,
            "item_type": item_type,
            "mastery_rank_required": int(mr),
            "is_user_tracked": False,
            "blueprint_source": bp_source,
            "wiki_url": wiki,
            "created_at": NOW,
            "updated_at": NOW,
        })

    # Second pass: create materials (flattened, recursive)
    for item, item_type in top_items:
        iid = item_id_map.get(item.get("uniqueName"))
        if not iid:
            continue

        materials = flatten_materials(item, all_items)

        for mat in materials:
            mat_name = mat["material_name"]
            mat_wiki = f"https://wiki.warframe.com/w/{mat_name.replace(' ', '_')}"
            seed_materials.append({
                "id": next_mat_id(),
                "craftable_item_id": iid,
                "material_name": mat_name,
                "quantity_required": mat["quantity_required"],
                "wiki_url": mat_wiki,
                "created_at": NOW,
            })

    # Generate some basic source data for common materials
    common_sources = {
        "Alloy Plate": [("Gabii", "planet", "Ceres (Dark Sector Survival)", 40.0)],
        "Polymer Bundle": [("Ophelia", "planet", "Uranus (Survival)", 35.0)],
        "Ferrite": [("Apollodorus", "planet", "Mercury (Survival)", 35.0)],
        "Nano Spores": [("Orokin Derelict", "planet", "Deimos (Survival)", 40.0)],
        "Plastids": [("Zabala", "planet", "Eris (Dark Sector Survival)", 35.0)],
        "Argon Crystal": [("Hepit", "mission", "Void (Capture)", 12.5)],
        "Orokin Cell": [("Gabii", "planet", "Ceres (Dark Sector)", 15.0)],
        "Neurodes": [("Tikal", "planet", "Earth (Dark Sector Excavation)", 30.0)],
        "Neural Sensors": [("Themisto", "mission", "Jupiter (Alad V Assassination)", 20.0)],
        "Morphics": [("Wahiba", "mission", "Mars (Dark Sector Survival)", 25.0)],
        "Gallium": [("Themisto", "mission", "Jupiter (Alad V Assassination)", 15.0)],
        "Control Module": [("Hyena Pack", "mission", "Neptune (Psamathe Assassination)", 20.0)],
        "Rubedo": [("Stephano", "planet", "Uranus (Defense)", 30.0)],
        "Salvage": [("Io", "planet", "Jupiter (Defense)", 35.0)],
        "Circuits": [("Apollodorus", "planet", "Mercury (Survival)", 25.0)],
        "Oxium": [("Io", "planet", "Jupiter (Defense)", 20.0)],
        "Cryotic": [("Hieracon", "planet", "Pluto (Dark Sector Excavation)", 35.0)],
        "Hexenon": [("Cameria", "mission", "Jupiter (Dark Sector Survival)", 20.0)],
        "Tellurium": [("Ophelia", "planet", "Uranus (Survival)", 5.0)],
        "Nitain Extract": [("Nightwave", "drop", "Nightwave Cred Offerings", 10.0)],
        "Mutagen Sample": [("Orokin Derelict", "planet", "Deimos (Survival)", 15.0)],
        "Fieldron Sample": [("The Index", "mission", "Neptune (Any Index)", 12.0)],
        "Detonite Ampule": [("Dark Sector", "planet", "Any Dark Sector mission", 15.0)],
        "Kuva": [("Kuva Siphon", "mission", "Kuva Siphon/Flood missions", 20.0)],
        "Orokin Catalyst": [("Nightwave", "drop", "Nightwave Cred Offerings", 5.0)],
        "Forma": [("Hepit", "mission", "Void Relic common reward", 12.5)],
        "Mutagen Mass": [("Dojo", "clan", "Bio Lab Research", 100.0)],
        "Fieldron": [("Dojo", "clan", "Energy Lab Research", 100.0)],
        "Detonite Injector": [("Dojo", "clan", "Chem Lab Research", 100.0)],
        "Voidgel Orb": [("Zariman", "mission", "Zariman Ten Zero missions", 15.0)],
        "Entrati Lanthorn": [("Zariman", "mission", "Zariman Ten Zero missions", 10.0)],
    }

    src_counter = [0]
    def next_src_id():
        src_counter[0] += 1
        return f"src-{src_counter[0]}"

    # Build set of all materials referenced
    all_mat_names = set(m["material_name"] for m in seed_materials)

    # Generate sources for all materials (use common_sources, fallback to generic)
    for mat_name in sorted(all_mat_names):
        if mat_name in common_sources:
            for src_name, src_type, details, chance in common_sources[mat_name]:
                seed_sources.append({
                    "id": next_src_id(),
                    "material_name": mat_name,
                    "source_name": src_name,
                    "source_type": src_type,
                    "location_details": details,
                    "drop_chance_pct": chance,
                    "is_user_tracked": False,
                    "created_at": NOW,
                })
        else:
            # Generic placeholder
            seed_sources.append({
                "id": next_src_id(),
                "material_name": mat_name,
                "source_name": "Various",
                "source_type": "drop",
                "location_details": f"Obtained from missions and enemies",
                "drop_chance_pct": 10.0,
                "is_user_tracked": False,
                "created_at": NOW,
            })

    # === OUTPUT ===
    output = f"""// Auto-generated seed data from warframe-items (WFCD)
// Generated: {NOW}
// Items: {len(seed_items)}, Materials: {len(seed_materials)}, Sources: {len(seed_sources)}

export const seedItems = {json.dumps(seed_items, indent=2)};

export const seedMaterials = {json.dumps(seed_materials, indent=2)};

export const seedSources = {json.dumps(seed_sources, indent=2)};

export const seedTreeRelationships = {json.dumps(seed_tree, indent=2)};

export const seedTodos = [];
"""

    with open(OUTPUT_FILE, "w") as f:
        f.write(output)

    print(f"\n=== Generated {OUTPUT_FILE} ===")
    print(f"  Items: {len(seed_items)}")
    print(f"  Materials: {len(seed_materials)}")
    print(f"  Sources: {len(seed_sources)}")
    print(f"  Tree relationships: {len(seed_tree)}")

    # Breakdown by type
    type_counts = {}
    for item in seed_items:
        t = item["item_type"]
        type_counts[t] = type_counts.get(t, 0) + 1
    print(f"  By type: {type_counts}")

    # Show a few samples
    print("\n--- Sample items ---")
    for item in seed_items[:5]:
        mc = sum(1 for m in seed_materials if m["craftable_item_id"] == item["id"])
        print(f"  {item['name']} ({item['item_type']}, MR{item['mastery_rank_required']}, {mc} mats, source={item['blueprint_source']})")


if __name__ == "__main__":
    main()
