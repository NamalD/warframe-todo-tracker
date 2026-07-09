'use client';

const MODS_CACHE_KEY = 'warframe-mods-cache';
const MODS_COLLECTION_KEY = 'warframe-mod-collection';

export default class ModRepository {
  #mods = [];
  #collection = {};
  #initialized = false;
  #initPromise = null;

  constructor() {
    // Load user collection from localStorage synchronously
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(MODS_COLLECTION_KEY);
      if (stored) {
        try {
          this.#collection = JSON.parse(stored);
        } catch (_e) {
          this.#collection = {};
        }
      }
    }
  }

  // ── Lazy initialization ──

  async #ensureInitialized() {
    if (this.#initialized) return;
    if (this.#initPromise) return this.#initPromise;
    this.#initPromise = this.#loadFromServer();
    await this.#initPromise;
    this.#initialized = true;
  }

  async #loadFromServer() {
    // SSR guard
    if (typeof window === 'undefined') return;

    try {
      const response = await fetch('/data/mods-cache.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const fetched = await response.json();

      // Check existing cache — skip fetch if version matches
      const cachedRaw = localStorage.getItem(MODS_CACHE_KEY);
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw);
          // Also gate on schemaVersion (see #18) — the @wfcd/items package
          // version alone doesn't change when prebuild.mjs's output shape
          // does, which previously left existing caches silently stale.
          if (cached.version === fetched.version && cached.schemaVersion === fetched.schemaVersion && Array.isArray(cached.mods)) {
            this.#mods = cached.mods;
            return;
          }
        } catch (_e) {
          /* corrupt — fall through to write new data */
        }
      }

      // Store fetched data as cache
      this.#mods = Array.isArray(fetched.mods) ? fetched.mods : [];
      localStorage.setItem(MODS_CACHE_KEY, JSON.stringify({
        version: fetched.version,
        schemaVersion: fetched.schemaVersion,
        cachedAt: fetched.cachedAt,
        mods: this.#mods,
      }));
    } catch (err) {
      // Network error — fall back to existing cache
      const cachedRaw = localStorage.getItem(MODS_CACHE_KEY);
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw);
          if (Array.isArray(cached.mods)) {
            this.#mods = cached.mods;
            return;
          }
        } catch (_e) { /* fall through */ }
      }
      // No fallback available — leave mods as empty array
      this.#mods = [];
      console.error('Failed to load mod cache:', err);
    }
  }

  // ── Persistence ──

  #persistCollection() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(MODS_COLLECTION_KEY, JSON.stringify(this.#collection));
    }
  }

  // ── Merge helper ──

  #getMod(refMod) {
    const userState = this.#collection[refMod.id];
    return {
      ...refMod,
      owned: userState ? !!userState.owned : false,
      rank: userState ? (userState.rank || 0) : 0,
    };
  }

  // ── Public API ──

  async getMods() {
    await this.#ensureInitialized();
    return this.#mods.map((m) => this.#getMod(m));
  }

  async getModById(id) {
    await this.#ensureInitialized();
    const refMod = this.#mods.find((m) => m.id === id);
    return refMod ? this.#getMod(refMod) : null;
  }

  async setModOwned(id, owned) {
    await this.#ensureInitialized();
    const refMod = this.#mods.find((m) => m.id === id);
    if (!refMod) return;
    this.#collection[id] = {
      ...(this.#collection[id] || {}),
      owned: !!owned,
    };
    this.#persistCollection();
  }

  async setModRank(id, rank) {
    await this.#ensureInitialized();
    const refMod = this.#mods.find((m) => m.id === id);
    if (!refMod) return;
    const clampedRank = Math.max(0, Math.min(rank, refMod.fusion_limit));
    this.#collection[id] = {
      ...(this.#collection[id] || {}),
      rank: clampedRank,
    };
    this.#persistCollection();
  }

  async getTrackedMods() {
    await this.#ensureInitialized();
    return this.#mods
      .filter((m) => {
        const userState = this.#collection[m.id];
        return userState && !userState.owned;
      })
      .map((m) => this.#getMod(m));
  }

  getStats() {
    const total = this.#mods.length;
    let owned = 0;
    for (const mod of this.#mods) {
      const userState = this.#collection[mod.id];
      if (userState && userState.owned) owned++;
    }
    return {
      total,
      owned,
      unowned: total - owned,
    };
  }
}
