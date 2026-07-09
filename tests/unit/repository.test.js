import { describe, it, expect, vi } from 'vitest';

// ── Test fixtures matching wfcd-cache.json format ──────────────────

const MOCK_CACHE_VERSION = '1.1275.0';

const FIXTURE_CACHE = {
  version: MOCK_CACHE_VERSION,
  cachedAt: '2026-07-06T23:51:22.955Z',
  items: [
    { id: 'item-1', name: 'Excalibur', item_type: 'warframe', mastery_rank_required: 0, is_user_tracked: true, blueprint_source: 'quest', wiki_url: 'https://wiki.warframe.com/w/Excalibur', created_at: '2026-07-06T00:00:00Z', updated_at: '2026-07-06T00:00:00Z' },
    { id: 'item-2', name: 'Mesa', item_type: 'warframe', mastery_rank_required: 4, is_user_tracked: false, blueprint_source: 'research', wiki_url: 'https://wiki.warframe.com/w/Mesa', created_at: '2026-07-06T00:00:00Z', updated_at: '2026-07-06T00:00:00Z' },
    { id: 'item-3', name: 'Kronen Prime', item_type: 'melee', mastery_rank_required: 14, is_user_tracked: false, blueprint_source: 'drop', wiki_url: 'https://wiki.warframe.com/w/Kronen_Prime', created_at: '2026-07-06T00:00:00Z', updated_at: '2026-07-06T00:00:00Z' },
    { id: 'item-4', name: 'Burston Prime', item_type: 'primary', mastery_rank_required: 12, is_user_tracked: false, blueprint_source: 'drop', wiki_url: 'https://wiki.warframe.com/w/Burston_Prime', created_at: '2026-07-06T00:00:00Z', updated_at: '2026-07-06T00:00:00Z' },
  ],
  materials: [
    { id: 'mat-1', craftable_item_id: 'item-1', material_name: 'Chassis', component_unique_name: '/Lotus/Powersuits/Excalibur/ExcaliburChassis', quantity_required: 1, wiki_url: 'https://wiki.warframe.com/w/Chassis', created_at: '2026-07-06T00:00:00Z' },
    { id: 'mat-2', craftable_item_id: 'item-1', material_name: 'Neuroptics', component_unique_name: '/Lotus/Powersuits/Excalibur/ExcaliburNeuroptics', quantity_required: 1, wiki_url: 'https://wiki.warframe.com/w/Neuroptics', created_at: '2026-07-06T00:00:00Z' },
    { id: 'mat-3', craftable_item_id: 'item-1', material_name: 'Systems', component_unique_name: '/Lotus/Powersuits/Excalibur/ExcaliburSystems', quantity_required: 1, wiki_url: 'https://wiki.warframe.com/w/Systems', created_at: '2026-07-06T00:00:00Z' },
    { id: 'mat-4', craftable_item_id: 'item-1', material_name: 'Orokin Cell', component_unique_name: '/Lotus/Types/Items/MiscItems/OrokinCell', quantity_required: 1, wiki_url: 'https://wiki.warframe.com/w/Orokin_Cell', created_at: '2026-07-06T00:00:00Z' },
    { id: 'mat-5', craftable_item_id: 'item-2', material_name: 'Chassis', component_unique_name: '/Lotus/Powersuits/Mesa/MesaChassis', quantity_required: 1, wiki_url: 'https://wiki.warframe.com/w/Chassis', created_at: '2026-07-06T00:00:00Z' },
  ],
  treeRelationships: [
    { id: 'tree-1', parent_item_id: 'item-1', child_item_id: 'item-111', quantity_required: 1, created_at: '2026-07-06T00:00:00Z' },
    { id: 'tree-2', parent_item_id: 'item-2', child_item_id: 'item-112', quantity_required: 1, created_at: '2026-07-06T00:00:00Z' },
  ],
  sources: [
    { id: 'source-1', material_name: 'Orokin Cell', source_name: 'Void/Hepit', source_type: 'mission', location_details: 'Common (A)', drop_chance_pct: 12.5, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
    { id: 'source-2', material_name: 'Orokin Cell', source_name: 'Void/Ani', source_type: 'mission', location_details: 'Uncommon (B)', drop_chance_pct: 8.3, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
    { id: 'source-3', material_name: 'Alloy Plate', source_name: 'Venus/Malva', source_type: 'mission', location_details: 'Common (any rotation)', drop_chance_pct: 25, is_user_tracked: false, created_at: '2026-07-06T00:00:00Z' },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────

function mockFetchOk(data) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
}

function mockFetchFail(status = 500) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
}

/** Create a fresh Repository instance with fetch stub. */
async function newRepo(fetchImpl) {
  if (fetchImpl) {
    vi.stubGlobal('fetch', fetchImpl);
  }
  localStorage.clear();
  const mod = await import('../../src/data/repository.js?t=' + Date.now() + Math.random());
  return new mod.default();
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Repository (wfcd-cache lazy loading)', () => {

  describe('items — lazy initialization', () => {

    it('fetches wfcd-cache.json on first data access', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      expect(repo.items).toEqual([]);

      const items = await repo.getAllItems();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/data/wfcd-cache.json');
      expect(items.length).toBe(4);
      expect(items[0].name).toBe('Excalibur');
    });

    it('does not re-fetch on subsequent data accesses', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      await repo.getAllItems();
      await repo.getAllItems();
      await repo.getItemById('item-1');
      await repo.getMaterialsForItem('item-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns copies, not references', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const items1 = await repo.getAllItems();
      const items2 = await repo.getAllItems();
      items1[0].name = 'MODIFIED';

      expect(items2[0].name).not.toBe('MODIFIED');
    });

    it('getItemById returns correct item', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const item = await repo.getItemById('item-1');
      expect(item).not.toBeNull();
      expect(item.name).toBe('Excalibur');
    });

    it('getItemById returns null for unknown id', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      expect(await repo.getItemById('nonexistent')).toBeNull();
    });

    it('updateItem updates an existing item', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const updated = await repo.updateItem('item-1', { is_user_tracked: false });
      expect(updated.is_user_tracked).toBe(false);

      const item = await repo.getItemById('item-1');
      expect(item.is_user_tracked).toBe(false);
    });

    it('updateItem returns null for unknown id', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      expect(await repo.updateItem('nonexistent', { name: 'X' })).toBeNull();
    });
  });

  describe('materials', () => {

    it('getMaterialsForItem returns materials for an item', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const materials = await repo.getMaterialsForItem('item-1');
      expect(materials.length).toBe(4);
      expect(materials[0]).toHaveProperty('material_name');
      expect(materials[0]).toHaveProperty('quantity_required');
      expect(materials[0].craftable_item_id).toBe('item-1');
    });

    it('getMaterialsForItem returns empty array for unknown item', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      expect(await repo.getMaterialsForItem('nonexistent')).toEqual([]);
    });
  });

  describe('sources', () => {

    it('getAllSources returns all source records', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const sources = await repo.getAllSources();
      expect(sources).toHaveLength(3);
      expect(sources.map((s) => s.id)).toEqual(['source-1', 'source-2', 'source-3']);
    });

    it('getSourcesForMaterial filters by material name', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const orokinSources = await repo.getSourcesForMaterial('Orokin Cell');
      expect(orokinSources).toHaveLength(2);
      expect(orokinSources.every((s) => s.material_name === 'Orokin Cell')).toBe(true);

      const alloySources = await repo.getSourcesForMaterial('Alloy Plate');
      expect(alloySources).toHaveLength(1);
    });

    it('getSourcesForMaterial returns empty array for unknown material', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      expect(await repo.getSourcesForMaterial('Nonexistent Material')).toEqual([]);
    });

    it('sources survive the localStorage cache-hit path', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      await newRepo(fetchMock); // populates localStorage cache

      const repo2 = await newRepo(mockFetchOk(FIXTURE_CACHE));
      const sources = await repo2.getAllSources();
      expect(sources).toHaveLength(3);
    });
  });

  describe('tree relationships', () => {

    it('getTreeForItem returns children and parents', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const tree = await repo.getTreeForItem('item-1');
      expect(tree).toHaveProperty('children');
      expect(tree).toHaveProperty('parents');
      expect(tree.children.length).toBe(1);
    });

    it('getTreeForItem returns empty arrays for items with no relationships', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const tree = await repo.getTreeForItem('item-3');
      expect(tree.children).toEqual([]);
      expect(tree.parents).toEqual([]);
    });
  });

  describe('todos (unchanged — user data)', () => {

    it('getTodos returns seed todos when no localStorage', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      localStorage.clear();
      const repo = await newRepo(fetchMock);

      const todos = repo.getTodos();
      expect(todos.length).toBeGreaterThan(0);
      expect(todos[0]).toHaveProperty('id');
      expect(todos[0]).toHaveProperty('status');
    });

    it('addTodo creates a new todo', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const todo = repo.addTodo({
        craftable_item_id: 'item-1',
        user_notes: 'Test todo',
        status: 'pending',
        priority: 'high',
      });
      expect(todo).toHaveProperty('id');
      expect(todo.user_notes).toBe('Test todo');
      expect(todo.status).toBe('pending');

      const todos = repo.getTodos();
      expect(todos.find(t => t.id === todo.id)).toBeTruthy();
    });

    it('addTodo generates id if not provided', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const todo = repo.addTodo({ user_notes: 'Auto id', status: 'pending' });
      expect(todo.id).toBeDefined();
      expect(todo.id).toMatch(/^todo-/);
    });

    it('addTodo uses provided id if given', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const todo = repo.addTodo({ id: 'custom-id', user_notes: 'Custom id', status: 'pending' });
      expect(todo.id).toBe('custom-id');
    });

    it('updateTodoStatus changes status', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const todos = repo.getTodos();
      const firstTodo = todos[0];
      const updated = repo.updateTodoStatus(firstTodo.id, 'completed');
      expect(updated.status).toBe('completed');
    });

    it('updateTodoStatus returns null for unknown id', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      expect(repo.updateTodoStatus('nonexistent', 'completed')).toBeNull();
    });

    it('updateTodoNotes changes notes', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const todos = repo.getTodos();
      const firstTodo = todos[0];
      const updated = repo.updateTodoNotes(firstTodo.id, 'New notes');
      expect(updated.user_notes).toBe('New notes');
    });

    it('updateTodoNotes returns null for unknown id', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      expect(repo.updateTodoNotes('nonexistent', 'notes')).toBeNull();
    });

    it('deleteTodo removes a todo', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const todos = repo.getTodos();
      const countBefore = todos.length;
      const result = repo.deleteTodo(todos[0].id);
      expect(result).toBe(true);
      expect(repo.getTodos().length).toBe(countBefore - 1);
    });

    it('deleteTodo returns false for unknown id', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      expect(repo.deleteTodo('nonexistent')).toBe(false);
    });
  });

  describe('material inventory (unchanged — user data)', () => {

    it('getMaterialInventory returns an object', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const inv = repo.getMaterialInventory();
      expect(typeof inv).toBe('object');
    });

    it('getOwnedQuantity returns 0 for unknown material', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      expect(repo.getOwnedQuantity('Unknown Material')).toBe(0);
    });

    it('setOwnedQuantity sets a quantity', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const result = repo.setOwnedQuantity('Alloy Plate', 50);
      expect(result).toBe(50);
      expect(repo.getOwnedQuantity('Alloy Plate')).toBe(50);
    });

    it('setOwnedQuantity handles NaN by setting 0', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      repo.setOwnedQuantity('Alloy Plate', 'abc');
      expect(repo.getOwnedQuantity('Alloy Plate')).toBe(0);
    });

    it('setOwnedQuantity handles negative numbers by setting 0', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      repo.setOwnedQuantity('Alloy Plate', -5);
      expect(repo.getOwnedQuantity('Alloy Plate')).toBe(0);
    });

    it('getMaterialInventory returns a copy', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const inv1 = repo.getMaterialInventory();
      inv1.TestMaterial = 999;
      const inv2 = repo.getMaterialInventory();
      expect(inv2.TestMaterial).toBeUndefined();
    });
  });

  describe('localStorage caching', () => {

    it('caches fetched data in localStorage under warframe-items-cache', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      await repo.getAllItems();

      const cached = JSON.parse(localStorage.getItem('warframe-items-cache'));
      expect(cached).not.toBeNull();
      expect(cached.version).toBe(MOCK_CACHE_VERSION);
      expect(cached.items.length).toBe(4);
      expect(cached.materials.length).toBe(5);
      expect(cached.treeRelationships.length).toBe(2);
    });

    it('second repository instance loads from localStorage (version match)', async () => {
      const fetchMock1 = mockFetchOk(FIXTURE_CACHE);
      const repo1 = await newRepo(fetchMock1);
      await repo1.getAllItems();
      expect(fetchMock1).toHaveBeenCalledTimes(1);

      const fetchMock2 = mockFetchOk(FIXTURE_CACHE);
      const repo2 = await newRepo(fetchMock2);
      const items = await repo2.getAllItems();

      expect(fetchMock2).toHaveBeenCalledTimes(1);
      expect(items.length).toBe(4);
      expect(items[0].name).toBe('Excalibur');
    });

    it('re-fetches on version mismatch and updates localStorage', async () => {
      const fetchMock1 = mockFetchOk(FIXTURE_CACHE);
      const repo1 = await newRepo(fetchMock1);
      await repo1.getAllItems();

      // Overwrite localStorage with older version
      const staleCache = {
        version: '1.0.0-old',
        cachedAt: '2025-01-01T00:00:00Z',
        items: [...FIXTURE_CACHE.items],
        materials: [...FIXTURE_CACHE.materials],
        treeRelationships: [...FIXTURE_CACHE.treeRelationships],
      };
      localStorage.setItem('warframe-items-cache', JSON.stringify(staleCache));

      const NEW_ITEM = {
        id: 'item-new', name: 'NewItem', item_type: 'warframe', mastery_rank_required: 0,
        is_user_tracked: false, blueprint_source: 'market',
        wiki_url: 'https://wiki.warframe.com/w/NewItem',
        created_at: '2026-07-06T00:00:00Z', updated_at: '2026-07-06T00:00:00Z'
      };
      const newCache = {
        ...FIXTURE_CACHE,
        version: '2.0.0-new',
        items: [...FIXTURE_CACHE.items, NEW_ITEM],
      };

      const fetchMock2 = mockFetchOk(newCache);
      const repo2 = await newRepo(fetchMock2);
      const items = await repo2.getAllItems();

      expect(fetchMock2).toHaveBeenCalledTimes(1);
      expect(items.length).toBe(5);
      expect(items[4].name).toBe('NewItem');

      const cached = JSON.parse(localStorage.getItem('warframe-items-cache'));
      expect(cached.version).toBe('2.0.0-new');
      expect(cached.items.length).toBe(5);
    });

    it('re-fetches on schemaVersion mismatch even when the package version matches (#18)', async () => {
      const fetchMock1 = mockFetchOk(FIXTURE_CACHE);
      const repo1 = await newRepo(fetchMock1);
      await repo1.getAllItems();

      // Simulate an existing cache from before a prebuild.mjs shape change —
      // same @wfcd/items version, no schemaVersion field (or an older one).
      const staleCache = {
        version: MOCK_CACHE_VERSION,
        cachedAt: '2025-01-01T00:00:00Z',
        items: [...FIXTURE_CACHE.items],
        materials: [...FIXTURE_CACHE.materials],
        treeRelationships: [...FIXTURE_CACHE.treeRelationships],
      };
      localStorage.setItem('warframe-items-cache', JSON.stringify(staleCache));

      const NEW_FIELD_ITEM = {
        ...FIXTURE_CACHE.items[0],
        has_incarnon_genesis: true,
      };
      const newCache = {
        ...FIXTURE_CACHE,
        schemaVersion: 2,
        items: [NEW_FIELD_ITEM, ...FIXTURE_CACHE.items.slice(1)],
      };

      const fetchMock2 = mockFetchOk(newCache);
      const repo2 = await newRepo(fetchMock2);
      const items = await repo2.getAllItems();

      // Same package version as the stale cache, but schemaVersion differs —
      // must re-fetch rather than silently reuse the shape-stale cache.
      expect(fetchMock2).toHaveBeenCalledTimes(1);
      expect(items[0].has_incarnon_genesis).toBe(true);

      const cached = JSON.parse(localStorage.getItem('warframe-items-cache'));
      expect(cached.schemaVersion).toBe(2);
    });

    it('uses localStorage cache when no fetch is available (offline fallback)', async () => {
      const fetchMock = mockFetchFail(500);
      vi.stubGlobal('fetch', fetchMock);
      localStorage.clear();

      // Pre-populate cache AFTER clear (simulates having visited the app before)
      localStorage.setItem('warframe-items-cache', JSON.stringify({
        version: MOCK_CACHE_VERSION,
        cachedAt: '2026-07-06T00:00:00Z',
        items: FIXTURE_CACHE.items,
        materials: FIXTURE_CACHE.materials,
        treeRelationships: FIXTURE_CACHE.treeRelationships,
      }));

      const mod = await import('../../src/data/repository.js?t=' + Date.now() + Math.random());
      const repo = new mod.default();
      const items = await repo.getAllItems();

      expect(items.length).toBe(4);
      expect(items[0].name).toBe('Excalibur');
    });

    it('returns empty arrays when both fetch and cache fail', async () => {
      const fetchMock = mockFetchFail(500);
      const repo = await newRepo(fetchMock);
      const items = await repo.getAllItems();

      expect(items).toEqual([]);
    });
  });

  describe('edge cases: corrupted localStorage', () => {

    it('handles corrupted todos JSON gracefully', async () => {
      localStorage.setItem('warframe-todos', 'not-valid-json{');
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const todos = repo.getTodos();
      expect(Array.isArray(todos)).toBe(true);
      expect(todos.length).toBeGreaterThan(0);
    });

    it('handles corrupted items-cache JSON gracefully (falls back to fetch)', async () => {
      localStorage.setItem('warframe-items-cache', 'corrupted...');
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const items = await repo.getAllItems();
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(4);
    });

    it('handles corrupted material inventory JSON gracefully', async () => {
      localStorage.setItem('warframe-materials-inventory', 'broken');
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);

      const inv = repo.getMaterialInventory();
      expect(typeof inv).toBe('object');
      expect(inv).toEqual({});
    });
  });

  describe('constructor is synchronous', () => {

    it('can be constructed without awaiting anything', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const mod = await import('../../src/data/repository.js?t=' + Date.now() + Math.random());
      const repo = new mod.default();

      expect(repo).toBeDefined();
      expect(repo.items).toEqual([]);
      expect(typeof repo.getAllItems).toBe('function');

      await repo.getAllItems();
      expect(repo.items.length).toBe(4);
    });
  });

  describe('SSR guard — no window object', () => {

    it('does not attempt fetch when window is undefined (SSR environment)', async () => {
      const fetchMock = vi.fn().mockRejectedValue(
        new TypeError('ERR_INVALID_URL')
      );
      vi.stubGlobal('fetch', fetchMock);

      // Simulate SSR by removing the window global
      const savedWindow = globalThis.window;
      delete globalThis.window;

      try {
        const mod = await import('../../src/data/repository.js?t=' + Date.now() + Math.random());
        const repo = new mod.default();

        // getAllItems triggers lazy init, which calls #loadData internally
        const items = await repo.getAllItems();

        // In SSR, fetch should never be called — the guard returns first
        expect(fetchMock).not.toHaveBeenCalled();
        // Returns the class defaults (empty arrays)
        expect(items).toEqual([]);
      } finally {
        // Restore window for subsequent tests
        globalThis.window = savedWindow;
      }
    });

    it('still works normally when window exists (client-side)', async () => {
      const fetchMock = mockFetchOk(FIXTURE_CACHE);
      const repo = await newRepo(fetchMock);
      const items = await repo.getAllItems();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(items.length).toBe(4);
      expect(items[0].name).toBe('Excalibur');
    });
  });
});
