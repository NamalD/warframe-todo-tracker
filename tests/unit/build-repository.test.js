import { describe, it, expect, beforeEach, vi } from 'vitest';

let BuildRepository;
let repo;

beforeEach(async () => {
  localStorage.clear();
  // Mock fetch for syncToServer
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
  const mod = await import('../../src/data/build-repository.js');
  BuildRepository = mod.default;
  repo = new BuildRepository();
});

describe('BuildRepository', () => {
  describe('build CRUD', () => {
    it('getBuilds returns empty array initially', () => {
      expect(repo.getBuilds()).toEqual([]);
    });

    it('createBuild creates a new build', () => {
      const build = repo.createBuild({ name: 'Dual Coda Toxacyst' });
      expect(build).toHaveProperty('id');
      expect(build.name).toBe('Dual Coda Toxacyst');
      expect(build.acquired).toBe(false);
      expect(build.requirements).toEqual([]);
    });

    it('createBuild trims whitespace from name', () => {
      const build = repo.createBuild({ name: '  Padded Name  ' });
      expect(build.name).toBe('Padded Name');
    });

    it('createBuild accepts optional item_id', () => {
      const build = repo.createBuild({ name: 'Braton', item_id: 'item-1' });
      expect(build.item_id).toBe('item-1');
    });

    it('createBuild accepts optional custom_item_name', () => {
      const build = repo.createBuild({ name: 'Custom Thing', custom_item_name: 'My Custom Weapon' });
      expect(build.custom_item_name).toBe('My Custom Weapon');
    });

    it('createBuild accepts optional wiki_url', () => {
      const build = repo.createBuild({ name: 'Test', wiki_url: 'https://wiki.example.com' });
      expect(build.wiki_url).toBe('https://wiki.example.com');
    });

    it('getBuildById returns the correct build', () => {
      const created = repo.createBuild({ name: 'Find Me' });
      const found = repo.getBuildById(created.id);
      expect(found).not.toBeNull();
      expect(found.name).toBe('Find Me');
    });

    it('getBuildById returns null for unknown id', () => {
      expect(repo.getBuildById('nonexistent')).toBeNull();
    });

    it('getBuilds returns all builds', () => {
      repo.createBuild({ name: 'A' });
      repo.createBuild({ name: 'B' });
      expect(repo.getBuilds().length).toBe(2);
    });

    it('updateBuild updates name and other fields', () => {
      const created = repo.createBuild({ name: 'Old' });
      const updated = repo.updateBuild(created.id, { name: 'New', acquired: true });
      expect(updated.name).toBe('New');
      expect(updated.acquired).toBe(true);
    });

    it('updateBuild returns null for unknown id', () => {
      expect(repo.updateBuild('nonexistent', { name: 'X' })).toBeNull();
    });

    it('deleteBuild removes a build', () => {
      const created = repo.createBuild({ name: 'Delete Me' });
      expect(repo.getBuilds().length).toBe(1);
      const result = repo.deleteBuild(created.id);
      expect(result).toBe(true);
      expect(repo.getBuilds().length).toBe(0);
    });

    it('deleteBuild returns false for unknown id', () => {
      expect(repo.deleteBuild('nonexistent')).toBe(false);
    });
  });

  describe('requirement CRUD', () => {
    let build;

    beforeEach(() => {
      build = repo.createBuild({ name: 'Req Test' });
    });

    it('addRequirement adds a requirement to a build', () => {
      const req = repo.addRequirement(build.id, { name: 'Forma' });
      expect(req).toHaveProperty('id');
      expect(req.name).toBe('Forma');
      expect(req.build_id).toBe(build.id);

      const updated = repo.getBuildById(build.id);
      expect(updated.requirements.length).toBe(1);
      expect(updated.requirements[0].name).toBe('Forma');
    });

    it('addRequirement trims whitespace from name', () => {
      const req = repo.addRequirement(build.id, { name: '  Trimmed  ' });
      expect(req.name).toBe('Trimmed');
    });

    it('addRequirement accepts optional wiki_url and user_notes', () => {
      const req = repo.addRequirement(build.id, {
        name: 'Orokin Cell',
        wiki_url: 'https://wiki.example.com/cell',
        user_notes: 'Farm in Ceres',
      });
      expect(req.wiki_url).toBe('https://wiki.example.com/cell');
      expect(req.user_notes).toBe('Farm in Ceres');
    });

    it('addRequirement returns null for unknown build', () => {
      expect(repo.addRequirement('nonexistent', { name: 'X' })).toBeNull();
    });

    it('updateRequirement updates requirement properties', () => {
      const req = repo.addRequirement(build.id, { name: 'Forma' });
      const updated = repo.updateRequirement(build.id, req.id, { acquired: true, user_notes: 'Done' });
      expect(updated.acquired).toBe(true);
      expect(updated.user_notes).toBe('Done');
    });

    it('updateRequirement returns null for unknown build', () => {
      expect(repo.updateRequirement('nonexistent', 'req-1', { acquired: true })).toBeNull();
    });

    it('updateRequirement returns null for unknown requirement', () => {
      expect(repo.updateRequirement(build.id, 'nonexistent', { acquired: true })).toBeNull();
    });

    it('deleteRequirement removes a requirement', () => {
      const req = repo.addRequirement(build.id, { name: 'Forma' });
      const result = repo.deleteRequirement(build.id, req.id);
      expect(result).toBe(true);

      const updated = repo.getBuildById(build.id);
      expect(updated.requirements.length).toBe(0);
    });

    it('deleteRequirement returns false for unknown build', () => {
      expect(repo.deleteRequirement('nonexistent', 'req-1')).toBe(false);
    });

    it('deleteRequirement returns false for unknown requirement', () => {
      expect(repo.deleteRequirement(build.id, 'nonexistent')).toBe(false);
    });
  });

  describe('dashboard summary', () => {
    it('getDashboardSummary returns empty for no builds', () => {
      expect(repo.getDashboardSummary()).toEqual([]);
    });

    it('getDashboardSummary includes unacquired builds', () => {
      repo.createBuild({ name: 'Unfinished Build', acquired: false });

      const summary = repo.getDashboardSummary();
      expect(summary.length).toBe(1);
      expect(summary[0].name).toBe('Unfinished Build');
      expect(summary[0].acquired).toBe(false);
    });

    it('getDashboardSummary does not include acquired builds', () => {
      repo.createBuild({ name: 'Done Build', acquired: true });

      const summary = repo.getDashboardSummary();
      expect(summary.length).toBe(0);
    });

    it('getDashboardSummary includes unacquired requirements', () => {
      const build = repo.createBuild({ name: 'With Requirements' });
      repo.addRequirement(build.id, { name: 'Forma', acquired: false });

      const summary = repo.getDashboardSummary();
      expect(summary.length).toBe(1);
      expect(summary[0].unacquired_reqs.length).toBe(1);
      expect(summary[0].unacquired_reqs[0].name).toBe('Forma');
    });

    it('getDashboardSummary excludes acquired requirements from unacquired count', () => {
      const build = repo.createBuild({ name: 'Partial' });
      repo.addRequirement(build.id, { name: 'Done Req', acquired: true });

      const summary = repo.getDashboardSummary();
      // Build itself is unacquired, so it appears; but no unacquired reqs
      expect(summary.length).toBe(1);
      expect(summary[0].unacquired_reqs.length).toBe(0);
    });

    it('getDashboardSummary shows builds with acquired item but unacquired requirements', () => {
      const build = repo.createBuild({ name: 'Acquired Item, Missing Reqs', acquired: true });
      repo.addRequirement(build.id, { name: 'Missing Mod', acquired: false });

      const summary = repo.getDashboardSummary();
      expect(summary.length).toBe(1);
      expect(summary[0].acquired).toBe(true);
      expect(summary[0].unacquired_reqs.length).toBe(1);
    });
  });

  describe('persistence', () => {
    it('persists builds to localStorage', () => {
      repo.createBuild({ name: 'Persist Test' });
      const stored = localStorage.getItem('warframe-builds');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored);
      expect(parsed.builds.length).toBe(1);
      expect(parsed.builds[0].name).toBe('Persist Test');
    });

    it('loads builds from localStorage on construction', async () => {
      localStorage.setItem('warframe-builds', JSON.stringify({
        builds: [
          {
            id: 'build-stored',
            name: 'Stored Build',
            item_id: null,
            custom_item_name: null,
            acquired: false,
            notes: '',
            wiki_url: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            requirements: [],
          },
        ],
      }));

      const mod = await import('../../src/data/build-repository.js?stored=1');
      const Repo = mod.default;
      const r = new Repo();
      const builds = r.getBuilds();
      expect(builds.length).toBe(1);
      expect(builds[0].name).toBe('Stored Build');
    });
  });

  describe('edge cases: corrupted localStorage', () => {
    it('handles corrupted localStorage JSON gracefully', async () => {
      localStorage.setItem('warframe-builds', 'not-valid{');
      const mod = await import('../../src/data/build-repository.js?corrupt=1');
      const Repo = mod.default;
      const r = new Repo();
      expect(r.getBuilds()).toEqual([]);
    });

    it('handles missing localStorage key', async () => {
      localStorage.removeItem('warframe-builds');
      const mod = await import('../../src/data/build-repository.js?missing=1');
      const Repo = mod.default;
      const r = new Repo();
      expect(r.getBuilds()).toEqual([]);
    });
  });
});
