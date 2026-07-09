'use client';
import { pullFromServer, pushToServer, deleteFromServer } from './sync-helper.js';

const STORAGE_KEY = 'warframe-loadouts';
const SLOT_TYPES = ['warframe', 'primary', 'secondary', 'melee', 'companion', 'archwing', 'other'];

export default class LoadoutRepository {
  #data;
  #onSyncEvent = null;
  #syncInProgress = false;
  #pendingSync = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { this.#data = JSON.parse(stored); }
        catch (e) { this.#data = { loadouts: [] }; }
      } else {
        this.#data = { loadouts: [] };
      }
    } else {
      this.#data = { loadouts: [] };
    }
  }

  setSyncEventCallback(cb) { this.#onSyncEvent = cb; }
  lastSyncError = null;

  #persist() {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#data));
    this.#pendingSync = this.#syncToServer().catch(() => {});
  }

  async forceSyncToServer() { return this.#syncToServer(); }

  /** Returns a promise that resolves when any pending sync completes. */
  async flushPendingSync() {
    if (this.#pendingSync) await this.#pendingSync;
    this.#pendingSync = null;
  }

  async #syncToServer() {
    if (this.#syncInProgress) return false;
    this.#syncInProgress = true;
    try {
      const ok = await pushToServer('/api/loadouts', this.#data.loadouts, this.#onSyncEvent);
      if (ok) this.lastSyncError = null;
      return ok;
    } finally {
      this.#syncInProgress = false;
    }
  }

  async syncFromServer() {
    if (this.#syncInProgress) return;
    this.#syncInProgress = true;
    try {
      const result = await pullFromServer('/api/loadouts', STORAGE_KEY, this.#onSyncEvent, 'loadouts');
      if (result.fromServer) {
        this.#data.loadouts = Array.isArray(result.data) ? result.data : [];
        this.#persistLocal();
        this.lastSyncError = null;
      } else if (result.fromLocal) {
        // Server unreachable — pullFromServer fell back to local data
        this.lastSyncError = 'Server unreachable';
        this.#persistLocal();
      }
      // Clear pending sync — server state is now authoritative
      this.#pendingSync = null;
    } catch (err) {
      this.lastSyncError = err.message;
      if (this.#onSyncEvent) this.#onSyncEvent('error', 'Sync failed: ' + err.message);
    } finally {
      this.#syncInProgress = false;
    }
  }

  #persistLocal() {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#data));
  }

  #now() { return new Date().toISOString(); }
  #nextId(prefix) { return prefix + '-' + Date.now(); }

  getLoadouts() {
    return this.#data.loadouts.map((l) => ({
      ...l,
      slots: (l.slots || []).map((s) => ({ ...s, requirements: (s.requirements || []).map((r) => ({ ...r })) }))
    }));
  }

  getLoadoutById(id) {
    const loadout = this.#data.loadouts.find((l) => l.id === id);
    if (!loadout) return null;
    return {
      ...loadout,
      slots: (loadout.slots || []).map((s) => ({ ...s, requirements: (s.requirements || []).map((r) => ({ ...r })) }))
    };
  }

  createLoadout({ name }) {
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
    const target = this.#data.loadouts.find((l) => l.id === id);
    const before = this.#data.loadouts.length;
    this.#data.loadouts = this.#data.loadouts.filter((l) => l.id !== id);
    if (this.#data.loadouts.length !== before) {
      this.#persistLocal();
      // The bulk push (#persist) is an additive merge and can't propagate a
      // delete (see #14) — tell the server directly instead.
      this.#pendingSync = deleteFromServer('/api/loadouts', id, target?.version ?? 0, this.#onSyncEvent).catch(() => {});
      return true;
    }
    return false;
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
    slot.item_id = null; slot.custom_item_name = null;
    slot.acquired = false; slot.notes = ''; slot.requirements = [];
    loadout.updated_at = this.#now();
    this.#persist();
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
        if (req) { Object.assign(req, updates); loadout.updated_at = this.#now(); this.#persist(); return { ...req }; }
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
        if (slot.requirements.length !== before) { loadout.updated_at = this.#now(); this.#persist(); return true; }
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
