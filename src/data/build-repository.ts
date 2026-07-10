// @ts-nocheck
'use client';

/**
 * @typedef {import('../types/data').Build} Build
 * @typedef {import('../types/data').Requirement} Requirement
 */

export default class BuildRepository {
  /** @type {{ builds: Build[] }} */
  #data = { builds: /** @type {Build[]} */ ([]) };
  #initialized = false;
  /** @type {Promise<void> | null} */
  #initPromise = null;

  constructor() {
    this.#data = { builds: /** @type {Build[]} */ ([]) };
  }

  /** @returns {Promise<void>} */
  async init() {
    if (this.#initialized) return;
    if (this.#initPromise) return this.#initPromise;
    // @ts-ignore - JSDoc type on private field prevents direct assignment
    this.#initPromise = this.#fetchAll();
    await this.#initPromise;
    this.#initialized = true;
  }

  /** @returns {Promise<void>} */
  async #fetchAll() {
    try {
      const res = await fetch('/api/builds');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      // @ts-ignore - JSDoc type on private field
      this.#data.builds = Array.isArray(body) ? body : [];
    } catch (err) {
      console.error('Failed to fetch builds:', err);
      // @ts-ignore - JSDoc type on private field
      this.#data.builds = [];
    }
  }

  /** @returns {Promise<void>} */
  async #persistToServer() {
    try {
      await fetch('/api/builds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.#data.builds),
      });
    } catch (err) {
      console.error('Failed to persist builds:', err);
    }
  }

  /** @returns {string} */
  #now() { return new Date().toISOString(); }

  /**
   * @param {string} prefix
   * @returns {string}
   */
  // @ts-ignore - JSDoc inline param type not recognized in private method
  #nextId(prefix) { return prefix + '-' + Date.now(); }

  /** @returns {Build[]} */
  getBuilds() {
    return this.#data.builds.map((b) => {
      const build = /** @type {Build} */ (b);
      // @ts-ignore
      return { ...build, requirements: (build.requirements || []).map((r) => ({ ...r })) };
    });
  }

  /** 
     * @param {string} id 
     * @returns {Build | null} 
     */
    // @ts-ignore - implicit any in JSDoc param
    getBuildById(id) {
      // @ts-ignore - JSDoc type on private field
      const build = /** @type {Build} */ (this.#data.builds.find((b) => b.id === id));
      if (!build) return null;
      // @ts-ignore - spread on typed object
      return { ...build, requirements: (build.requirements || []).map((r) => ({ ...r })) };
    }

  /** @param {Object} params @returns {Build} */
  // @ts-ignore - implicit any in destructuring
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
    // @ts-ignore - JSDoc type on private field
    this.#data.builds.push(build);
    this.#persistToServer().catch(() => {});
    return this.getBuildById(id);
  }

  /** @param {string} id @param {Object} updates @returns {Build | null} */
  // @ts-ignore - inline JSDoc param type not recognized
  updateBuild(id, updates) {
    // @ts-ignore - JSDoc type on private field
    const build = this.#data.builds.find((b) => b.id === id);
    if (!build) return null;
    Object.assign(build, updates, { updated_at: this.#now() });
    this.#persistToServer().catch(() => {});
    return this.getBuildById(id);
  }

  /** @param {string} id @returns {boolean} */
  // @ts-ignore - inline JSDoc param type not recognized
  deleteBuild(id) {
    const before = this.#data.builds.length;
    // @ts-ignore - JSDoc type on private field
    this.#data.builds = this.#data.builds.filter((b) => b.id !== id);
    if (this.#data.builds.length !== before) {
      this.#persistToServer().catch(() => {});
      return true;
    }
    return false;
  }

  /** @param {string} buildId @param {Object} requirement @returns {Object | null} */
  // @ts-ignore - inline JSDoc param type not recognized
  addRequirement(buildId, requirement) {
    // @ts-ignore - JSDoc type on private field
    const build = /** @type {Build} */ (this.#data.builds.find((b) => b.id === buildId));
    if (!build) return null;
    // @ts-ignore - JSDoc type on private field
    const entry = {
      id: this.#nextId('req'),
      build_id: buildId,
      name: requirement.name.trim(),
      wiki_url: requirement.wiki_url || null,
      user_notes: requirement.user_notes || '',
      acquired: requirement.acquired === true,
      // @ts-ignore - JSDoc type on private field
      display_order: (build.requirements || []).length
    };
    // @ts-ignore - JSDoc type on private field
    if (!build.requirements) build.requirements = [];
    // @ts-ignore - JSDoc type on private field
    build.requirements.push(entry);
    // @ts-ignore - JSDoc type on private field
    build.updated_at = this.#now();
    this.#persistToServer().catch(() => {});
    return { ...entry };
  }

  /** @param {string} buildId @param {string} requirementId @param {Object} updates @returns {Object | null} */
    // @ts-ignore - inline JSDoc param type not recognized
    updateRequirement(buildId, requirementId, updates) {
      // @ts-ignore - JSDoc type on private field
      const build = /** @type {Build} */ (this.#data.builds.find((b) => b.id === buildId));
      if (!build) return null;
      // @ts-ignore - JSDoc type on private field
      const req = (build.requirements || []).find((r) => r.id === requirementId);
      if (!req) return null;
      // @ts-ignore - JSDoc type on private field
      Object.assign(req, updates);
      // @ts-ignore - JSDoc type on private field
      build.updated_at = this.#now();
      this.#persistToServer().catch(() => {});
      return { ...req };
    }

    /** @param {string} buildId @param {string} requirementId @returns {boolean} */
    // @ts-ignore - inline JSDoc param type not recognized
    deleteRequirement(buildId, requirementId) {
      // @ts-ignore - JSDoc type on private field
      const build = /** @type {Build} */ (this.#data.builds.find((b) => b.id === buildId));
      if (!build) return false;
      // @ts-ignore - JSDoc type on private field
      const before = (build.requirements || []).length;
      // @ts-ignore - JSDoc type on private field
      build.requirements = (build.requirements || []).filter((r) => r.id !== requirementId);
      // @ts-ignore - JSDoc type on private field
      if (build.requirements.length !== before) {
        // @ts-ignore - JSDoc type on private field
        build.updated_at = this.#now();
        this.#persistToServer().catch(() => {});
        return true;
      }
      return false;
    }

  /** @returns {Object[]} */
  getDashboardSummary() {
    const summary = [];
    // @ts-ignore - JSDoc type on private field
    for (const build of this.#data.builds) {
      // @ts-ignore - JSDoc type on private field
      if (build.acquired) {
        // @ts-ignore - JSDoc type on private field
        const unacquiredReqs = (build.requirements || []).filter((r) => !r.acquired);
        if (unacquiredReqs.length === 0) continue;
        summary.push({
          id: build.id,
          name: build.name,
          acquired: true,
          unacquired_reqs: unacquiredReqs.map((r) => ({ requirement_id: r.id, name: r.name }))
        });
      } else {
        // @ts-ignore - JSDoc type on private field
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
