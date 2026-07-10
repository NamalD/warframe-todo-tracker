#!/usr/bin/env node
/**
 * prebuild.mjs — Extract & transform @wfcd/items data for the app.
 *
 * Usage: node scripts/prebuild.mjs
 *
 * Loads craftable Warframe items from @wfcd/items, transforms them into the
 * app's internal model (items, materials, treeRelationships), and writes the
 * result to public/data/wfcd-cache.json.
 *
 * This data is then fetched at runtime by Repository and cached in localStorage
 * for subsequent loads.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * Bump whenever this script's *output shape* changes (new fields on items/
 * materials, new top-level keys, etc.) — independent of the @wfcd/items
 * package version. The client (repository.ts) only trusts its localStorage
 * cache when both this and the package version match (see #18: a shape
 * change with no package bump previously went unnoticed by any existing
 * cache, silently hiding new fields from returning users).
 */
const SCHEMA_VERSION = 6;

// ── Helpers ──────────────────────────────────────────────────────────

/** Derive blueprint_source from item heuristics (see spec §4.2) */
function deriveBlueprintSource(item) {
  const name = item.name || '';
  const hasDrops = item.drops && item.drops.length > 0;
  const hasMissionDrop = hasDrops && item.drops.some((d) => d.type === 'Mission');
  const hasProductCategory = !!item.productCategory;

  if (name.includes('Vandal') || name.includes('Wraith')) return 'event';
  if (hasMissionDrop) return 'drop';
  if (hasProductCategory && !hasDrops) return 'market';
  return 'market';
}

/** Resolve a uniqueName like "/Lotus/Types/Items/MiscItems/OrokinCell" to "Orokin Cell" */
function resolveName(uniqueName, lookupMap) {
  if (lookupMap.has(uniqueName)) {
    return lookupMap.get(uniqueName).name;
  }
  // Fallback: extract last segment and split CamelCase
  const last = uniqueName.split('/').pop() || '';
  return last.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Map category string from @wfcd/items to app item_type */
function categoryToItemType(category) {
  const map = {
    'Warframes': 'warframe',
    'Primary': 'primary',
    'Secondary': 'secondary',
    'Melee': 'melee',
  };
  return map[category] || category.toLowerCase();
}

/** Construct a wiki URL fallback */
function constructWikiUrl(name) {
  return `https://wiki.warframe.com/w/${encodeURIComponent(name.replace(/ /g, '_'))}`;
}

/**
 * Incarnon Genesis installation costs, keyed by base weapon name.
 * @wfcd/items has no crafting/build data for Incarnon Genesis adapters (see
 * issue #5) — DE doesn't expose these in the public API/manifest — so this
 * is manually transcribed from the Warframe Wiki. All 45 Incarnon Genesis
 * weapons as of this writing.
 */
const INCARNON_GENESIS_INSTALL_COSTS = {
  Gorgon: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Tasoma Extract', quantity: 60 },
  ],
  Braton: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Tasoma Extract', quantity: 60 },
  ],
  Dread: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Tasoma Extract', quantity: 60 },
  ],
  Boltor: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Silphsela', quantity: 60 },
  ],
  Lex: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Yao Shrub', quantity: 70 },
    { name: 'Saggen Pearl', quantity: 150 },
  ],
  'Ack & Brunt': [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Ariette Scale', quantity: 300 },
  ],
  Angstrum: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Ueymag', quantity: 70 },
    { name: 'Lamentus', quantity: 80 },
  ],
  Anku: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Ueymag', quantity: 70 },
    { name: 'Ariette Scale', quantity: 300 },
  ],
  Atomos: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Yao Shrub', quantity: 70 },
    { name: 'Lamentus', quantity: 80 },
  ],
  Ballistica: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Kovnik', quantity: 80 },
    { name: 'Silphsela', quantity: 60 },
  ],
  Bo: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Kovnik', quantity: 80 },
  ],
  Boar: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Tasoma Extract', quantity: 60 },
  ],
  Bronco: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Silphsela', quantity: 60 },
  ],
  Burston: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Maw Fang', quantity: 20 },
  ],
  'Ceramic Dagger': [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Connla Sprout', quantity: 80 },
  ],
  Cestra: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Saggen Pearl', quantity: 150 },
    { name: 'Kovnik', quantity: 80 },
  ],
  Dera: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Eevani', quantity: 80 },
    { name: 'Ueymag', quantity: 70 },
  ],
  Despair: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Silphsela', quantity: 60 },
    { name: 'Yao Shrub', quantity: 70 },
  ],
  Destreza: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Rune Marrow', quantity: 60 },
  ],
  'Dual Ichor': [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Kovnik', quantity: 80 },
  ],
  'Dual Toxocyst': [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Yao Shrub', quantity: 70 },
    { name: 'Eevani', quantity: 80 },
  ],
  Furax: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Ariette Scale', quantity: 300 },
  ],
  Furis: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Yao Shrub', quantity: 70 },
    { name: 'Lamentus', quantity: 80 },
  ],
  Gammacor: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Ueymag', quantity: 70 },
    { name: 'Lamentus', quantity: 80 },
  ],
  Hate: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Maw Fang', quantity: 20 },
  ],
  Kunai: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Yao Shrub', quantity: 70 },
    { name: 'Eevani', quantity: 80 },
  ],
  Lato: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Yao Shrub', quantity: 70 },
    { name: 'Nacreous Pebble', quantity: 100 },
  ],
  Latron: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Maw Fang', quantity: 20 },
  ],
  Magistar: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Aggristone', quantity: 150 },
  ],
  Miter: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Tasoma Extract', quantity: 60 },
  ],
  'Nami Solo': [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Aggristone', quantity: 150 },
  ],
  Obex: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Nacreous Pebble', quantity: 100 },
    { name: 'Lamentus', quantity: 80 },
  ],
  Okina: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Maw Fang', quantity: 20 },
    { name: 'Lamentus', quantity: 80 },
  ],
  Paris: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Silphsela', quantity: 60 },
  ],
  Sibear: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Connla Sprout', quantity: 80 },
  ],
  Sicarus: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Nacreous Pebble', quantity: 100 },
    { name: 'Aggristone', quantity: 150 },
  ],
  Skana: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Dracroot', quantity: 70 },
    { name: 'Connla Sprout', quantity: 80 },
  ],
  Soma: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Silphsela', quantity: 60 },
  ],
  Strun: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Tasoma Extract', quantity: 60 },
  ],
  Stug: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Aggristone', quantity: 150 },
    { name: 'Tasoma Extract', quantity: 60 },
  ],
  Sybaris: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Saggen Pearl', quantity: 150 },
    { name: 'Ueymag', quantity: 70 },
  ],
  Torid: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Rune Marrow', quantity: 60 },
    { name: 'Maw Fang', quantity: 20 },
  ],
  Vasto: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Yao Shrub', quantity: 70 },
    { name: 'Saggen Pearl', quantity: 150 },
  ],
  Vectis: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Eevani', quantity: 80 },
    { name: 'Saggen Pearl', quantity: 150 },
  ],
  Zylok: [
    { name: 'Pathos Clamp', quantity: 20 },
    { name: 'Yao Shrub', quantity: 70 },
    { name: 'Nacreous Pebble', quantity: 100 },
  ],
};

/**
 * Variant names that share an Incarnon Genesis adapter with a base weapon.
 */
const INCARNON_VARIANT_MAP = {
  'Prisma Gorgon': 'Gorgon',
  'Mk1-Strun': 'Strun',
  'Prisma Angstrum': 'Angstrum',
  'Rakta Ballistica': 'Ballistica',
  'Mk1-Braton': 'Braton',
  'Mk1-Bo': 'Bo',
  'Telos Boltor': 'Boltor',
  'Mk1-Furax': 'Furax',
  'Dex Furis': 'Furis',
  'Mk1-Furis': 'Furis',
  'Mk1-Kunai': 'Kunai',
  'Lato Prime': 'Lato',
  'Sancti Magistar': 'Magistar',
  'Machete Wraith': 'Machete',
  'Prisma Machete': 'Machete',
  'Prisma Obex': 'Obex',
  'Mk1-Paris': 'Paris',
  'Prisma Skana': 'Skana',
  'Skana Prime': 'Skana',
  'Dex Sybaris': 'Sybaris',
};

/** Helpers to look up Incarnon costs by base name or variant name */
function getIncarnonCost(name) {
  return INCARNON_GENESIS_INSTALL_COSTS[name] || INCARNON_GENESIS_INSTALL_COSTS[INCARNON_VARIANT_MAP[name]];
}
function hasIncarnonGenesis(name) {
  return !!getIncarnonCost(name);
}

/**
 * Normalize raw WFCD mod type to our app model.
 * See docs/designs/mod-tracking-feature.md §3.3
 */
function normalizeModType(rawType) {
  if (!rawType) return 'Other';
  const t = rawType.trim();

  // Direct matches
  const map = {
    'Warframe Mod': 'Warframe Mod',
    'Warframe': 'Warframe Mod',
    'Rifle Mod': 'Rifle Mod',
    'Rifle': 'Rifle Mod',
    'Primary Mod': 'Primary Mod',
    'Primary': 'Primary Mod',
    'Shotgun Mod': 'Shotgun Mod',
    'Shotgun': 'Shotgun Mod',
    'Melee Mod': 'Melee Mod',
    'Melee': 'Melee Mod',
    'Pistol Mod': 'Pistol Mod',
    'Pistol': 'Pistol Mod',
    'Secondary Mod': 'Secondary Mod',
    'Secondary': 'Secondary Mod',
    'Stance Mod': 'Stance Mod',
    'Stance': 'Stance Mod',
    'Aura': 'Aura',
    'Aura Mod': 'Aura',
    'Parazon Mod': 'Parazon Mod',
    'Parazon': 'Parazon Mod',
    'Arch-Gun Mod': 'Arch-Gun Mod',
    'Archwing Mod': 'Archwing Mod',
    'Arch-Melee Mod': 'Arch-Melee Mod',
    'Necramech Mod': 'Necramech Mod',
    'K-Drive Mod': 'K-Drive Mod',
    'Posture Mod': 'Posture Mod',
    'Peculiar Mod': 'Peculiar Mod',
    'Companion Mod': 'Companion Mod',
    'Companion': 'Companion Mod',
    'Sentinel Mod': 'Sentinel Mod',
    'Sentinel': 'Sentinel Mod',
    'Robotic': 'Sentinel Mod',
    'Transmutation Mod': 'Transmutation Mod',
    'Mod Set Mod': 'Mod Set Mod',
    'Railjack Mod': 'Railjack Mod',
    'Plexus Mod': 'Plexus Mod',
    'Focus Way Mod': 'Focus Way Mod',
    'Tektolyst Artifact Mod': 'Tektolyst Artifact Mod',
  };
  if (map[t]) return map[t];

  return 'Other';
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('[prebuild] Loading @wfcd/items...');
  const { default: Items } = await import('@wfcd/items');

  const categories = ['Warframes', 'Primary', 'Secondary', 'Melee', 'Sentinels'];
  console.log(`[prebuild] Loading categories: ${categories.join(', ')}`);

  const raw = new Items({ category: categories, i18n: false, i18nOnObject: false });
  console.log(`[prebuild] Loaded ${raw.length} total items`);

  // Build uniqueName → item lookup map
  const lookupMap = new Map();
  for (const item of raw) {
    if (item.uniqueName) {
      lookupMap.set(item.uniqueName, item);
    }
  }
  console.log(`[prebuild] Lookup map: ${lookupMap.size} entries`);

  // Filter to craftable items (has components array)
  const craftable = raw.filter((item) => {
    // Exclude sentinel weapons / archwing (not typical player-craftable)
    if (item.productCategory === 'SentinelWeapons') return false;
    if (item.category === 'Archwing') return false;
    // Must have components to craft — except items with no blueprint (e.g.
    // market-bought weapons like Lex) that still need an Incarnon Genesis
    // install cost tracked.
    if (!item.components || item.components.length === 0) {
      return hasIncarnonGenesis(item.name);
    }
    return true;
  });
  console.log(`[prebuild] Craftable items: ${craftable.length}`);

  // ── Transform items ──────────────────────────────────────────────
  const items = [];
  const materials = [];
  const treeRelationships = [];
  let itemSeq = 1;
  let matSeq = 1;
  let treeSeq = 1;

  for (const rawItem of craftable) {
    const itemId = `item-${itemSeq++}`;
    const incarnonCost = getIncarnonCost(rawItem.name);

    items.push({
      id: itemId,
      name: rawItem.name,
      item_type: categoryToItemType(rawItem.category),
      mastery_rank_required: rawItem.masteryReq ?? 0,
      is_user_tracked: false,
      blueprint_source: deriveBlueprintSource(rawItem),
      wiki_url: rawItem.wikiaUrl || constructWikiUrl(rawItem.name),
      has_incarnon_genesis: !!incarnonCost,
      track_incarnon_install: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // ── Flatten components → materials ────────────────────────────
    if (rawItem.components) {
      for (const comp of rawItem.components) {
        const name = resolveName(comp.uniqueName, lookupMap);
        const compItem = lookupMap.get(comp.uniqueName);
        const isIntermediate = compItem && compItem.components && compItem.components.length > 0;

        materials.push({
          id: `mat-${matSeq++}`,
          craftable_item_id: itemId,
          material_name: name,
          component_unique_name: comp.uniqueName,
          quantity_required: comp.itemCount ?? 1,
          wiki_url: (compItem && compItem.wikiaUrl) || constructWikiUrl(name),
          is_intermediate: isIntermediate,
          is_incarnon_install: false,
          created_at: new Date().toISOString(),
        });
      }
    }

    // ── Incarnon Genesis install cost (not part of @wfcd/items) ────
    if (incarnonCost) {
      for (const mat of incarnonCost) {
        materials.push({
          id: `mat-${matSeq++}`,
          craftable_item_id: itemId,
          material_name: mat.name,
          component_unique_name: null,
          quantity_required: mat.quantity,
          wiki_url: constructWikiUrl(mat.name),
          is_intermediate: false,
          is_incarnon_install: true,
          created_at: new Date().toISOString(),
        });
      }
    }

    // ── Build tree from parents ────────────────────────────────────
    if (rawItem.parents && rawItem.parents.length > 0) {
      for (const parentUniqueName of rawItem.parents) {
        const parent = lookupMap.get(parentUniqueName);
        // Parent must be in our craftable list to get an ID
        const parentItem = items.find((it) => {
          const origItem = craftable.find(
            (ci) => ci.uniqueName === parentUniqueName
          );
          return origItem && it.name === origItem.name;
        });

        // Simpler: store by uniqueName for cross-ref after all items built
        treeRelationships.push({
          id: `tree-${treeSeq++}`,
          parent_unique_name: parentUniqueName,
          child_item_id: itemId,
          quantity_required: 1,
        });
      }
    }
  }

  // ── Custom vendor items (not in @wfcd/items) ────────────────────
  // Tektolyst Artifacts — Focus School weapons from Marie Leroux
  // Purchase: 150 Lyroic Bridge + 150 Ren Hypercore + 150 Ascaris Prime
  const customSeqStart = craftable.length + 1;
  const CUSTOM_VENDOR_ITEMS = [
    { name: 'Lorak', school: 'Zenurik', type: 'Grimoire', wiki: 'https://wiki.warframe.com/w/Lorak' },
    { name: 'Vexoric', school: 'Naramon', type: 'Sword', wiki: 'https://wiki.warframe.com/w/Vexoric' },
    { name: 'Thara', school: 'Madurai', type: 'Staff', wiki: 'https://wiki.warframe.com/w/Thara' },
    { name: 'Cogron', school: 'Unairu', type: 'Fist', wiki: 'https://wiki.warframe.com/w/Cogron' },
    { name: 'Nidri', school: 'Vazarin', type: 'Scythe', wiki: 'https://wiki.warframe.com/w/Nidri' },
  ];
  const purchaseMaterials = [
    { name: 'Lyroic Bridge', qty: 150 },
    { name: 'Ren Hypercore', qty: 150 },
    { name: 'Ascaris Prime', qty: 150 },
  ];

  for (const vi of CUSTOM_VENDOR_ITEMS) {
    const itemId = `item-${craftable.length + 1}`;
    items.push({
      id: itemId,
      name: vi.name,
      item_type: 'tektolyst_artifact',
      mastery_rank_required: 5,
      wiki_url: vi.wiki,
      blueprint_source: `Marie Leroux (${vi.school})`,
      has_incarnon_genesis: false,
      track_incarnon_install: false,
      is_user_tracked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    craftable.push({ uniqueName: `custom-${vi.name.toLowerCase()}`, name: vi.name });

    for (const mat of purchaseMaterials) {
      materials.push({
        id: `mat-${matSeq++}`,
        craftable_item_id: itemId,
        material_name: mat.name,
        component_unique_name: `custom-${mat.name.toLowerCase().replace(/ /g, '_')}`,
        quantity_required: mat.qty,
        is_incarnon_install: false,
        is_intermediate: false,
        wiki_url: constructWikiUrl(mat.name),
      });
    }
  }

  console.log(`[prebuild] Custom vendor items: ${CUSTOM_VENDOR_ITEMS.length}`);

  // ── Resolve tree relationships to IDs ───────────────────────────
  const itemByUniqueName = new Map();
  for (let i = 0; i < craftable.length; i++) {
    itemByUniqueName.set(craftable[i].uniqueName, `item-${i + 1}`);
  }

  const resolvedTree = [];
  let resolvedTreeSeq = 1;
  for (const rel of treeRelationships) {
    const parentId = itemByUniqueName.get(rel.parent_unique_name);
    if (parentId) {
      resolvedTree.push({
        id: `tree-${resolvedTreeSeq++}`,
        parent_item_id: parentId,
        child_item_id: rel.child_item_id,
        quantity_required: rel.quantity_required,
      });
    }
  }

  console.log(`[prebuild] Items: ${items.length}`);
  console.log(`[prebuild] Materials: ${materials.length}`);
  console.log(`[prebuild] Tree relationships: ${resolvedTree.length}`);

  // ── Sources (material drop locations) ───────────────────────────
  // Common crafting resources (Orokin Cell, Alloy Plate, etc.) live in the
  // Misc category with type "Resource", not the Resources category alone —
  // load both and derive sources from any entry with a non-empty `drops`
  // array (see docs/wfcd-integration.md §7).
  console.log('[prebuild] Loading Misc+Resources for sources...');
  const resourcePool = new Items({ category: ['Misc', 'Resources'], i18n: false, i18nOnObject: false });
  console.log(`[prebuild] Loaded ${resourcePool.length} misc/resource items`);

  const sources = [];
  let sourceSeq = 1;
  for (const res of resourcePool) {
    if (!res.drops || res.drops.length === 0) continue;
    for (const d of res.drops) {
      sources.push({
        id: `source-${sourceSeq++}`,
        material_name: res.name,
        source_name: d.location || 'Unknown',
        source_type: (d.type || 'unknown').toLowerCase(),
        location_details: `${d.rarity || 'Unknown'} (${d.rotation || 'any rotation'})`,
        drop_chance_pct: d.chance ?? 0,
        is_user_tracked: false,
        created_at: new Date().toISOString(),
      });
    }
  }
  console.log(`[prebuild] Sources: ${sources.length}`);

  // ── Get package version ─────────────────────────────────────────
  const pkgPath = resolve(ROOT, 'node_modules/@wfcd/items/package.json');
  let version = 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    version = pkg.version;
  } catch (e) {
    console.warn('[prebuild] Could not read @wfcd/items version:', e.message);
  }

  // ── Write output ────────────────────────────────────────────────
  const output = {
    version,
    schemaVersion: SCHEMA_VERSION,
    cachedAt: new Date().toISOString(),
    items,
    materials,
    treeRelationships: resolvedTree,
    sources,
  };

  const outDir = resolve(ROOT, 'public/data');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const outPath = resolve(outDir, 'wfcd-cache.json');
  writeFileSync(outPath, JSON.stringify(output), 'utf8');

  const sizeKB = (JSON.stringify(output).length / 1024).toFixed(1);
  console.log(`[prebuild] Written ${sizeKB} KB to ${outPath}`);

  // ── Mods cache ────────────────────────────────────────────────
  console.log('[prebuild] Loading Mods category...');
  const modsRaw = new Items({ category: ['Mods'], i18n: false, i18nOnObject: false });
  console.log(`[prebuild] Loaded ${modsRaw.length} mods`);

  const mods = [];
  let modSeq = 1;

  for (const mod of modsRaw) {
    // Safety: skip mods with no name
    if (!mod.name) continue;

    const polarity = mod.polarity || '';
    const rarity = mod.rarity || 'Common';
    const baseDrain = mod.baseDrain ?? 0;
    const fusionLimit = mod.fusionLimit ?? 0;
    const isPrime = mod.isPrime ?? false;
    const isAugment = mod.isAugment ?? false;
    const isUmbral = mod.name.includes('Umbral');
    const compatName = mod.compatName || null;
    const uniqueName = mod.uniqueName || '';
    const wikiUrl = mod.wikiaUrl || null;

    mods.push({
      id: `mod-${modSeq++}`,
      name: mod.name,
      mod_type: normalizeModType(mod.type),
      polarity,
      rarity,
      base_drain: baseDrain,
      fusion_limit: fusionLimit,
      is_prime: isPrime,
      is_augment: isAugment,
      is_umbral: isUmbral,
      compat_name: compatName,
      unique_name: uniqueName,
      wiki_url: wikiUrl,
    });
  }

  const modsOutput = {
    version,
    schemaVersion: SCHEMA_VERSION,
    cachedAt: new Date().toISOString(),
    mods,
  };

  const modsOutPath = resolve(outDir, 'mods-cache.json');
  writeFileSync(modsOutPath, JSON.stringify(modsOutput), 'utf8');

  const modsSizeKB = (JSON.stringify(modsOutput).length / 1024).toFixed(1);
  console.log(`[prebuild] Mods: ${mods.length} (${modsSizeKB} KB to ${modsOutPath})`);
  console.log('[prebuild] Done!');
}

main().catch((err) => {
  console.error('[prebuild] Error:', err);
  process.exit(1);
});
