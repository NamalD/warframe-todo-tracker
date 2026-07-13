// @ts-nocheck
'use client';

/** @typedef {{ id: string; cadence: 'daily'|'weekly'|'biweekly'; category: string; label: string; sort_order: number; last_completed_at: string|null; version: number; created_at: string; updated_at: string }} ChecklistTask */

const KEY = 'warframe-checklist-cache';

export default class ChecklistStore {
  /** @type {ChecklistTask[]} */
  tasks = [];

  /** @type {Promise<void> | null} */
  #initPromise = null;

  async init() {
    if (this.#initPromise) return this.#initPromise;
    this.#initPromise = this.#load();
    return this.#initPromise;
  }

  async #load() {
    try {
      const res = await fetch('/api/checklists');
      if (res.ok) {
        const body = await res.json();
        const data = Array.isArray(body?.data) ? body.data : body;
        this.tasks = Array.isArray(data) ? data : [];
      } else {
        this.tasks = [];
      }
    } catch {
      this.tasks = [];
    }
  }

  async create(task) {
    const res = await fetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
    if (res.ok) {
      const created = await res.json();
      this.tasks.push(created);
    }
    return res.ok;
  }

  async update(id, updates) {
    const res = await fetch(`/api/checklists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      const updated = await res.json();
      this.tasks = this.tasks.map(t => t.id === id ? updated : t);
    }
    return res.ok;
  }

  async remove(id) {
    const res = await fetch(`/api/checklists/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      this.tasks = this.tasks.filter(t => t.id !== id);
    }
    return res.ok;
  }
}
