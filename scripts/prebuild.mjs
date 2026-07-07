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
    'Shotgun Mod': 'Shotgun Mod',
    'Shotgun': 'Shotgun Mod',
    'Melee Mod': 'Melee Mod',
    'Melee': 'Melee Mod',
    'Pistol Mod': 'Pistol Mod',
    'Pistol': 'Pistol Mod',
    'Stance Mod': 'Stance Mod',
    'Stance': 'Stance Mod',
    'Aura': 'Aura',
    'Aura Mod': 'Aura',
    'Parazon Mod': 'Parazon Mod',
    'Parazon': 'Parazon Mod',
  };
  if (map[t]) return map[t];

  // Archwing variants
  if (t.includes('Archwing') || t === 'Arch Mech' || t === 'Arch-Gun') return 'Archwing Mod';

  // Sentinel / Robotic variants
  if (t.includes('Sentinel') || t === 'Robotic') return 'Sentinel Mod';

  // Railjack / Plexus variants
  if (t.includes('Railjack') || t.includes('Plexus')) return 'Railjack Mod';

  return 'Other';
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('[prebuild] Loading @wfcd/items...');
  const { default: Items } = await import('@wfcd/items');

  const categories = ['Warframes', 'Primary', 'Secondary', 'Melee'];
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
    // Must have components to craft
    if (!item.components || item.components.length === 0) return false;
    // Exclude sentinel weapons / archwing (not typical player-craftable)
    if (item.productCategory === 'SentinelWeapons') return false;
    if (item.category === 'Archwing') return false;
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

    items.push({
      id: itemId,
      name: rawItem.name,
      item_type: categoryToItemType(rawItem.category),
      mastery_rank_required: rawItem.masteryReq ?? 0,
      is_user_tracked: false,
      blueprint_source: deriveBlueprintSource(rawItem),
      wiki_url: rawItem.wikiaUrl || constructWikiUrl(rawItem.name),
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
    cachedAt: new Date().toISOString(),
    items,
    materials,
    treeRelationships: resolvedTree,
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
