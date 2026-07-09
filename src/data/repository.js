'use client';

const ITEMS_CACHE_KEY = 'warframe-items-cache';

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
  // Public fields
  items = [];
  materials = [];
  sources = [];
  treeRelationships = [];
  todos = [...SEED_TODOS.map(t => ({ ...t }))];
  materialInventory = {};

  // Private fields
  #initialized = false;
  #refDataInitialized = false;
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
          // Server empty — use seed data locally without pushing
          this.todos = [...SEED_TODOS];
        }
      } else {
        this.todos = [...SEED_TODOS];
      }
    } catch {
      this.todos = [...SEED_TODOS];
    }
  }

  async initMaterials() {
    try {
      const res = await fetch('/api/materials');
      if (res.ok) {
        const body = await res.json();
        const serverData = (body && typeof body === 'object' && 'data' in body) ? body.data : body;
        if (typeof serverData === 'object' && serverData !== null && !Array.isArray(serverData)) {
          this.materialInventory = serverData;
        } else {
          this.materialInventory = {};
        }
      } else {
        this.materialInventory = {};
      }
    } catch {
      this.materialInventory = {};
    }
  }

  async #pushTodos() {
    try {
      await fetch('/api/todos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: this.todos, version: 0 }),
      });
    } catch { /* best-effort */ }
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
              this.#refDataInitialized = true;
              return;
            }
          } catch (_e) { /* fall through */ }
        }
      }

      this.items = fetched.items || [];
      this.materials = fetched.materials || [];
      this.treeRelationships = fetched.treeRelationships || [];
      this.sources = fetched.sources || [];

      if (typeof window !== 'undefined') {
        localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify({
          version: fetched.version,
          schemaVersion: fetched.schemaVersion,
          cachedAt: fetched.cachedAt,
          items: fetched.items,
          materials: fetched.materials,
          treeRelationships: fetched.treeRelationships,
          sources: fetched.sources
        }));
      }
      this.#refDataInitialized = true;
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

  async #patchMaterial(name, quantity) {
    try {
      await fetch('/api/materials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ material_name: name, quantity, clientVersion: 0 }),
      });
    } catch { /* best-effort */ }
  }

  // Items (async — lazy init)
  async updateItem(id, updates) {
    await this.#ensureRefDataInitialized();
    const target = this.items.find((i) => i.id === id);
    if (!target) return null;
    Object.assign(target, updates);
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
      }
    } catch { /* best-effort */ }
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
      await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientVersion: version }),
      });
    } catch { /* best-effort */ }
  }
}
