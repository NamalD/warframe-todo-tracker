'use client';
import { pullFromServer, pushToServer, pullSyncData, pushChanges, patchRecord, createRecord, deleteRecord } from './sync-helper.js';

const STORAGE_KEY = 'warframe-loadouts';
const SLOT_TYPES = ['warframe', 'primary', 'secondary', 'melee', 'companion', 'archwing', 'other'];

export default class LoadoutRepository {
  #data;
  #onSyncEvent = null;
  #syncInProgress = false;
  #pendingSync = null;
  #dirtyLoadoutIds = new Set();
  #loadoutVersions = new Map();

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

  async forceSyncToServer() {
    // Build dirty loadouts payload
    const dirtyLoadouts = [];
    for (const id of this.#dirtyLoadoutIds) {
      const loadout = this.#data.loadouts.find(l => l.id === id);
      if (loadout) {
        dirtyLoadouts.push({
          ...loadout,
          clientVersion: this.#loadoutVersions.get(id) || 0,
        });
      }
    }

    try {
      if (dirtyLoadouts.length > 0) {
        const result = await pushChanges('/api/sync', { loadouts: dirtyLoadouts });
        if (result.conflicts && this.#onSyncEvent) {
          for (const conflict of (result.conflicts.loadouts || [])) {
            this.#onSyncEvent('conflict', `Record ${conflict.record_id} updated by another device — changes merged`);
          }
        }
        if (result.accepted && result.accepted.loadouts) {
          for (const id of result.accepted.loadouts) {
            this.#dirtyLoadoutIds.delete(id);
          }
        }
        this.lastSyncError = null;
      }

      // Legacy push as fallback
      return this.#syncToServer();
    } catch (err) {
      if (this.#onSyncEvent) this.#onSyncEvent('error', err.message);
      return false;
    }
  }

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
      // Use granular sync endpoint to get all data with versions
      let syncResult;
      try {
        syncResult = await pullSyncData('/api/sync');
      } catch {
        syncResult = null;
      }

      if (syncResult && syncResult.loadouts !== undefined) {
        // Granular sync — update loadouts with versions
        this.#data.loadouts = Array.isArray(syncResult.loadouts) ? syncResult.loadouts : [];
        for (const loadout of this.#data.loadouts) {
          if (loadout.version !== undefined) {
            this.#loadoutVersions.set(loadout.id, loadout.version);
          }
        }
        this.#persistLocal();
        this.#dirtyLoadoutIds.clear();
        this.lastSyncError = null;
        this.#pendingSync = null;
      } else {
        // Legacy fallback via pullFromServer
        const result = await pullFromServer('/api/loadouts', STORAGE_KEY, this.#onSyncEvent, 'loadouts');
        if (result.fromServer) {
          this.#data.loadouts = Array.isArray(result.data) ? result.data : [];
          this.#persistLocal();
          this.lastSyncError = null;
        } else if (result.fromLocal) {
          this.lastSyncError = 'Server unreachable';
          this.#persistLocal();
        }
        this.#pendingSync = null;
      }
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

  /**
   * Sync a loadout via granular API with conflict handling.
   * On 409 conflict, auto-accept server version.
   */
  async #syncLoadoutViaGranularApi(loadout) {
    const clientVersion = this.#loadoutVersions.get(loadout.id) || 0;
    try {
      if (clientVersion === 0) {
        // New loadout — create on server
        const result = await createRecord('/api/loadouts', {
          id: loadout.id,
          name: loadout.name,
          data: loadout,
        });
        if (result && result.version !== undefined) {
          this.#loadoutVersions.set(loadout.id, result.version);
        }
      } else {
        // Existing loadout — patch
        const result = await patchRecord('/api/loadouts', loadout.id, {
          data: loadout,
          clientVersion,
        });
        if (result && result.version !== undefined) {
          this.#loadoutVersions.set(loadout.id, result.version);
        }
      }
      this.#dirtyLoadoutIds.delete(loadout.id);
    } catch (err) {
      if (err.conflict) {
        if (err.serverVersion !== undefined) {
          this.#loadoutVersions.set(loadout.id, err.serverVersion);
        }
        if (err.serverData) {
          const target = this.#data.loadouts.find(l => l.id === loadout.id);
          if (target) {
            Object.assign(target, err.serverData);
          }
        }
        if (this.#onSyncEvent) {
          this.#onSyncEvent('conflict', `Record ${loadout.id} updated by another device — changes merged`);
        }
        this.#dirtyLoadoutIds.delete(loadout.id);
      }
    }
  }

  /**
   * Delete a loadout via granular API with conflict handling.
   */
  async #deleteLoadoutViaGranularApi(id, clientVersion) {
    try {
      await deleteRecord('/api/loadouts', id, clientVersion);
    } catch (err) {
      if (err.conflict && this.#onSyncEvent) {
        this.#onSyncEvent('conflict', `Record ${id} updated by another device — changes merged`);
      }
    }
  }

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
      id, name: name.trim(), version: 0, created_at: now, updated_at: now,
      slots: SLOT_TYPES.map((type, i) => ({
        id: id + '-' + type, loadout_id: id, slot_type: type,
        item_id: null, custom_item_name: null, acquired: false, notes: '',
        display_order: i, requirements: []
      }))
    };
    this.#data.loadouts.push(loadout);
    this.#loadoutVersions.set(id, 0);
    this.#dirtyLoadoutIds.add(id);
    this.#persist();
    this.#syncLoadoutViaGranularApi(loadout);
    return this.getLoadoutById(id);
  }

  updateLoadout(id, updates) {
    const loadout = this.#data.loadouts.find((l) => l.id === id);
    if (!loadout) return null;
    Object.assign(loadout, updates, { updated_at: this.#now() });
    this.#dirtyLoadoutIds.add(id);
    this.#persist();
    this.#syncLoadoutViaGranularApi(loadout);
    return this.getLoadoutById(id);
  }

  deleteLoadout(id) {
    const before = this.#data.loadouts.length;
    const target = this.#data.loadouts.find((l) => l.id === id);
    this.#data.loadouts = this.#data.loadouts.filter((l) => l.id !== id);
    if (this.#data.loadouts.length !== before) {
      this.#dirtyLoadoutIds.delete(id);
      const version = this.#loadoutVersions.get(id) || 0;
      this.#loadoutVersions.delete(id);
      this.#persist();
      this.#deleteLoadoutViaGranularApi(id, version);
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
