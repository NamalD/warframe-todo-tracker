// @ts-nocheck
'use client';

import { toast } from '../toast/toast-bus.ts';

/**
 * @typedef {import('../types/data').Item} Item
 * @typedef {import('../types/data').Material} Material
 * @typedef {import('../types/data').Source} Source
 * @typedef {import('../types/data').TreeRelationship} TreeRelationship
 * @typedef {import('../types/data').Todo} Todo
 * @typedef {import('../types/data').MaterialInventory} MaterialInventory
 */

const ITEMS_CACHE_KEY = 'warframe-items-cache';
const OLD_TODOS_KEY = 'warframe-todos';
const OLD_MATERIALS_KEY = 'warframe-materials-inventory';

// Fallback seed todos (used when server has no data)
const SEED_TODOS = [
  {
    id: 'todo-1',
    craftable_item_id: 'item-1',
    linked_material_name: null,
    user_notes: 'Craft Excalibur before the week-end farming sprint',
    status: 'in_progress',
    priority: 'high',
    due_at: null,
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  },
  {
    id: 'todo-2',
    craftable_item_id: 'item-4',
    linked_material_name: 'Argon Crystal',
    user_notes: 'Argon decays — farm in Void first',
    status: 'pending',
    priority: 'medium',
    due_at: null,
    created_at: '2026-07-06T00:00:00Z',
    updated_at: '2026-07-06T00:00:00Z'
  }
];

export default class Repository {
  /** @type {Item[]} */
  items = [];
  /** @type {Material[]} */
  materials = [];
  /** @type {Source[]} */
  sources = [];
  /** @type {TreeRelationship[]} */
  treeRelationships = [];
  /** @type {Record<string, { [componentName: string]: { materials: Array<{ name: string; quantity: number }>; quantity: number } }>} */
  warframeComponentSubMaterials = {};
  /** @type {Todo[]} */
  todos = [...SEED_TODOS.map(t => ({ ...t }))];
  /** @type {MaterialInventory} */
  materialInventory = {};

  // Per-material server row versions, required for PATCH conflict detection.
  // Seeded by initMaterials(), advanced from each PATCH response — see #117.
  /** @type {Record<string, number>} */
  #materialVersions = {};

  // Private fields
  #initialized = false;
  #refDataInitialized = false;
  /** @type {Promise<void> | null} */
  #refDataInitPromise = null;

  async initTodos() {
    try {
      const res = await fetch('/api/todos');
      if (res.ok) {
        const body = await res.json();
        const serverData = (body && typeof body === 'object' && 'data' in body) ? body.data : body;
        if (Array.isArray(serverData) && serverData.length > 0) {
          this.todos = serverData;
        } else {
          // Server empty — check for orphaned localStorage data from the
          // old sync-layer era (pre-#23/#19) and migrate it to the server.
          if (!(await this.#migrateTodosFromLocalStorage())) {
            // No localStorage data either — use seed data locally
            this.todos = [...SEED_TODOS];
          }
        }
      } else {
        this.todos = [...SEED_TODOS];
      }
    } catch (err) {
      console.warn('Repository initTodos failed:', err);
      this.todos = [...SEED_TODOS];
    }
  }

  async initMaterials() {
    try {
      const res = await fetch('/api/materials');
      if (res.ok) {
        const body = await res.json();
        const hasEnvelope = body && typeof body === 'object' && 'data' in body;
        const serverData = hasEnvelope ? body.data : body;
        this.#materialVersions = (hasEnvelope && body.versions && typeof body.versions === 'object') ? body.versions : {};
        if (typeof serverData === 'object' && serverData !== null && !Array.isArray(serverData) && Object.keys(serverData).length > 0) {
          this.materialInventory = serverData;
        } else {
          // Server empty — try migrating from old localStorage
          if (!this.#migrateMaterialsFromLocalStorage()) {
            this.materialInventory = {};
          }
        }
      } else {
        this.materialInventory = {};
      }
    } catch {
      this.materialInventory = {};
    }
  }

  #migrateMaterialsFromLocalStorage() {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(OLD_MATERIALS_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return false;
      this.materialInventory = data;
      localStorage.removeItem(OLD_MATERIALS_KEY);
      return true;
    } catch { return false; }
  }

  /**
   * One-time migration: read old localStorage data from the sync-layer era
   * (pre-#23/#19) and push it to the server so it's not lost.
   * @returns {Promise<boolean>} true if data was migrated
   */
  async #migrateTodosFromLocalStorage() {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(OLD_TODOS_KEY);
      if (!raw) return false;
      const localTodos = JSON.parse(raw);
      if (!Array.isArray(localTodos) || localTodos.length === 0) return false;
      this.todos = localTodos;
      await fetch('/api/todos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: localTodos, version: 0 }),
      });
      localStorage.removeItem(OLD_TODOS_KEY);
      return true;
    } catch { return false; }
  }

  async #pushTodos() {
    try {
      const res = await fetch('/api/todos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: this.todos, version: 0 }),
      });
      if (!res.ok) toast.error("Couldn't save your to-do changes");
    } catch {
      toast.error("Couldn't save your to-do changes");
    }
  }

  #ensureRefDataInitialized() {
    if (this.#refDataInitialized) return Promise.resolve();
    if (this.#refDataInitPromise) return this.#refDataInitPromise;
    this.#refDataInitPromise = this.#loadData();
    return this.#refDataInitPromise;
  }

  async #loadData() {
    if (typeof window === 'undefined') return;
    try {
      const response = await fetch('/data/wfcd-cache.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const fetched = await response.json();

      if (typeof window !== 'undefined') {
        const cachedRaw = localStorage.getItem(ITEMS_CACHE_KEY);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            if (cached.version === fetched.version && cached.schemaVersion === fetched.schemaVersion && cached.items) {
              this.items = cached.items;
              this.materials = cached.materials || [];
              this.treeRelationships = cached.treeRelationships || [];
              this.sources = cached.sources || [];
              this.warframeComponentSubMaterials = cached.warframeComponentSubMaterials || {};
              this.#refDataInitialized = true;
              // Merge server-side item flags into cached data
              await this.#syncUserItemFlags().catch(() => {});
              return;
            }
          } catch (_e) { /* fall through */ }
        }
      }

      this.items = fetched.items || [];
      this.materials = fetched.materials || [];
      this.treeRelationships = fetched.treeRelationships || [];
      this.sources = fetched.sources || [];
      this.warframeComponentSubMaterials = fetched.warframeComponentSubMaterials || {};

      if (typeof window !== 'undefined') {
        localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify({
          version: fetched.version,
          schemaVersion: fetched.schemaVersion,
          cachedAt: fetched.cachedAt,
          items: fetched.items,
          materials: fetched.materials,
          treeRelationships: fetched.treeRelationships,
          sources: fetched.sources,
          warframeComponentSubMaterials: fetched.warframeComponentSubMaterials,
        }));
      }
      this.#refDataInitialized = true;
      // Merge persisted item flags (tracked, Incarnon) from server
      await this.#syncUserItemFlags().catch(() => {});
    } catch (err) {
      if (typeof window !== 'undefined') {
        const cachedRaw = localStorage.getItem(ITEMS_CACHE_KEY);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            this.items = cached.items || [];
            this.materials = cached.materials || [];
            this.treeRelationships = cached.treeRelationships || [];
            this.sources = cached.sources || [];
            this.warframeComponentSubMaterials = cached.warframeComponentSubMaterials || {};
            this.#refDataInitialized = true;
            return;
          } catch (_e) { /* fall through */ }
        }
      }
      console.error('Failed to load Warframe item data:', err);
      this.#refDataInitialized = true;
    }
  }

  // Material Inventory
  getMaterialInventory() { return { ...this.materialInventory }; }
  getOwnedQuantity(materialName) { return this.materialInventory[materialName] ?? 0; }
  setOwnedQuantity(materialName, qty) {
    const parsed = parseInt(qty, 10);
    if (isNaN(parsed) || parsed < 0) this.materialInventory[materialName] = 0;
    else this.materialInventory[materialName] = parsed;
    this.#patchMaterial(materialName, this.materialInventory[materialName]).catch(() => {});
    return this.materialInventory[materialName];
  }

  async #patchMaterial(name, quantity, retried = false) {
    try {
      const res = await fetch('/api/materials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_name: name, quantity, clientVersion: this.#materialVersions[name] ?? 0 }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated && typeof updated.version === 'number') {
          this.#materialVersions[name] = updated.version;
        }
      } else if (res.status === 409 && !retried) {
        // Our version is stale (another device wrote, or we never learned it).
        // The user just typed this quantity, so their edit wins: adopt the
        // server version and retry once.
        const conflict = await res.json().catch(() => null);
        if (conflict && typeof conflict.server_version === 'number') {
          this.#materialVersions[name] = conflict.server_version;
          await this.#patchMaterial(name, quantity, true);
        }
      } else {
        toast.error("Couldn't save material inventory");
      }
    } catch {
      toast.error("Couldn't save material inventory");
    }
  }

  // Items (async — lazy init)
  async updateItem(id, updates) {
    await this.#ensureRefDataInitialized();
    const target = this.items.find((i) => i.id === id);
    if (!target) return null;
    Object.assign(target, updates);
    this.#persistItems();

    // Push flag changes to the server for cross-device sync
    const promises = [];
    for (const [key, value] of Object.entries(updates)) {
      if (['is_user_tracked', 'track_incarnon_install', 'incarnon_installed'].includes(key)) {
        promises.push(this.#pushUserItemFlag(id, key, value));
      }
    }
    await Promise.allSettled(promises);

    return { ...target };
  }

  async getAllItems() {
    await this.#ensureRefDataInitialized();
    return this.items.map((it) => ({ ...it }));
  }

  async getItemById(id) {
    await this.#ensureRefDataInitialized();
    const item = this.items.find((i) => i.id === id);
    return item ? { ...item } : null;
  }

  async getMaterialsForItem(id) {
    await this.#ensureRefDataInitialized();
    return this.materials.filter((m) => m.craftable_item_id === id).map((m) => ({ ...m }));
  }

  // Persist items to localStorage cache so tracking flags survive page reloads
  #persistItems() {
    if (typeof window === 'undefined') return;
    const existing = localStorage.getItem(ITEMS_CACHE_KEY);
    let cacheData = {};
    if (existing) { try { cacheData = JSON.parse(existing); } catch {} }
    cacheData.items = this.items;
    localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify(cacheData));
  }

  /**
   * Fetch per-item user flags from the server and merge them into
   * the in-memory items array. Syncs: is_user_tracked, track_incarnon_install,
   * incarnon_installed.
   */
  async #syncUserItemFlags() {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch('/api/user-items');
      if (!res.ok) return;
      const body = await res.json();
      const flags = body.data || {};
      for (const item of this.items) {
        const f = flags[item.id];
        if (f) {
          if (f.is_user_tracked !== undefined) item.is_user_tracked = f.is_user_tracked;
          if (f.track_incarnon_install !== undefined) item.track_incarnon_install = f.track_incarnon_install;
          if (f.incarnon_installed !== undefined) item.incarnon_installed = f.incarnon_installed;
        }
      }
    } catch { /* best-effort */ }
  }

  /**
   * Push a single item flag change to the server.
   */
  async #pushUserItemFlag(itemId, field, value) {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch('/api/user-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, fields: { [field]: value } }),
      });
      if (!res.ok) toast.error("Couldn't save item tracking");
    } catch {
      toast.error("Couldn't save item tracking");
    }
  }

  // Sources
  async getAllSources() {
    await this.#ensureRefDataInitialized();
    return this.sources.map((s) => ({ ...s }));
  }

  async getSourcesForMaterial(name) {
    await this.#ensureRefDataInitialized();
    return this.sources.filter((s) => s.material_name === name).map((s) => ({ ...s }));
  }

  // Tree Relationships
  async getTreeForItem(id) {
    await this.#ensureRefDataInitialized();
    const children = this.treeRelationships
      .filter((r) => r.parent_item_id === id)
      .map((r) => {
        const child = this.items.find((it) => it.id === r.child_item_id);
        return { id: r.id, quantity_required: r.quantity_required, child: child ? { ...child } : null };
      });
    const parents = this.treeRelationships
      .filter((r) => r.child_item_id === id)
      .map((r) => {
        const parent = this.items.find((it) => it.id === r.parent_item_id);
        return { id: r.id, quantity_required: r.quantity_required, parent: parent ? { ...parent } : null };
      });
    return { children, parents };
  }

  // Crafting Tree (recursive dependency tree)
  /**
   * @typedef {Object} TreeNode
   * @property {Item} item
   * @property {Material[]} materials
   * @property {TreeNode[]} children
   * @property {number} quantityForParent
   */
  /**
   * @param {string} itemId
   * @param {number} multiplier
   * @param {number} depth
   * @returns {TreeNode}
   */
  #buildCraftingTree(itemId, multiplier = 1, depth = 0) {
    const MAX_DEPTH = 8;
    if (depth > MAX_DEPTH) {
      return {
        item: { id: itemId + '-cycle-warning', name: 'Cycle detected', item_type: 'warning' },
        materials: [],
        children: [],
        quantityForParent: multiplier,
      };
    }

    const item = this.items.find((i) => i.id === itemId);
    if (!item) {
      return {
        item: { id: itemId, name: 'Unknown', item_type: 'unknown' },
        materials: [],
        children: [],
        quantityForParent: multiplier,
      };
    }

    const itemMaterials = this.materials.filter((m) => m.craftable_item_id === itemId);
    const children = [];

    // Source 1: auto-detected intermediates from @wfcd/items (weapons)
    const seenSubItems = new Map();
    for (const mat of itemMaterials) {
      if (mat.is_intermediate && mat.sub_item_id) {
        const existing = seenSubItems.get(mat.sub_item_id);
        if (existing) {
          existing.quantityForParent += mat.quantity_required;
        } else {
          const childNode = this.#buildCraftingTree(mat.sub_item_id, multiplier * mat.quantity_required, depth + 1);
          childNode.quantityForParent = mat.quantity_required;
          seenSubItems.set(mat.sub_item_id, childNode);
        }
      }
    }
    children.push(...seenSubItems.values());

    // Source 2: manual Warframe component map (prebuild-injected)
    const manualSubs = this.warframeComponentSubMaterials[itemId];
    if (manualSubs && item.item_type === 'warframe') {
      for (const [compName, compData] of Object.entries(manualSubs)) {
        const syntheticId = `${itemId}-${compName.replace(/\s+/g, '-').toLowerCase()}`;
        const childNode = {
          item: { id: syntheticId, name: compName, item_type: 'warframe_component' },
          materials: compData.materials.map((m, i) => ({
            ...m,
            material_name: m.name,
            id: `${syntheticId}-mat-${i}`,
            craftable_item_id: syntheticId,
            component_unique_name: null,
            quantity_required: m.quantity,
            wiki_url: `https://wiki.warframe.com/w/${encodeURIComponent(m.name.replace(/ /g, '_'))}`,
            is_intermediate: false,
            sub_item_id: null,
            is_incarnon_install: false,
            created_at: new Date().toISOString(),
          })),
          children: [],
          quantityForParent: compData.quantity,
        };
        children.push(childNode);
      }
    }

    return { item, materials: itemMaterials, children, quantityForParent: multiplier };
  }

  async getCraftingTreeForItem(itemId) {
    await this.#ensureRefDataInitialized();
    return this.#buildCraftingTree(itemId, 1, 0);
  }

  /**
   * Flatten a crafting tree node into a map of material_name → total quantity
   * needed, rolling up all leaf materials recursively.
   */
  static aggregateNodeMaterials(node) {
    const map = new Map();

    function walk(n) {
      // Add this node's direct materials
      for (const m of n.materials || []) {
        const qty = (m.quantity_required || 1) * (n.quantityForParent || 1);
        map.set(m.material_name, (map.get(m.material_name) || 0) + qty);
      }
      // Recurse into children
      for (const child of n.children || []) {
        walk(child);
      }
    }

    walk(node);
    return map;
  }

  // Todos
  getTodos() { return this.todos.map((t) => ({ ...t })); }

  addTodo(todo) {
    const entry = { ...todo, id: todo.id || `todo-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    this.todos.push(entry);
    this.#pushTodos().catch(() => {});
    return { ...entry };
  }

  updateTodoStatus(id, status) {
    const target = this.todos.find((t) => t.id === id);
    if (!target) return null;
    target.status = status;
    target.updated_at = new Date().toISOString();
    this.#patchTodo(target).catch(() => {});
    return { ...target };
  }

  updateTodoNotes(id, notes) {
    const target = this.todos.find((t) => t.id === id);
    if (!target) return null;
    target.user_notes = notes;
    target.updated_at = new Date().toISOString();
    this.#patchTodo(target).catch(() => {});
    return { ...target };
  }

  async #patchTodo(todo) {
    try {
      const { id, ...updates } = todo;
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, clientVersion: todo.version || 0 }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated && updated.version) {
          todo.version = updated.version;
        }
      } else {
        toast.error("Couldn't save your to-do changes");
      }
    } catch {
      toast.error("Couldn't save your to-do changes");
    }
  }

  deleteTodo(id) {
    const target = this.todos.find((t) => t.id === id);
    const before = this.todos.length;
    this.todos = this.todos.filter((t) => t.id !== id);
    if (this.todos.length !== before) {
      this.#deleteTodoOnServer(id, target?.version ?? 0).catch(() => {});
      return true;
    }
    return false;
  }

  async #deleteTodoOnServer(id, version) {
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientVersion: version }),
      });
      if (!res.ok) toast.error("Couldn't delete your to-do");
    } catch {
      toast.error("Couldn't delete your to-do");
    }
  }
}
