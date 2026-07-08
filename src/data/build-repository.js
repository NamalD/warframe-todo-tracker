'use client';
import { pullFromServer, pushToServer } from './sync-helper.js';

const STORAGE_KEY = 'warframe-builds';

export default class BuildRepository {
  #data;
  #onSyncEvent = null;
  #syncInProgress = false;
  #pendingSync = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { this.#data = JSON.parse(stored); }
        catch (e) { this.#data = { builds: [] }; }
      } else {
        this.#data = { builds: [] };
      }
    } else {
      this.#data = { builds: [] };
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
      const ok = await pushToServer('/api/builds', this.#data.builds, this.#onSyncEvent);
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
      const result = await pullFromServer('/api/builds', STORAGE_KEY, this.#onSyncEvent, 'builds');
      if (result.fromServer) {
        this.#data.builds = Array.isArray(result.data) ? result.data : [];
        this.#persistLocal();
        this.lastSyncError = null;
      } else if (result.fromLocal) {
        this.lastSyncError = 'Server unreachable';
        this.#persistLocal();
      }
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

  getBuilds() {
    return this.#data.builds.map((b) => ({
      ...b,
      requirements: (b.requirements || []).map((r) => ({ ...r }))
    }));
  }

  getBuildById(id) {
    const build = this.#data.builds.find((b) => b.id === id);
    if (!build) return null;
    return {
      ...build,
      requirements: (build.requirements || []).map((r) => ({ ...r }))
    };
  }

  createBuild({ name, item_id, custom_item_name, wiki_url, notes, acquired }) {
    const id = this.#nextId('build');
    const now = this.#now();
    const build = {
      id,
      name: name.trim(),
      item_id: item_id || null,
      custom_item_name: custom_item_name || null,
      acquired: acquired === true,
      notes: notes || '',
      wiki_url: wiki_url || null,
      created_at: now,
      updated_at: now,
      requirements: []
    };
    this.#data.builds.push(build);
    this.#persist();
    return this.getBuildById(id);
  }

  updateBuild(id, updates) {
    const build = this.#data.builds.find((b) => b.id === id);
    if (!build) return null;
    Object.assign(build, updates, { updated_at: this.#now() });
    this.#persist();
    return this.getBuildById(id);
  }

  deleteBuild(id) {
    const before = this.#data.builds.length;
    this.#data.builds = this.#data.builds.filter((b) => b.id !== id);
    if (this.#data.builds.length !== before) { this.#persist(); return true; }
    return false;
  }

  addRequirement(buildId, requirement) {
    const build = this.#data.builds.find((b) => b.id === buildId);
    if (!build) return null;
    const entry = {
      id: this.#nextId('req'),
      build_id: buildId,
      name: requirement.name.trim(),
      wiki_url: requirement.wiki_url || null,
      user_notes: requirement.user_notes || '',
      acquired: requirement.acquired === true,
      display_order: (build.requirements || []).length
    };
    if (!build.requirements) build.requirements = [];
    build.requirements.push(entry);
    build.updated_at = this.#now();
    this.#persist();
    return { ...entry };
  }

  updateRequirement(buildId, requirementId, updates) {
    const build = this.#data.builds.find((b) => b.id === buildId);
    if (!build) return null;
    const req = (build.requirements || []).find((r) => r.id === requirementId);
    if (!req) return null;
    Object.assign(req, updates);
    build.updated_at = this.#now();
    this.#persist();
    return { ...req };
  }

  deleteRequirement(buildId, requirementId) {
    const build = this.#data.builds.find((b) => b.id === buildId);
    if (!build) return false;
    const before = (build.requirements || []).length;
    build.requirements = (build.requirements || []).filter((r) => r.id !== requirementId);
    if (build.requirements.length !== before) {
      build.updated_at = this.#now();
      this.#persist();
      return true;
    }
    return false;
  }

  getDashboardSummary() {
    const summary = [];
    for (const build of this.#data.builds) {
      if (build.acquired) {
        // If the build item itself is acquired, only show if there are unacquired requirements
        const unacquiredReqs = (build.requirements || []).filter((r) => !r.acquired);
        if (unacquiredReqs.length === 0) continue;
        summary.push({
          id: build.id,
          name: build.name,
          acquired: true,
          unacquired_reqs: unacquiredReqs.map((r) => ({ requirement_id: r.id, name: r.name }))
        });
      } else {
        // Build not acquired — always show
        const unacquiredReqs = (build.requirements || []).filter((r) => !r.acquired);
        summary.push({
          id: build.id,
          name: build.name,
          acquired: false,
          unacquired_reqs: unacquiredReqs.map((r) => ({ requirement_id: r.id, name: r.name }))
        });
      }
    }
    return summary;
  }
}
