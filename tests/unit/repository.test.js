import { describe, it, expect, beforeEach } from 'vitest';

// Reset localStorage before each test and re-import to get fresh state
let Repository;
let repo;

beforeEach(async () => {
  localStorage.clear();
  // Dynamic import to get fresh module with clean localStorage
  const mod = await import('../../src/data/repository.js');
  Repository = mod.default;
  repo = new Repository();
});

describe('Repository', () => {
  describe('items', () => {
    it('getAllItems returns all seed items', () => {
      const items = repo.getAllItems();
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]).toHaveProperty('id');
      expect(items[0]).toHaveProperty('name');
      expect(items[0]).toHaveProperty('item_type');
    });

    it('returns copies not references', () => {
      const items1 = repo.getAllItems();
      const items2 = repo.getAllItems();
      items1[0].name = 'MODIFIED';
      expect(items2[0].name).not.toBe('MODIFIED');
    });

    it('getItemById returns correct item', () => {
      const item = repo.getItemById('item-1');
      expect(item).not.toBeNull();
      expect(item.name).toBe('Excalibur');
    });

    it('getItemById returns null for unknown id', () => {
      expect(repo.getItemById('nonexistent')).toBeNull();
    });

    it('updateItem updates an existing item', () => {
      const updated = repo.updateItem('item-1', { is_user_tracked: false });
      expect(updated.is_user_tracked).toBe(false);
      const item = repo.getItemById('item-1');
      expect(item.is_user_tracked).toBe(false);
    });

    it('updateItem returns null for unknown id', () => {
      expect(repo.updateItem('nonexistent', { name: 'X' })).toBeNull();
    });
  });

  describe('materials', () => {
    it('getMaterialsForItem returns materials for an item', () => {
      const materials = repo.getMaterialsForItem('item-1');
      expect(materials.length).toBeGreaterThan(0);
      expect(materials[0]).toHaveProperty('material_name');
      expect(materials[0]).toHaveProperty('quantity_required');
    });

    it('getMaterialsForItem returns empty array for unknown item', () => {
      expect(repo.getMaterialsForItem('nonexistent')).toEqual([]);
    });
  });

  describe('sources', () => {
    it('getAllSources returns all seed sources', () => {
      const sources = repo.getAllSources();
      expect(sources.length).toBeGreaterThan(0);
      expect(sources[0]).toHaveProperty('material_name');
      expect(sources[0]).toHaveProperty('source_name');
    });

    it('getSourcesForMaterial returns sources for a material', () => {
      const sources = repo.getSourcesForMaterial('Alloy Plate');
      expect(sources.length).toBeGreaterThan(0);
      sources.forEach((s) => expect(s.material_name).toBe('Alloy Plate'));
    });

    it('getSourcesForMaterial returns empty array for unknown material', () => {
      expect(repo.getSourcesForMaterial('Unknown Material')).toEqual([]);
    });
  });

  describe('tree relationships', () => {
    it('getTreeForItem returns children and parents', () => {
      const tree = repo.getTreeForItem('item-1');
      expect(tree).toHaveProperty('children');
      expect(tree).toHaveProperty('parents');
      expect(tree.children.length).toBeGreaterThan(0);
    });

    it('getTreeForItem returns empty arrays for items with no relationships', () => {
      const tree = repo.getTreeForItem('item-4');
      expect(tree.children).toEqual([]);
      expect(tree.parents).toEqual([]);
    });
  });

  describe('todos', () => {
    it('getTodos returns seed todos', () => {
      const todos = repo.getTodos();
      expect(todos.length).toBeGreaterThan(0);
      expect(todos[0]).toHaveProperty('id');
      expect(todos[0]).toHaveProperty('status');
    });

    it('addTodo creates a new todo', () => {
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
      expect(todos.find((t) => t.id === todo.id)).toBeTruthy();
    });

    it('addTodo generates id if not provided', () => {
      const todo = repo.addTodo({
        user_notes: 'Auto id',
        status: 'pending',
      });
      expect(todo.id).toBeDefined();
      expect(todo.id).toMatch(/^todo-/);
    });

    it('addTodo uses provided id if given', () => {
      const todo = repo.addTodo({
        id: 'custom-id',
        user_notes: 'Custom id',
        status: 'pending',
      });
      expect(todo.id).toBe('custom-id');
    });

    it('updateTodoStatus changes status', () => {
      const todos = repo.getTodos();
      const firstTodo = todos[0];
      const updated = repo.updateTodoStatus(firstTodo.id, 'completed');
      expect(updated.status).toBe('completed');
    });

    it('updateTodoStatus returns null for unknown id', () => {
      expect(repo.updateTodoStatus('nonexistent', 'completed')).toBeNull();
    });

    it('updateTodoNotes changes notes', () => {
      const todos = repo.getTodos();
      const firstTodo = todos[0];
      const updated = repo.updateTodoNotes(firstTodo.id, 'New notes');
      expect(updated.user_notes).toBe('New notes');
    });

    it('updateTodoNotes returns null for unknown id', () => {
      expect(repo.updateTodoNotes('nonexistent', 'notes')).toBeNull();
    });

    it('deleteTodo removes a todo', () => {
      const todos = repo.getTodos();
      const countBefore = todos.length;
      const result = repo.deleteTodo(todos[0].id);
      expect(result).toBe(true);
      expect(repo.getTodos().length).toBe(countBefore - 1);
    });

    it('deleteTodo returns false for unknown id', () => {
      expect(repo.deleteTodo('nonexistent')).toBe(false);
    });
  });

  describe('material inventory', () => {
    it('getMaterialInventory returns an object', () => {
      const inv = repo.getMaterialInventory();
      expect(typeof inv).toBe('object');
    });

    it('getOwnedQuantity returns 0 for unknown material', () => {
      expect(repo.getOwnedQuantity('Unknown Material')).toBe(0);
    });

    it('setOwnedQuantity sets a quantity', () => {
      const result = repo.setOwnedQuantity('Alloy Plate', 50);
      expect(result).toBe(50);
      expect(repo.getOwnedQuantity('Alloy Plate')).toBe(50);
    });

    it('setOwnedQuantity handles NaN by setting 0', () => {
      repo.setOwnedQuantity('Alloy Plate', 'abc');
      expect(repo.getOwnedQuantity('Alloy Plate')).toBe(0);
    });

    it('setOwnedQuantity handles negative numbers by setting 0', () => {
      repo.setOwnedQuantity('Alloy Plate', -5);
      expect(repo.getOwnedQuantity('Alloy Plate')).toBe(0);
    });

    it('getMaterialInventory returns a copy', () => {
      const inv1 = repo.getMaterialInventory();
      inv1.TestMaterial = 999;
      const inv2 = repo.getMaterialInventory();
      expect(inv2.TestMaterial).toBeUndefined();
    });
  });

  describe('edge cases: corrupted localStorage', () => {
    it('handles corrupted todos JSON gracefully', async () => {
      localStorage.setItem('warframe-todos', 'not-valid-json{');
      const mod = await import('../../src/data/repository.js?t=' + Date.now());
      const Repo = mod.default;
      const r = new Repo();
      const todos = r.getTodos();
      expect(Array.isArray(todos)).toBe(true);
      expect(todos.length).toBeGreaterThan(0);
    });

    it('handles corrupted items JSON gracefully', async () => {
      localStorage.setItem('warframe-items', 'corrupted...');
      const mod = await import('../../src/data/repository.js?t=' + Date.now() + '1');
      const Repo = mod.default;
      const r = new Repo();
      const items = r.getAllItems();
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    });

    it('handles corrupted material inventory JSON gracefully', async () => {
      localStorage.setItem('warframe-materials-inventory', 'broken');
      const mod = await import('../../src/data/repository.js?t=' + Date.now() + '2');
      const Repo = mod.default;
      const r = new Repo();
      const inv = r.getMaterialInventory();
      expect(typeof inv).toBe('object');
      expect(inv).toEqual({});
    });
  });
});
