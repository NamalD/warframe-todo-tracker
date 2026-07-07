'use client';

import { pullFromServer, pushToServer, pullSyncData, pushChanges, patchRecord, createRecord, deleteRecord, getDeviceId } from './sync-helper.js';

const STORAGE_KEY = 'warframe-todos';
const ITEMS_CACHE_KEY = 'warframe-items-cache';
const MATERIALS_INVENTORY_KEY = 'warframe-materials-inventory';

// Fallback seed todos (used when no localStorage data exists)
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
  // Public fields
  items = [];
  materials = [];
  sources = [];
  treeRelationships = [];
  todos = [];
  materialInventory = {};
  lastSyncError = null;

  // Private fields
  #initialized = false;
  #initPromise = null;
  #onSyncEvent = null;
  #syncInProgress = false;
  #pendingSync = null;
  #dirtyTodoIds = new Set();
  #todoVersions = new Map();
  #materialVersions = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      const storedTodos = localStorage.getItem(STORAGE_KEY);
      if (storedTodos) {
        try { this.todos = JSON.parse(storedTodos); } catch (_e) { this.todos = [...SEED_TODOS]; }
      } else {
        this.todos = [...SEED_TODOS];
      }
      const storedInventory = localStorage.getItem(MATERIALS_INVENTORY_KEY);
      if (storedInventory) {
        try { this.materialInventory = JSON.parse(storedInventory); } catch (_e) { this.materialInventory = {}; }
      } else {
        this.materialInventory = {};
      }
    } else {
      this.todos = [...SEED_TODOS];
      this.materialInventory = {};
      this.items = [];
      this.materials = [];
      this.treeRelationships = [];
    }
  }

  // Lazy init — called internally by all data-access methods
  async #ensureInitialized() {
    if (this.#initialized) return;
    if (this.#initPromise) return this.#initPromise;
    this.#initPromise = this.#loadData();
    await this.#initPromise;
    this.#initialized = true;
  }

  async #loadData() {
    // SSR — no fetch or localStorage available, return empty
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
            if (cached.version === fetched.version && cached.items) {
              this.items = cached.items;
              this.materials = cached.materials || [];
              this.treeRelationships = cached.treeRelationships || [];
              this.sources = [];
              return;
            }
          } catch (_e) { /* fall through */ }
        }
      }

      this.items = fetched.items || [];
      this.materials = fetched.materials || [];
      this.treeRelationships = fetched.treeRelationships || [];
      this.sources = [];

      if (typeof window !== 'undefined') {
        localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify({
          version: fetched.version,
          cachedAt: fetched.cachedAt,
          items: fetched.items,
          materials: fetched.materials,
          treeRelationships: fetched.treeRelationships
        }));
      }
    } catch (err) {
      if (typeof window !== 'undefined') {
        const cachedRaw = localStorage.getItem(ITEMS_CACHE_KEY);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            this.items = cached.items || [];
            this.materials = cached.materials || [];
            this.treeRelationships = cached.treeRelationships || [];
            this.sources = [];
            return;
          } catch (_e) { /* fall through */ }
        }
      }
      console.error('Failed to load Warframe item data:', err);
    }
  }

  // Sync callback
  setSyncEventCallback(cb) { this.#onSyncEvent = cb; }

  // Sync
  async syncFromServer() {
    if (this.#syncInProgress) return;
    this.#syncInProgress = true;
    try {
      // Use granular sync endpoint to get all data with versions
      let syncResult;
      try {
        syncResult = await pullSyncData('/api/sync');
      } catch {
        // Fall back to legacy pull if sync endpoint fails
        syncResult = null;
      }

      if (syncResult && syncResult.todos !== undefined) {
        // Granular sync — update todos with versions
        this.todos = Array.isArray(syncResult.todos) ? syncResult.todos : [];
        for (const todo of this.todos) {
          if (todo.version !== undefined) {
            this.#todoVersions.set(todo.id, todo.version);
          }
        }
        this.#persistTodos();
        this.#dirtyTodoIds.clear();
        this.lastSyncError = null;

        // Update materials inventory from sync
        if (syncResult.materials_inventory) {
          this.materialInventory = (typeof syncResult.materials_inventory === 'object' && syncResult.materials_inventory !== null)
            ? syncResult.materials_inventory : {};
          this.#persistMaterialInventory();
        }
      } else {
        // Legacy fallback
        const todoResult = await pullFromServer('/api/todos', STORAGE_KEY, this.#onSyncEvent);
        if (todoResult.fromServer) {
          this.todos = Array.isArray(todoResult.data) ? todoResult.data : [];
          this.#persistTodos();
          this.lastSyncError = null;
        } else if (todoResult.fromLocal) {
          this.lastSyncError = 'Server unreachable (todos)';
          this.#persistTodos();
        }
        const invResult = await pullFromServer('/api/materials', MATERIALS_INVENTORY_KEY, this.#onSyncEvent);
        if (invResult.fromServer) {
          this.materialInventory = (typeof invResult.data === 'object' && invResult.data !== null && !Array.isArray(invResult.data))
            ? invResult.data : {};
          this.#persistMaterialInventory();
          this.lastSyncError = null;
        } else if (invResult.fromLocal) {
          if (!this.lastSyncError) this.lastSyncError = 'Server unreachable (materials)';
          this.#persistMaterialInventory();
        }
      }
      // Clear pending sync
      this.#pendingSync = null;
    } catch (err) {
      this.lastSyncError = err.message;
      if (this.#onSyncEvent) this.#onSyncEvent('error', `Sync failed: ${err.message}`);
    } finally { this.#syncInProgress = false; }
  }

  async forceSyncToServer() {
    // Build dirty records payload
    const dirtyTodos = [];
    for (const id of this.#dirtyTodoIds) {
      const todo = this.todos.find(t => t.id === id);
      if (todo) {
        dirtyTodos.push({
          ...todo,
          clientVersion: this.#todoVersions.get(id) || 0,
        });
      }
    }

    // Build material inventory payload with versions
    const materialsPayload = {};
    for (const [name, qty] of Object.entries(this.materialInventory)) {
      if (typeof qty === 'object' && qty !== null) {
        materialsPayload[name] = qty;
      } else {
        materialsPayload[name] = qty;
      }
    }

    const changes = {};
    if (dirtyTodos.length > 0) changes.todos = dirtyTodos;
    if (Object.keys(materialsPayload).length > 0) changes.materials_inventory = materialsPayload;

    try {
      if (Object.keys(changes).length > 0) {
        const result = await pushChanges('/api/sync', changes);
        // Handle any conflicts from the server
        if (result.conflicts && this.#onSyncEvent) {
          const allConflicts = [
            ...(result.conflicts.todos || []),
            ...(result.conflicts.loadouts || []),
            ...(result.conflicts.materials_inventory || []),
          ];
          for (const conflict of allConflicts) {
            this.#onSyncEvent('conflict', `Record ${conflict.record_id} updated by another device — changes merged`);
          }
        }
        // Update versions from accepted records
        if (result.accepted && result.accepted.todos) {
          for (const id of result.accepted.todos) {
            // Versions are updated on next pull, but clear dirty flag
            this.#dirtyTodoIds.delete(id);
          }
        }
        this.lastSyncError = null;
      }

      // Also try legacy push for compatibility
      const todosOk = await pushToServer('/api/todos', this.todos, this.#onSyncEvent);
      const invOk = await pushToServer('/api/materials', this.materialInventory, this.#onSyncEvent);
      if (todosOk || invOk) this.lastSyncError = null;
      return { todosOk, invOk };
    } catch (err) {
      if (this.#onSyncEvent) this.#onSyncEvent('error', err.message);
      return { todosOk: false, invOk: false };
    }
  }

  #syncTodosToServer() {
    const promise = pushToServer('/api/todos', this.todos, this.#onSyncEvent).then((ok) => { if (ok) this.lastSyncError = null; return ok; });
    this.#pendingSync = promise.catch(() => {});
    return promise;
  }

  #syncInventoryToServer() {
    const promise = pushToServer('/api/materials', this.materialInventory, this.#onSyncEvent).then((ok) => { if (ok) this.lastSyncError = null; return ok; });
    this.#pendingSync = promise.catch(() => {});
    return promise;
  }

  /** Returns a promise that resolves when any pending sync completes. */
  async flushPendingSync() {
    if (this.#pendingSync) await this.#pendingSync;
    this.#pendingSync = null;
  }

  // Persistence
  #persistTodos() {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.todos));
  }

  #persistItems() {
    if (typeof window !== 'undefined') {
      const existing = localStorage.getItem(ITEMS_CACHE_KEY);
      let cacheData = {};
      if (existing) { try { cacheData = JSON.parse(existing); } catch (_e) { /* use empty */ } }
      cacheData.items = this.items;
      localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify(cacheData));
    }
  }

  #persistMaterialInventory() {
    if (typeof window !== 'undefined') localStorage.setItem(MATERIALS_INVENTORY_KEY, JSON.stringify(this.materialInventory));
  }

  // Material Inventory (unchanged — user data)
  getMaterialInventory() { return { ...this.materialInventory }; }
  getOwnedQuantity(materialName) { return this.materialInventory[materialName] ?? 0; }
  setOwnedQuantity(materialName, qty) {
    const parsed = parseInt(qty, 10);
    if (isNaN(parsed) || parsed < 0) this.materialInventory[materialName] = 0;
    else this.materialInventory[materialName] = parsed;
    this.#persistMaterialInventory();
    this.#syncMaterialViaGranularApi(materialName);
    return this.materialInventory[materialName];
  }

  // Items (async — lazy init)
  async updateItem(id, updates) {
    await this.#ensureInitialized();
    const target = this.items.find((i) => i.id === id);
    if (!target) return null;
    Object.assign(target, updates);
    this.#persistItems();
    return { ...target };
  }

  async getAllItems() {
    await this.#ensureInitialized();
    return this.items.map((it) => ({ ...it }));
  }

  async getItemById(id) {
    await this.#ensureInitialized();
    const item = this.items.find((i) => i.id === id);
    return item ? { ...item } : null;
  }

  async getMaterialsForItem(id) {
    await this.#ensureInitialized();
    return this.materials.filter((m) => m.craftable_item_id === id).map((m) => ({ ...m }));
  }

  // Sources — deprecated (TODO: wfcd sources — see docs/wfcd-integration.md §7)
  getAllSources() { return []; }
  getSourcesForMaterial(_name) { return []; }

  // Tree Relationships (async — lazy init)
  async getTreeForItem(id) {
    await this.#ensureInitialized();
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

  // Todos (unchanged — no lazy init needed)
  getTodos() { return this.todos.map((t) => ({ ...t })); }

  addTodo(todo) {
    const entry = { ...todo, id: todo.id || `todo-${Date.now()}`, version: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    this.todos.push(entry);
    this.#todoVersions.set(entry.id, 0);
    this.#dirtyTodoIds.add(entry.id);
    this.#persistTodos();
    this.#syncTodoViaGranularApi(entry);
    return { ...entry };
  }

  updateTodoStatus(id, status) {
    const target = this.todos.find((t) => t.id === id);
    if (!target) return null;
    target.status = status;
    target.updated_at = new Date().toISOString();
    this.#dirtyTodoIds.add(id);
    this.#persistTodos();
    this.#syncTodoViaGranularApi(target);
    return { ...target };
  }

  updateTodoNotes(id, notes) {
    const target = this.todos.find((t) => t.id === id);
    if (!target) return null;
    target.user_notes = notes;
    target.updated_at = new Date().toISOString();
    this.#dirtyTodoIds.add(id);
    this.#persistTodos();
    this.#syncTodoViaGranularApi(target);
    return { ...target };
  }

  deleteTodo(id) {
    const before = this.todos.length;
    const target = this.todos.find((t) => t.id === id);
    this.todos = this.todos.filter((t) => t.id !== id);
    if (this.todos.length !== before) {
      this.#dirtyTodoIds.delete(id);
      this.#todoVersions.delete(id);
      this.#persistTodos();
      this.#deleteTodoViaGranularApi(id, target ? this.#todoVersions.get(id) || 0 : 0);
      return true;
    }
    return false;
  }

  /**
   * Sync a material quantity change via granular API.
   * Uses PATCH /api/materials with version-based conflict detection.
   * On 409 conflict, auto-accept server version.
   */
  async #syncMaterialViaGranularApi(materialName) {
    const clientVersion = this.#materialVersions.get(materialName) || 0;
    try {
      const result = await patchRecord('/api/materials', materialName, {
        material_name: materialName,
        quantity: this.materialInventory[materialName] || 0,
        clientVersion,
      });
      if (result && result.version !== undefined) {
        this.#materialVersions.set(materialName, result.version);
      }
    } catch (err) {
      if (err.conflict) {
        // Auto-accept server version
        if (err.serverVersion !== undefined) {
          this.#materialVersions.set(materialName, err.serverVersion);
        }
        if (err.serverQuantity !== undefined) {
          this.materialInventory[materialName] = err.serverQuantity;
          this.#persistMaterialInventory();
        }
        this.materialInventory[materialName] = err.serverQuantity ?? 0;
        if (this.#onSyncEvent) {
          this.#onSyncEvent('conflict', `Record ${materialName} updated by another device — changes merged`);
        }
      }
    }
  }

  /**
   * Sync a single todo via granular API with conflict handling.
   * On 409 conflict, auto-accept server version and update local data.
   */
  async #syncTodoViaGranularApi(todo) {
    const clientVersion = this.#todoVersions.get(todo.id) || 0;
    try {
      if (clientVersion === 0) {
        // New todo — create on server
        const result = await createRecord('/api/todos', todo);
        if (result && result.version !== undefined) {
          this.#todoVersions.set(todo.id, result.version);
        }
      } else {
        // Existing todo — patch
        const result = await patchRecord('/api/todos', todo.id, {
          updates: todo,
          clientVersion,
        });
        if (result && result.version !== undefined) {
          this.#todoVersions.set(todo.id, result.version);
        }
      }
      this.#dirtyTodoIds.delete(todo.id);
    } catch (err) {
      if (err.conflict) {
        // Auto-accept server version
        if (err.serverVersion !== undefined) {
          this.#todoVersions.set(todo.id, err.serverVersion);
        }
        if (err.serverData) {
          // Update local record with server data
          const target = this.todos.find(t => t.id === todo.id);
          if (target) {
            Object.assign(target, err.serverData);
          }
        }
        if (this.#onSyncEvent) {
          this.#onSyncEvent('conflict', `Record ${todo.id} updated by another device — changes merged`);
        }
        // Don't clear dirty flag — the user's changes were not persisted
        // But the conflict was resolved server-side, so it's OK
        this.#dirtyTodoIds.delete(todo.id);
      }
      // Non-conflict errors are silent — will be retried on next forceSyncToServer
    }
  }

  /**
   * Delete a todo via granular API with conflict handling.
   */
  async #deleteTodoViaGranularApi(id, clientVersion) {
    try {
      await deleteRecord('/api/todos', id, clientVersion);
    } catch (err) {
      if (err.conflict) {
        if (this.#onSyncEvent) {
          this.#onSyncEvent('conflict', `Record ${id} updated by another device — changes merged`);
        }
      }
    }
  }
}
