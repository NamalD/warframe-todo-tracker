'use client';

export default class BuildRepository {
  #data;
  #initialized = false;
  #initPromise = null;

  constructor() {
    this.#data = { builds: [] };
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
      const res = await fetch('/api/builds');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      this.#data.builds = Array.isArray(body) ? body : [];
    } catch (err) {
      console.error('Failed to fetch builds:', err);
      this.#data.builds = [];
    }
  }

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
    this.#persistToServer().catch(() => {});
    return this.getBuildById(id);
  }

  updateBuild(id, updates) {
    const build = this.#data.builds.find((b) => b.id === id);
    if (!build) return null;
    Object.assign(build, updates, { updated_at: this.#now() });
    this.#persistToServer().catch(() => {});
    return this.getBuildById(id);
  }

  deleteBuild(id) {
    const before = this.#data.builds.length;
    this.#data.builds = this.#data.builds.filter((b) => b.id !== id);
    if (this.#data.builds.length !== before) {
      this.#persistToServer().catch(() => {});
      return true;
    }
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
    this.#persistToServer().catch(() => {});
    return { ...entry };
  }

  updateRequirement(buildId, requirementId, updates) {
    const build = this.#data.builds.find((b) => b.id === buildId);
    if (!build) return null;
    const req = (build.requirements || []).find((r) => r.id === requirementId);
    if (!req) return null;
    Object.assign(req, updates);
    build.updated_at = this.#now();
    this.#persistToServer().catch(() => {});
    return { ...req };
  }

  deleteRequirement(buildId, requirementId) {
    const build = this.#data.builds.find((b) => b.id === buildId);
    if (!build) return false;
    const before = (build.requirements || []).length;
    build.requirements = (build.requirements || []).filter((r) => r.id !== requirementId);
    if (build.requirements.length !== before) {
      build.updated_at = this.#now();
      this.#persistToServer().catch(() => {});
      return true;
    }
    return false;
  }

  getDashboardSummary() {
    const summary = [];
    for (const build of this.#data.builds) {
      if (build.acquired) {
        const unacquiredReqs = (build.requirements || []).filter((r) => !r.acquired);
        if (unacquiredReqs.length === 0) continue;
        summary.push({
          id: build.id,
          name: build.name,
          acquired: true,
          unacquired_reqs: unacquiredReqs.map((r) => ({ requirement_id: r.id, name: r.name }))
        });
      } else {
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
