'use client';

const STORAGE_KEY = 'warframe-loadouts';

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
    const loadout = {
      id: this.#nextId('loadout'),
      name: name.trim(),
      created_at: this.#now(),
      updated_at: this.#now(),
      slots: []
    };
    this.#data.loadouts.push(loadout);
    this.#persist();
    return { ...loadout, slots: [] };
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
    const before = (loadout.slots || []).length;
    loadout.slots = (loadout.slots || []).filter((s) => s.id !== slotId);
    if (loadout.slots.length !== before) {
      loadout.updated_at = this.#now();
      this.#persist();
      return true;
    }
    return false;
  }

  // ── Requirement CRUD ──────────────────────────────────────────

  addRequirement(slotId, requirement) {
    // Find slot across all loadouts
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
