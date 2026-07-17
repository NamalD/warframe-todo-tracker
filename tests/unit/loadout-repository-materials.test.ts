import { describe, it, expect, beforeEach, vi } from 'vitest';

let LoadoutRepository;
let repo;

beforeEach(async () => {
  localStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
  const mod = await import('../../src/data/loadout-repository.ts');
  LoadoutRepository = mod.default;
  repo = new LoadoutRepository();
});

describe('LoadoutRepository', () => {
  describe('loadout CRUD', () => {
    it('getLoadouts returns empty array initially', () => {
      expect(repo.getLoadouts()).toEqual([]);
    });
    it('createLoadout creates a new loadout with slots', async () => {
      const loadout = await repo.createLoadout({ name: 'Test' });
      expect(loadout).toHaveProperty('id');
      expect(loadout.name).toBe('Test');
      expect(loadout.slots.length).toBe(10);
    });
    it('getLoadoutById returns the correct loadout', async () => {
      const created = await repo.createLoadout({ name: 'Find Me' });
      expect(repo.getLoadoutById(created.id).name).toBe('Find Me');
    });
    it('getLoadoutById returns null for unknown id', () => {
      expect(repo.getLoadoutById('nonexistent')).toBeNull();
    });
    it('deleteLoadout removes a loadout', async () => {
      const created = await repo.createLoadout({ name: 'Delete Me' });
      expect(await repo.deleteLoadout(created.id)).toBe(true);
      expect(repo.getLoadouts().length).toBe(0);
    });
  });

  describe('dashboard summary', () => {
    it('getDashboardSummary returns empty for no loadouts', () => {
      expect(repo.getDashboardSummary()).toEqual([]);
    });
    it('getDashboardSummary includes legacy requirements', async () => {
      const l = await repo.createLoadout({ name: 'Test' });
      const s = repo.addSlot(l.id, { slot_type: 'other', item_id: 'item-1' });
      repo.addRequirement(s.id, { name: 'Forma', acquired: false });
      const summary = repo.getDashboardSummary();
      expect(summary[0].unacquired_requirements.length).toBe(1);
      expect(summary[0].unacquired_requirements[0].name).toBe('Forma');
    });
  });
});
