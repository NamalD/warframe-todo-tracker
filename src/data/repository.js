'use client';
import {
  seedItems,
  seedMaterials,
  seedSources,
  seedTreeRelationships,
  seedTodos
} from './seed.js';

const STORAGE_KEY = 'warframe-todos';
const ITEMS_STORAGE_KEY = 'warframe-items';

export default class Repository {
  items;
  materials;
  sources;
  treeRelationships;
  todos;

  constructor() {
    this.items = [...seedItems];
    this.materials = [...seedMaterials];
    this.sources = [...seedSources];
    this.treeRelationships = [...seedTreeRelationships];

    if (typeof window !== 'undefined') {
      const storedTodos = localStorage.getItem(STORAGE_KEY);
      if (storedTodos) {
        try {
          this.todos = JSON.parse(storedTodos);
        } catch (e) {
          this.todos = [...seedTodos];
        }
      } else {
        this.todos = [...seedTodos];
      }

      const storedItems = localStorage.getItem(ITEMS_STORAGE_KEY);
      if (storedItems) {
        try {
          this.items = JSON.parse(storedItems);
        } catch (e) {
          this.items = [...seedItems];
        }
      }
    } else {
      this.todos = [...seedTodos];
    }
  }

  #persistTodos() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.todos));
    }
  }

  #persistItems() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(this.items));
    }
  }

  updateItem(id, updates) {
    const target = this.items.find((i) => i.id === id);
    if (!target) return null;
    Object.assign(target, updates);
    this.#persistItems();
    return { ...target };
  }

  getAllItems() {
    return this.items.map((it) => ({ ...it }));
  }

  getItemById(id) {
    const item = this.items.find((i) => i.id === id);
    return item ? { ...item } : null;
  }

  getMaterialsForItem(id) {
    return this.materials
      .filter((m) => m.craftable_item_id === id)
      .map((m) => ({ ...m }));
  }

  getAllSources() {
    return this.sources.map((s) => ({ ...s }));
  }

  getSourcesForMaterial(name) {
    return this.sources
      .filter((s) => s.material_name === name)
      .map((s) => ({ ...s }));
  }

  getTreeForItem(id) {
    const children = this.treeRelationships
      .filter((r) => r.parent_item_id === id)
      .map((r) => {
        const child = this.items.find((it) => it.id === r.child_item_id);
        return {
          id: r.id,
          quantity_required: r.quantity_required,
          child: child ? { ...child } : null
        };
      });
    const parents = this.treeRelationships
      .filter((r) => r.child_item_id === id)
      .map((r) => {
        const parent = this.items.find((it) => it.id === r.parent_item_id);
        return {
          id: r.id,
          quantity_required: r.quantity_required,
          parent: parent ? { ...parent } : null
        };
      });
    return { children, parents };
  }

  getTodos() {
    return this.todos.map((t) => ({ ...t }));
  }

  addTodo(todo) {
    const entry = {
      ...todo,
      id: todo.id || `todo-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.todos.push(entry);
    this.#persistTodos();
    return { ...entry };
  }

  updateTodoStatus(id, status) {
    const target = this.todos.find((t) => t.id === id);
    if (!target) return null;
    target.status = status;
    target.updated_at = new Date().toISOString();
    this.#persistTodos();
    return { ...target };
  }

  updateTodoNotes(id, notes) {
    const target = this.todos.find((t) => t.id === id);
    if (!target) return null;
    target.user_notes = notes;
    target.updated_at = new Date().toISOString();
    this.#persistTodos();
    return { ...target };
  }

  deleteTodo(id) {
    const before = this.todos.length;
    this.todos = this.todos.filter((t) => t.id !== id);
    if (this.todos.length !== before) {
      this.#persistTodos();
      return true;
    }
    return false;
  }
}
