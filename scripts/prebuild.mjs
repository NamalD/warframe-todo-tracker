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
import { execSync } from 'child_process';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import https from 'https';
import http from 'http';
import { URL } from 'url';

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
const SCHEMA_VERSION = 7;

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

/** Download a file from URL to disk */
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = createWriteStream(dest);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; WarframeTodoTracker/1.0; +https://github.com/NamalD/warframe-todo-tracker)',
    };
    protocol
      .get(url, { headers }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadFile(response.headers.location, dest).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        pipeline(response, file)
          .then(() => resolve())
          .catch(reject);
      })
      .on('error', reject);
  });
}

/** Decompress LZMA file */
function decompressLzma(src, dest) {
  execSync(`lzma -d -c "${src}" > "${dest}"`, { stdio: 'inherit' });
}

/** Fetch the Public Export index and return the ExportRecipes hash */
async function getExportRecipesHash() {
  const indexLzma = resolve(ROOT, 'tmp/export_index.txt.lzma');
  const indexTxt = resolve(ROOT, 'tmp/export_index.txt');
  mkdirSync(resolve(ROOT, 'tmp'), { recursive: true });

  await downloadFile(
    'https://origin.warframe.com/PublicExport/index_en.txt.lzma',
    indexLzma
  );
  decompressLzma(indexLzma, indexTxt);

  const index = readFileSync(indexTxt, 'utf8')
    .trim()
    .split(/\r?\n/)
    .find((line) => line.startsWith('ExportRecipes_'));

  if (!index) throw new Error('ExportRecipes not found in index');
  // Format: ExportRecipes_en.json!00_HashHere
  return index.split('!')[1];
}

/** Fetch and cache ExportRecipes JSON. Returns parsed data. */
async function fetchExportRecipes() {
  const cachePath = resolve(ROOT, 'public/data/export-recipes-cache.json');

  // 1. If we have a committed cache, use it immediately and skip the network.
  //    This makes prebuild deterministic in CI/offline and avoids 403s from
  //    the origin server when only the hash has changed.
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (cached && cached.hash && Array.isArray(cached.data)) {
        console.log(`[prebuild] ExportRecipes cache hit (hash: ${cached.hash})`);
        return cached.data;
      }
    } catch {
      console.warn('[prebuild] Invalid ExportRecipes cache, will re-fetch');
    }
  }

  // 2. No valid cache — download the index + manifest.
  const currentHash = await getExportRecipesHash();
  console.log(`[prebuild] Downloading ExportRecipes (hash: ${currentHash})...`);
  const url = `http://content.warframe.com/PublicExport/Manifest/ExportRecipes_en.json!${currentHash}`;
  const jsonPath = resolve(ROOT, 'tmp/export_recipes.json');
  await downloadFile(url, jsonPath);
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const data = raw.ExportRecipes || raw;

  // 3. Write cache for next time
  writeFileSync(
    cachePath,
    JSON.stringify({ hash: currentHash, data, cachedAt: new Date().toISOString() }),
    'utf8'
  );
  console.log(`[prebuild] Cached ExportRecipes (${data.length} recipes)`);

  return data;
}

/**
 * Build warframeComponentSubMaterials from ExportRecipes.
 * Maps item IDs to their component crafting requirements.
 */
function buildWarframeComponentSubMaterials(recipes, materials, itemsByUniqueName) {
  const result = {};

  // Build lookup: component_unique_name -> material_name
  const matByUniqueName = {};
  for (const m of materials) {
    if (m.component_unique_name) {
      matByUniqueName[m.component_unique_name] = m.material_name;
    }
  }

  // Override map for materials whose wfcd/derived name differs from the
  // in-game display name. Keys are the names resolved from wfcd or derived
  // from the ExportRecipes ItemType path; values are the game-facing names.
  const MATERIAL_NAME_OVERRIDES = {
    // Duviri/Entrati resources (Oraxia, etc.)
    'Duviri Murmur Item A': 'Temporal Dust',
    'Entrati Lab Misc Item B': 'Necracoil',
    'Duviri Rock Item': 'Aggristone',
    'Entrati Lab Misc Item A': 'Entrati Obols',
    'Duviri Plant Item A': 'Kovnik',
    'Duviri Mushroom Item': 'Tasoma Extract',
  };

  function resolveMaterialName(name) {
    if (MATERIAL_NAME_OVERRIDES[name]) {
      return MATERIAL_NAME_OVERRIDES[name];
    }
    return name;
  }

  // Find all Warframe main blueprints (not component blueprints, not alt helmets)
  const mainBlueprints = recipes.filter((r) => {
    const name = r.uniqueName || '';
    // Must be a WarframeRecipes blueprint
    if (!name.includes('/WarframeRecipes/')) return false;
    // Must end with Blueprint (not ComponentBlueprint)
    if (name.endsWith('ComponentBlueprint')) return false;
    // Must have a resultType that is a Warframe item (Powersuits)
    return r.resultType && r.resultType.includes('/Powersuits/');
  });

  for (const bp of mainBlueprints) {
    // Find the Warframe item by matching resultType to uniqueName
    const warframeItem = itemsByUniqueName.get(bp.resultType);
    if (!warframeItem) continue;

    const itemId = warframeItem.id;
    const warframeName = warframeItem.name;
    const components = {};

    // The main blueprint's ingredients include the components + Orokin Cells
    for (const ing of bp.ingredients || []) {
      const itemType = ing.ItemType;

      // Skip raw materials (like Orokin Cells) - only process components
      if (!itemType.includes('/WarframeRecipes/')) continue;
      if (!itemType.includes('Component')) continue;

      // Find the component blueprint
      const compBpName = itemType.replace('Component', 'Blueprint');
      const compBp = recipes.find(
        (r) => r.uniqueName === compBpName
      );

      if (!compBp) {
        console.warn(`[prebuild] No component blueprint found for ${itemType}`);
        continue;
      }

      // Determine display name: Neuroptics, Chassis, or Systems
      let displayName;
      if (itemType.includes('HelmetComponent')) {
        displayName = `${warframeName} Neuroptics`;
      } else if (itemType.includes('ChassisComponent')) {
        displayName = `${warframeName} Chassis`;
      } else if (itemType.includes('SystemsComponent')) {
        displayName = `${warframeName} Systems`;
      } else {
        // Generic fallback
        const last = itemType.split('/').pop() || '';
        displayName = last.replace('Component', '').trim();
      }

      // Map ingredient uniqueNames to material names
      const materialsList = [];
      for (const matIng of compBp.ingredients || []) {
        const matName = matByUniqueName[matIng.ItemType];
        if (matName) {
          materialsList.push({ name: resolveMaterialName(matName), quantity: matIng.ItemCount });
        } else {
          // Fallback: derive from path
          const last = matIng.ItemType.split('/').pop() || '';
          const derived = last.replace(/([a-z])([A-Z])/g, '$1 $2');
          console.warn(
            `[prebuild] No wfcd material for ${matIng.ItemType} (${derived})`
          );
          materialsList.push({ name: resolveMaterialName(derived), quantity: matIng.ItemCount });
        }
      }

      components[displayName] = {
        materials: materialsList,
        quantity: 1,
      };
    }

    if (Object.keys(components).length > 0) {
      result[itemId] = components;
    }
  }

  return result;
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

/** Convert "Ash Helmet Component" → "Ash Neuroptics", etc. */
function normalizeComponentDisplayName(materialName) {
  return materialName
    .replace(/Helmet Component$/, 'Neuroptics')
    .replace(/Chassis Component$/, 'Chassis')
    .replace(/Systems Component$/, 'Systems');
}

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
      uniqueName: rawItem.uniqueName,
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
        const displayName = normalizeComponentDisplayName(name);
        const compItem = lookupMap.get(comp.uniqueName);
        
        // A component is intermediate only if it's a DIFFERENT item from the parent
        // and that item has its own components. This prevents single-barrel weapons
        // from being marked as intermediate when their component IS the weapon itself.
        const isDifferentItem = comp.uniqueName !== rawItem.uniqueName;
        const isIntermediate = isDifferentItem && !!(compItem && compItem.components && compItem.components.length > 0);

        // Resolve sub_item_id for intermediates (weapons with craftable sub-parts)
        let subItemId = null;
        if (isIntermediate) {
          const subItem = items.find((it) => it.uniqueName === comp.uniqueName);
          if (subItem) subItemId = subItem.id;
        }

        materials.push({
          id: `mat-${matSeq++}`,
          craftable_item_id: itemId,
          material_name: displayName,
          component_unique_name: comp.uniqueName,
          quantity_required: comp.itemCount ?? 1,
          wiki_url: (compItem && compItem.wikiaUrl) || constructWikiUrl(displayName),
          is_intermediate: isIntermediate,
          sub_item_id: subItemId,
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

  // ── Warframe component sub-materials (from Public Export API) ─
  // @wfcd/items does not expose sub-component breakdowns for Warframe
  // parts (Chassis, Neuroptics, Systems). We fetch them from DE's
  // Public Export API (ExportRecipes), cache by content hash, and only
  // re-download when the hash changes.
  console.log('[prebuild] Fetching Warframe component recipes...');
  const exportRecipes = await fetchExportRecipes();

  // Build a map of uniqueName -> item for lookups
  const itemsByUniqueName = new Map();
  for (const item of items) {
    if (item.uniqueName) itemsByUniqueName.set(item.uniqueName, item);
  }

  const WARFRAME_COMPONENT_SUB_MATERIALS = buildWarframeComponentSubMaterials(
    exportRecipes,
    materials,
    itemsByUniqueName
  );

  console.log(
    `[prebuild] Populated warframeComponentSubMaterials for ${Object.keys(WARFRAME_COMPONENT_SUB_MATERIALS).length} Warframes`
  );

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

  // ── Resolve sub_item_id for intermediate materials ──────────────
  // Some components reference items that appear later in the @wfcd/items
  // list (e.g. Akbolto references Bolto, but Bolto may come after Akbolto).
  // The itemByUniqueName map was built above for treeRelationships.
  for (const mat of materials) {
    if (mat.is_intermediate && !mat.sub_item_id && mat.component_unique_name) {
      mat.sub_item_id = itemByUniqueName.get(mat.component_unique_name) || null;
    }
  }
  console.log('[prebuild] Resolved sub_item_id for intermediate materials');

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
    warframeComponentSubMaterials: WARFRAME_COMPONENT_SUB_MATERIALS,
  };

  // PREBUILD_OUT_DIR lets tests generate a fresh cache without touching the
  // committed public/data files (parallel test files parse those in place).
  const outDir = process.env.PREBUILD_OUT_DIR
    ? resolve(process.env.PREBUILD_OUT_DIR)
    : resolve(ROOT, 'public/data');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const outPath = resolve(outDir, 'wfcd-cache.json');
  writeFileSync(outPath, JSON.stringify(output), 'utf8');

  const sizeKB = (JSON.stringify(output).length / 1024).toFixed(1);
  console.log(`[prebuild] Written ${sizeKB} KB to ${outPath}`);

  // ── Relics cache (primeRelicMap) ───────────────────────────────
  // Build a map of prime item ID → component → relics that drop it.
  // This powers the "Relics Needed" section on item detail pages.
  console.log('[prebuild] Loading Relics for primeRelicMap...');
  const relicsRaw = new Items({ category: ['Relics'], i18n: false, i18nOnObject: false });
  console.log(`[prebuild] Loaded ${relicsRaw.length} relics`);

  // Build set of prime component names from our materials for matching.
  // Prime components look like "Grendel Prime Neuroptics", "Trinity Prime Systems", etc.
  const primeComponentNames = new Set();
  const primeItemIdsByName = new Map();
  for (const mat of materials) {
    const name = mat.material_name || '';
    if (name.includes(' Prime ')) {
      primeComponentNames.add(name);
      // Extract base prime item name: "Grendel Prime Neuroptics" → "Grendel Prime"
      const basePrimeName = name.replace(/ (Neuroptics|Chassis|Systems|Blueprint|Barrel|Handle|Stock|Head|Blade|Gauntlet|Chest|Legs|Wings|Carapace|Cranium|Muzzle|Grip|Link|Guard|Disc|Chain|Pouch|Hilt|Ornament|Skin|Helmet|Quiver|String|Polearm|Receiver|Boot|Cerebrum)$/, '');
      if (!primeItemIdsByName.has(basePrimeName)) {
        const item = items.find((it) => it.name === basePrimeName);
        if (item) primeItemIdsByName.set(basePrimeName, item.id);
      }
    }
  }
  console.log(`[prebuild] Prime components: ${primeComponentNames.size}, prime items: ${primeItemIdsByName.size}`);

  // Helper: check if a reward name matches a prime component name
  function matchesPrimeComponent(rewardName, componentName) {
    if (rewardName === componentName) return true;
    // Warframe parts often have "Blueprint" suffix in rewards
    if (rewardName === componentName + ' Blueprint') return true;
    // Some weapons have "Blueprint" for the main item but not parts
    if (componentName.endsWith(' Blueprint') && rewardName === componentName) return true;
    return false;
  }

  const primeRelicMap = {};
  let relicMatchCount = 0;

  for (const relic of relicsRaw) {
    if (!relic.rewards || relic.rewards.length === 0) continue;

    for (const reward of relic.rewards) {
      const rewardName = reward.item?.name || '';
      if (!rewardName.includes(' Prime ')) continue;

      // Find matching component
      for (const componentName of primeComponentNames) {
        if (matchesPrimeComponent(rewardName, componentName)) {
          // Find the prime item ID for this component
          const basePrimeName = componentName.replace(/ (Neuroptics|Chassis|Systems|Blueprint|Barrel|Handle|Stock|Head|Blade|Gauntlet|Chest|Legs|Wings|Carapace|Cranium|Muzzle|Grip|Link|Guard|Disc|Chain|Pouch|Hilt|Ornament|Skin|Helmet|Quiver|String|Polearm|Receiver|Boot|Cerebrum)$/, '');
          const itemId = primeItemIdsByName.get(basePrimeName);
          if (!itemId) continue;

          if (!primeRelicMap[itemId]) primeRelicMap[itemId] = {};
          if (!primeRelicMap[itemId][componentName]) primeRelicMap[itemId][componentName] = [];
          
          // Avoid duplicate relic entries for the same component
          const existing = primeRelicMap[itemId][componentName];
          const alreadyAdded = existing.some((e) => e.relicUniqueName === relic.uniqueName);
          if (!alreadyAdded) {
            existing.push({
              relicName: relic.name,
              relicUniqueName: relic.uniqueName,
              vaulted: !!relic.vaulted,
              rarity: reward.rarity || 'Common',
            });
            relicMatchCount++;
          }
          break;
        }
      }
    }
  }

  console.log(`[prebuild] primeRelicMap: ${relicMatchCount} relic-component pairs across ${Object.keys(primeRelicMap).length} prime items`);

  const relicsOutput = {
    version,
    schemaVersion: SCHEMA_VERSION,
    cachedAt: new Date().toISOString(),
    primeRelicMap,
  };

  const relicsOutPath = resolve(outDir, 'relics-cache.json');
  writeFileSync(relicsOutPath, JSON.stringify(relicsOutput), 'utf8');

  const relicsSizeKB = (JSON.stringify(relicsOutput).length / 1024).toFixed(1);
  console.log(`[prebuild] Relics cache: ${relicsSizeKB} KB to ${relicsOutPath}`);

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
