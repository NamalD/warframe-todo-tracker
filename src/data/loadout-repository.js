'use client';

const STORAGE_KEY = 'warframe-loadouts';
const SLOT_TYPES = ['warframe', 'primary', 'secondary', 'melee', 'companion', 'archwing', 'other'];

export default class LoadoutRepository {
  #data;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          this.#data = JSON.parse(stored);
        } catch (e) {
          this.#data = { loadouts: [] };
        }
      } else {
        this.#data = { loadouts: [] };
      }
    } else {
      this.#data = { loadouts: [] };
    }
  }

  #persist() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#data));
    }
    // Push to server (fire-and-forget)
    this.#syncToServer();
  }

  async #syncToServer() {
    try {
      await fetch('/api/loadouts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.#data.loadouts),
      });
    } catch {
      // Silently fail — localStorage still has the data
    }
  }

  async syncFromServer() {
    try {
      const res = await fetch('/api/loadouts');
      if (res.ok) {
        const serverLoadouts = await res.json();
        if (Array.isArray(serverLoadouts) && serverLoadouts.length > 0) {
          this.#data.loadouts = serverLoadouts;
          this.#persistLocal();
        }
      }
    } catch {
      // Keep localStorage data
    }
  }

  #persistLocal() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#data));
    }
  }

  #now() {
    return new Date().toISOString();
  }

  #nextId(prefix) {
    return `${prefix}-${Date.now()}`;
  }

  // ── Loadout CRUD ──────────────────────────────────────────────

  getLoadouts() {
    return this.#data.loadouts.map((l) => ({
      ...l,
      slots: (l.slots || []).map((s) => ({
        ...s,
        requirements: (s.requirements || []).map((r) => ({ ...r }))
      }))
    }));
  }

  getLoadoutById(id) {
    const loadout = this.#data.loadouts.find((l) => l.id === id);
    if (!loadout) return null;
    return {
      ...loadout,
      slots: (loadout.slots || []).map((s) => ({
        ...s,
        requirements: (s.requirements || []).map((r) => ({ ...r }))
      }))
    };
  }

  createLoadout({ name }) {
    const id = this.#nextId('loadout');
    const now = this.#now();
    const loadout = {
      id,
      name: name.trim(),
      created_at: now,
      updated_at: now,
      slots: SLOT_TYPES.map((type, i) => ({
        id: `${id}-${type}`,
        loadout_id: id,
        slot_type: type,
        item_id: null,
        custom_item_name: null,
        acquired: false,
        notes: '',
        display_order: i,
        requirements: []
      }))
    };
    this.#data.loadouts.push(loadout);
    this.#persist();
    return this.getLoadoutById(id);
  }

  updateLoadout(id, updates) {
    const loadout = this.#data.loadouts.find((l) => l.id === id);
    if (!loadout) return null;
    Object.assign(loadout, updates, { updated_at: this.#now() });
    this.#persist();
    return this.getLoadoutById(id);
  }

  deleteLoadout(id) {
    const before = this.#data.loadouts.length;
    this.#data.loadouts = this.#data.loadouts.filter((l) => l.id !== id);
    if (this.#data.loadouts.length !== before) {
      this.#persist();
      return true;
    }
    return false;
  }

  // ── Slot CRUD ─────────────────────────────────────────────────

  addSlot(loadoutId, slot) {
    const loadout = this.#data.loadouts.find((l) => l.id === loadoutId);
    if (!loadout) return null;

    const slots = loadout.slots || [];
    const duplicateItem = slot.item_id && slots.some((s) => s.item_id === slot.item_id);
    const duplicateCustom = slot.custom_item_name && slots.some((s) => s.custom_item_name === slot.custom_item_name);
    if (duplicateItem || duplicateCustom) {
      return null;
    }

    const entry = {
      id: this.#nextId('slot'),
      loadout_id: loadoutId,
      slot_type: slot.slot_type || 'other',
      item_id: slot.item_id || null,
      custom_item_name: slot.custom_item_name || null,
      acquired: slot.acquired === true,
      notes: slot.notes || '',
      display_order: (loadout.slots || []).length,
      requirements: []
    };
    if (!loadout.slots) loadout.slots = [];
    loadout.slots.push(entry);
    loadout.updated_at = this.#now();
    this.#persist();
    return { ...entry, requirements: [] };
  }

  updateSlot(loadoutId, slotId, updates) {
    const loadout = this.#data.loadouts.find((l) => l.id === loadoutId);
    if (!loadout) return null;
    const slot = (loadout.slots || []).find((s) => s.id === slotId);
    if (!slot) return null;
    Object.assign(slot, updates);
    loadout.updated_at = this.#now();
    this.#persist();
    return { ...slot, requirements: (slot.requirements || []).map((r) => ({ ...r })) };
  }

  deleteSlot(loadoutId, slotId) {
    const loadout = this.#data.loadouts.find((l) => l.id === loadoutId);
    if (!loadout) return false;
    const slot = (loadout.slots || []).find((s) => s.id === slotId);
    if (!slot) return false;
    // Reset slot to empty rather than removing it
    slot.item_id = null;
    slot.custom_item_name = null;
    slot.acquired = false;
    slot.notes = '';
    slot.requirements = [];
    loadout.updated_at = this.#now();
    this.#persist();
    return true;
  }

  // ── Requirement CRUD ──────────────────────────────────────────

  addRequirement(slotId, requirement) {
    for (const loadout of this.#data.loadouts) {
      const slot = (loadout.slots || []).find((s) => s.id === slotId);
      if (slot) {
        const entry = {
          id: this.#nextId('req'),
          loadout_slot_id: slotId,
          name: requirement.name.trim(),
          wiki_url: requirement.wiki_url || null,
          user_notes: requirement.user_notes || '',
          acquired: requirement.acquired === true,
          display_order: (slot.requirements || []).length
        };
        if (!slot.requirements) slot.requirements = [];
        slot.requirements.push(entry);
        loadout.updated_at = this.#now();
        this.#persist();
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
          this.#persist();
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
          this.#persist();
          return true;
        }
        return false;
      }
    }
    return false;
  }

  // ── Dashboard ─────────────────────────────────────────────────

  getDashboardSummary() {
    const summary = [];
    for (const loadout of this.#data.loadouts) {
      const entry = {
        loadout_id: loadout.id,
        loadout_name: loadout.name,
        unacquired_slots: [],
        unacquired_requirements: []
      };
      for (const slot of loadout.slots || []) {
        // Skip empty placeholder slots
        if (!slot.item_id && !slot.custom_item_name) continue;

        if (!slot.acquired) {
          entry.unacquired_slots.push({
            slot_id: slot.id,
            slot_type: slot.slot_type,
            item_id: slot.item_id,
            custom_item_name: slot.custom_item_name
          });
        }
        for (const req of slot.requirements || []) {
          if (!req.acquired) {
            entry.unacquired_requirements.push({
              slot_id: slot.id,
              slot_type: slot.slot_type,
              requirement_id: req.id,
              name: req.name
            });
          }
        }
      }
      summary.push(entry);
    }
    return summary;
  }
}
