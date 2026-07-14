/**
 * Shared TypeScript interfaces for the Warframe TODO Tracker data model.
 *
 * These types are pure (no runtime dependencies) and can be imported
 * by both client components (app/, src/) and server code (API routes,
 * sqlite helpers) without pulling in Node.js specifics.
 *
 * IMPORTANT: This file must NOT import from:
 *   - 'better-sqlite3' (server-only)
 *   - 'fs' / 'path' / 'node:*' (server-only)
 *   - 'server-only' (side-effect import)
 *   - React / Next.js (adds unnecessary client weight to server code)
 *
 * Keep it to pure TypeScript interfaces and type aliases.
 */

// ═══════════════════════════════════════════════════════════════════
// Reference data (from public/data/wfcd-cache.json)
// ═══════════════════════════════════════════════════════════════════

export interface Item {
  id: string;
  name: string;
  item_type: string;
  mastery_rank_required: number;
  is_user_tracked: boolean;
  blueprint_source: string;
  wiki_url: string;
  created_at: string;
  updated_at: string;
  track_incarnon_install?: boolean;
  incarnon_installed?: boolean;
}

export interface Material {
  id: string;
  craftable_item_id: string;
  material_name: string;
  component_unique_name: string;
  quantity_required: number;
  wiki_url: string;
  created_at: string;
  is_incarnon_install?: boolean;
}

export interface TreeRelationship {
  id: string;
  parent_item_id: string;
  child_item_id: string;
  quantity_required: number;
  created_at: string;
}

export interface Source {
  id: string;
  material_name: string;
  source_name: string;
  source_type: string;
  location_details: string;
  drop_chance_pct: number;
  is_user_tracked: boolean;
  created_at: string;
}

export interface WfcdCache {
  version: string;
  schemaVersion?: number;
  cachedAt: string;
  items: Item[];
  materials: Material[];
  treeRelationships: TreeRelationship[];
  sources: Source[];
}

// ═══════════════════════════════════════════════════════════════════
// Mods reference data (from public/data/mods-cache.json)
// ═══════════════════════════════════════════════════════════════════

export interface ModEntry {
  id: string;
  name: string;
  type: string;
  polarity: string;
  rarity: string;
  fusion_limit: number;
  base_drain: number;
  description: string;
  wiki_url: string;
  is_primed: boolean;
  is_umbral: boolean;
  is_amalgam: boolean;
  is_set: boolean;
  set_name: string | null;
  compatible_weapon_types: string[];
  compatible_warframes?: string[];
  drops: ModDrop[];
}

export interface ModDrop {
  source: string;
  chance: number;
  location: string;
}

export interface ModCollectionEntry {
  owned: boolean;
  rank: number;
}

/** Maps mod ID → user state */
export type ModCollection = Record<string, ModCollectionEntry>;

export interface ModsCache {
  version: string;
  schemaVersion: number;
  cachedAt: string;
  mods: ModEntry[];
}

// ═══════════════════════════════════════════════════════════════════
// User-generated data — Todos
// ═══════════════════════════════════════════════════════════════════

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'abandoned' | 'blocked';
export type TodoPriority = 'low' | 'medium' | 'high';

export interface Todo {
  id: string;
  craftable_item_id: string | null;
  linked_material_name: string | null;
  user_notes: string;
  status: TodoStatus;
  priority: TodoPriority;
  due_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════
// User-generated data — Materials inventory
// ═══════════════════════════════════════════════════════════════════

/** Maps material name → quantity owned */
export type MaterialInventory = Record<string, number>;

// ═══════════════════════════════════════════════════════════════════
// User-generated data — Loadouts
// ═══════════════════════════════════════════════════════════════════

export type SlotType = 'warframe' | 'primary' | 'secondary' | 'melee' | 'companion' | 'archwing' | 'necramech' | 'other';

export interface Requirement {
  id: string;
  loadout_slot_id?: string;
  build_id?: string;
  name: string;
  wiki_url: string | null;
  user_notes: string;
  acquired: boolean;
  display_order: number;
}

export interface LoadoutSlot {
  id: string;
  loadout_id: string;
  slot_type: SlotType;
  item_id: string | null;
  custom_item_name: string | null;
  acquired: boolean;
  notes: string;
  display_order: number;
  requirements: Requirement[];
}

/**
 * Server-side loadout (as stored in SQLite).
 * The `data` field is a JSON blob containing the full nested structure
 * (slots, requirements, materials). Client-side we flatten this via
 * LoadoutRepository.flattenLoadout().
 */
export interface ServerLoadout {
  id: string;
  name: string;
  data: string; // JSON blob
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * Client-side loadout with flattened data.
 * After stripping the `data` JSON blob, the nested fields
 * (slots, etc.) are spread onto the top-level object.
 */
export interface ClientLoadout {
  id: string;
  name: string;
  version: number;
  created_at: string;
  updated_at: string;
  slots: LoadoutSlot[];
}

// ═══════════════════════════════════════════════════════════════════
// User-generated data — Builds
// ═══════════════════════════════════════════════════════════════════

export interface Build {
  id: string;
  name: string;
  item_id: string | null;
  custom_item_name: string | null;
  acquired: boolean;
  notes: string;
  wiki_url: string | null;
  created_at: string;
  updated_at: string;
  requirements: Requirement[];
}

// ═══════════════════════════════════════════════════════════════════
// API response shapes
// ═══════════════════════════════════════════════════════════════════

/** Standard API response wrapper used by /api/todos, /api/loadouts, etc. */
export interface ApiResponse<T> {
  data: T;
}

/** Shape returned by /api/sync for version-vector batch sync */
export interface SyncPayload {
  todos: Array<{ id: string; clientVersion: number }>;
  materials: Array<{ material_name: string; clientVersion: number }>;
  loadouts: Array<{ id: string; clientVersion: number }>;
}

// ═══════════════════════════════════════════════════════════════════
// Material aggregation (shopping list)
// ═══════════════════════════════════════════════════════════════════

export interface AggregatedMaterial {
  material_name: string;
  total_required: number;
  total_owned: number;
  needed: number;
  sources: string[];
}

/**
 * Represents a single material requirement from a todo item.
 * Used by material-aggregator.ts to sum up crafting needs.
 */
export interface MaterialRequirement {
  material_name: string;
  quantity_required: number;
}
