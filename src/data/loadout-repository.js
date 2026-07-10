'use client';

const STORAGE_KEY = 'warframe-loadouts';
const SLOT_TYPES = ['warframe', 'primary', 'secondary', 'melee', 'companion', 'archwing', 'other'];

function flattenLoadout({ data, ...rest }) {
  return { ...rest, ...(data || {}) };
}

function stripDataFields(loadout) {
  const { id, name, version, created_at, updated_at, ...data } = loadout;
  return data;
}

export default class LoadoutRepository {
  #data;
  #initialized = false;
  #initPromise = null;

  constructor() {
    this.#data = { loadouts: [] };
  }

  async init() {
    if (this.#initialized) return;
    if (this.#initPromise) return this.#initPromise;
    this.#initPromise = this.#fetchAll();
    await this.#initPromise;
    this.#initialized = true;
  }

  async #fetchAll() {
    try {
      const res = await fetch('/api/loadouts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      this.#data.loadouts = Array.isArray(body.data) ? body.data : [];
      // One-time migration: if server returned empty but old localStorage
      // has data, push it to the server so it's not lost (see #23/#19).
      if (this.#data.loadouts.length === 0) {
        this.#migrateFromLocalStorage();
      }
    } catch (err) {
      console.error('Failed to fetch loadouts:', err);
      this.#data.loadouts = [];
    }
  }

  async #migrateFromLocalStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const localLoadouts = parsed.loadouts || parsed || [];
      if (!Array.isArray(localLoadouts) || localLoadouts.length === 0) return;
      this.#data.loadouts = localLoadouts;
      // Push each loadout to the server via POST (creates new DB records)
      for (const loadout of localLoadouts) {
        await fetch('/api/loadouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: loadout.id,
            name: loadout.name,
            data: stripDataFields(loadout),
          }),
        });
      }
      // Mark as migrated so the background push doesn't re-create them
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* best-effort */ }
  }

  async #patch(loadout) {
    const payload = { data: stripDataFields(loadout), clientVersion: loadout.version || 0 };
    const res = await fetch(`/api/loadouts/${loadout.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`PATCH /api/loadouts/${loadout.id} failed:`, res.status);
      return;
    }
    // Update in-memory version from server response
    const updated = await res.json();
    if (updated && updated.version) {
      loadout.version = updated.version;
    }
  }

  #now() { return new Date().toISOString(); }
  #nextId(prefix) { return prefix + '-' + Date.now(); }

  getLoadouts() {
    return this.#data.loadouts.map((l) => ({
      ...l,
      slots: (l.slots || []).map((s) => ({ ...s, requirements: (s.requirements || []).map((r) => ({ ...r })) }))
    }));
  }

  async updateLoadoutData(id, data) {
    const loadout = this.#data.loadouts.find((l) => l.id === id);
    if (!loadout) return null;
    loadout.data = data;
    loadout.updated_at = this.#now();
    await this.#patch(loadout);
    return loadout;
  }

  getAllRequirements() {
    const reqs = [];
    for (const loadout of this.#data.loadouts) {
      for (const slot of (loadout.slots || [])) {
        for (const req of (slot.requirements || [])) {
          if (!req.acquired && req.name) {
            reqs.push({
              name: req.name,
              loadout: loadout.name,
              slot: slot.slot_type,
            });
          }
        }
      }
    }
    return reqs;
  }

  getLoadoutById(id) {
    const loadout = this.#data.loadouts.find((l) => l.id === id);
    if (!loadout) return null;
    return {
      ...loadout,
      slots: (loadout.slots || []).map((s) => ({ ...s, requirements: (s.requirements || []).map((r) => ({ ...r })) }))
    };
  }

  async createLoadout({ name }) {
    const id = this.#nextId('loadout');
    const now = this.#now();
    const loadout = {
      id, name: name.trim(), created_at: now, updated_at: now,
      slots: SLOT_TYPES.map((type, i) => ({
        id: id + '-' + type, loadout_id: id, slot_type: type,
        item_id: null, custom_item_name: null, acquired: false, notes: '',
        display_order: i, requirements: []
      }))
    };
    this.#data.loadouts.push(loadout);
    // Fire-and-forget server create
    this.#serverCreate(loadout).catch(() => {});
    return this.getLoadoutById(id);
  }

  async #serverCreate(loadout) {
    try {
      const res = await fetch('/api/loadouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: loadout.id,
          name: loadout.name,
          data: stripDataFields(loadout),
        }),
      });
      if (res.ok) {
        const created = await res.json();
        if (created && created.version) {
          loadout.version = created.version;
        }
      }
    } catch (err) {
      console.error('Failed to create loadout on server:', err);
    }
  }

  async updateLoadout(id, updates) {
    const loadout = this.#data.loadouts.find((l) => l.id === id);
    if (!loadout) return null;
    Object.assign(loadout, updates, { updated_at: this.#now() });
    this.#patch(loadout).catch(() => {});
    return this.getLoadoutById(id);
  }

  async deleteLoadout(id) {
    const target = this.#data.loadouts.find((l) => l.id === id);
    const before = this.#data.loadouts.length;
    this.#data.loadouts = this.#data.loadouts.filter((l) => l.id !== id);
    if (this.#data.loadouts.length !== before) {
      const version = target?.version ?? 0;
      this.#serverDelete(id, version).catch(() => {});
      return true;
    }
    return false;
  }

  async #serverDelete(id, version) {
    try {
      await fetch(`/api/loadouts/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientVersion: version }),
      });
    } catch (err) {
      console.error('Failed to delete loadout on server:', err);
    }
  }

  addSlot(loadoutId, slot) {
    const loadout = this.#data.loadouts.find((l) => l.id === loadoutId);
    if (!loadout) return null;
    const slots = loadout.slots || [];
    const dupItem = slot.item_id && slots.some((s) => s.item_id === slot.item_id);
    const dupCustom = slot.custom_item_name && slots.some((s) => s.custom_item_name === slot.custom_item_name);
    if (dupItem || dupCustom) return null;
    const entry = {
      id: this.#nextId('slot'), loadout_id: loadoutId,
      slot_type: slot.slot_type || 'other', item_id: slot.item_id || null,
      custom_item_name: slot.custom_item_name || null, acquired: slot.acquired === true,
      notes: slot.notes || '', display_order: (loadout.slots || []).length, requirements: []
    };
    if (!loadout.slots) loadout.slots = [];
    loadout.slots.push(entry);
    loadout.updated_at = this.#now();
    this.#patch(loadout).catch(() => {});
    return { ...entry, requirements: [] };
  }

  updateSlot(loadoutId, slotId, updates) {
    const loadout = this.#data.loadouts.find((l) => l.id === loadoutId);
    if (!loadout) return null;
    const slot = (loadout.slots || []).find((s) => s.id === slotId);
    if (!slot) return null;
    Object.assign(slot, updates);
    loadout.updated_at = this.#now();
    this.#patch(loadout).catch(() => {});
    return { ...slot, requirements: (slot.requirements || []).map((r) => ({ ...r })) };
  }

  deleteSlot(loadoutId, slotId) {
    const loadout = this.#data.loadouts.find((l) => l.id === loadoutId);
    if (!loadout) return false;
    const slot = (loadout.slots || []).find((s) => s.id === slotId);
    if (!slot) return false;
    slot.item_id = null; slot.custom_item_name = null;
    slot.acquired = false; slot.notes = ''; slot.requirements = [];
    loadout.updated_at = this.#now();
    this.#patch(loadout).catch(() => {});
    return true;
  }

  addRequirement(slotId, requirement) {
    for (const loadout of this.#data.loadouts) {
      const slot = (loadout.slots || []).find((s) => s.id === slotId);
      if (slot) {
        const entry = {
          id: this.#nextId('req'), loadout_slot_id: slotId,
          name: requirement.name.trim(), wiki_url: requirement.wiki_url || null,
          user_notes: requirement.user_notes || '', acquired: requirement.acquired === true,
          display_order: (slot.requirements || []).length
        };
        if (!slot.requirements) slot.requirements = [];
        slot.requirements.push(entry);
        loadout.updated_at = this.#now();
        this.#patch(loadout).catch(() => {});
        return { ...entry };
      }
    }
    return null;
  }

  updateRequirement(slotId, requirementId, updates) {
    for (const loadout of this.#data.loadouts) {
      const slot = (loadout.slots || []).find((s) => s.id === slotId);
      if (slot) {
        const req = (slot.requirements || []).find((r) => r.id === requirementId);
        if (req) {
          Object.assign(req, updates);
          loadout.updated_at = this.#now();
          this.#patch(loadout).catch(() => {});
          return { ...req };
        }
      }
    }
    return null;
  }

  deleteRequirement(slotId, requirementId) {
    for (const loadout of this.#data.loadouts) {
      const slot = (loadout.slots || []).find((s) => s.id === slotId);
      if (slot) {
        const before = (slot.requirements || []).length;
        slot.requirements = (slot.requirements || []).filter((r) => r.id !== requirementId);
        if (slot.requirements.length !== before) {
          loadout.updated_at = this.#now();
          this.#patch(loadout).catch(() => {});
          return true;
        }
        return false;
      }
    }
    return false;
  }

  getDashboardSummary() {
    const summary = [];
    for (const loadout of this.#data.loadouts) {
      const entry = { loadout_id: loadout.id, loadout_name: loadout.name, unacquired_slots: [], unacquired_requirements: [] };
      for (const slot of loadout.slots || []) {
        if (!slot.item_id && !slot.custom_item_name) continue;
        if (!slot.acquired) entry.unacquired_slots.push({ slot_id: slot.id, slot_type: slot.slot_type, item_id: slot.item_id, custom_item_name: slot.custom_item_name });
        for (const req of slot.requirements || []) {
          if (!req.acquired) entry.unacquired_requirements.push({ slot_id: slot.id, slot_type: slot.slot_type, requirement_id: req.id, name: req.name });
        }
      }
      summary.push(entry);
    }
    return summary;
  }
}
