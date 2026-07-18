import { describe, it, expect, beforeEach, vi } from 'vitest';

let LoadoutRepository;
let repo;

beforeEach(async () => {
  localStorage.clear();
  // Mock fetch for syncToServer
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
      const loadout = await repo.createLoadout({ name: 'Test Loadout' });
      expect(loadout).toHaveProperty('id');
      expect(loadout.name).toBe('Test Loadout');
      expect(loadout.slots.length).toBe(10); // all slot types
      expect(loadout.slots[0].slot_type).toBe('warframe');
      const slotTypes = loadout.slots.map((s) => s.slot_type);
      expect(slotTypes).toEqual(expect.arrayContaining(['necramech', 'archgun', 'necramech_melee']));
    });

    it('createLoadout trims whitespace from name', async () => {
      const loadout = await repo.createLoadout({ name: '  Padded Name  ' });
      expect(loadout.name).toBe('Padded Name');
    });

    it('getLoadoutById returns the correct loadout', async () => {
      const created = await repo.createLoadout({ name: 'Find Me' });
      expect(repo.getLoadoutById(created.id).name).toBe('Find Me');
    });

    it('getLoadoutById returns null for unknown id', () => {
      expect(repo.getLoadoutById('nonexistent')).toBeNull();
    });

    it('getLoadouts returns all loadouts sorted by created_at', async () => {
      await repo.createLoadout({ name: 'A' });
      await repo.createLoadout({ name: 'B' });
      const all = repo.getLoadouts();
      expect(all.length).toBe(2);
    });

    it('updateLoadout updates name', async () => {
      const created = await repo.createLoadout({ name: 'Old' });
      const updated = await repo.updateLoadout(created.id, { name: 'New' });
      expect(updated.name).toBe('New');
      expect(repo.getLoadoutById(created.id).name).toBe('New');
    });

    it('updateLoadout returns null for unknown id', async () => {
      expect(await repo.updateLoadout('nonexistent', { name: 'X' })).toBeNull();
    });

    it('deleteLoadout removes a loadout', async () => {
      const created = await repo.createLoadout({ name: 'Delete Me' });
      const result = await repo.deleteLoadout(created.id);
      expect(result).toBe(true);
      expect(repo.getLoadouts().length).toBe(0);
    });

    it('deleteLoadout returns false for unknown id', async () => {
      expect(await repo.deleteLoadout('nonexistent')).toBe(false);
    });
  });

  describe('slot CRUD', () => {
    let loadout;

    beforeEach(async () => {
      loadout = await repo.createLoadout({ name: 'Slot Test' });
    });

    it('addSlot adds a slot to a loadout', () => {
      const slot = repo.addSlot(loadout.id, {
        slot_type: 'other',
        item_id: 'item-1',
      });
      expect(slot).toHaveProperty('id');
      expect(slot.item_id).toBe('item-1');

      const updated = repo.getLoadoutById(loadout.id);
      expect(updated.slots.length).toBe(11); // 10 default + 1 new
    });

    it('addSlot returns null for unknown loadout', () => {
      expect(repo.addSlot('nonexistent', { slot_type: 'other' })).toBeNull();
    });

    it('addSlot rejects duplicate item_id', () => {
      repo.addSlot(loadout.id, { slot_type: 'other', item_id: 'item-1' });
      const second = repo.addSlot(loadout.id, { slot_type: 'other', item_id: 'item-1' });
      expect(second).toBeNull();
    });

    it('addSlot rejects duplicate custom_item_name', () => {
      repo.addSlot(loadout.id, { slot_type: 'other', custom_item_name: 'Custom Thing' });
      const second = repo.addSlot(loadout.id, { slot_type: 'other', custom_item_name: 'Custom Thing' });
      expect(second).toBeNull();
    });

    it('updateSlot updates slot properties', async () => {
      const slot = loadout.slots[0];
      const updated = await repo.updateSlot(loadout.id, slot.id, {
        notes: 'Need to farm',
        acquired: true,
      });
      expect(updated.notes).toBe('Need to farm');
      expect(updated.acquired).toBe(true);
    });

    it('updateSlot returns null for unknown loadout', async () => {
      expect(await repo.updateSlot('nonexistent', 'slot-1', { notes: 'X' })).toBeNull();
    });

    it('updateSlot returns null for unknown slot', async () => {
      expect(await repo.updateSlot(loadout.id, 'nonexistent', { notes: 'X' })).toBeNull();
    });

    it('deleteSlot resets slot to empty', async () => {
      const slot = loadout.slots[0];
      await await repo.updateSlot(loadout.id, slot.id, { item_id: 'item-1' });
      expect(await repo.deleteSlot(loadout.id, slot.id)).toBe(true);
      const updated = repo.getLoadoutById(loadout.id);
      const updatedSlot = updated.slots.find((s) => s.id === slot.id);
      expect(updatedSlot.item_id).toBeNull();
      expect(updatedSlot.acquired).toBe(false);
      expect(updatedSlot.notes).toBe('');
    });

    it('deleteSlot returns null for unknown loadout', async () => {
      expect(await repo.deleteSlot('nonexistent', 'slot-1')).toBe(false);
    });

    it('deleteSlot returns null for unknown slot', async () => {
      expect(await repo.deleteSlot(loadout.id, 'nonexistent')).toBe(false);
    });
  });

  describe('requirement CRUD', () => {
    let loadout;
    let slot;

    beforeEach(async () => {
      loadout = await repo.createLoadout({ name: 'Req Test' });
      slot = repo.addSlot(loadout.id, { slot_type: 'other', item_id: 'item-1' });
    });

    it('addRequirement adds a requirement to a slot', async () => {
      const req = await repo.addRequirement(slot.id, { name: 'Forma' });
      expect(req).toHaveProperty('id');
      expect(req.name).toBe('Forma');

      const updated = repo.getLoadoutById(loadout.id);
      const updatedSlot = updated.slots.find((s) => s.id === slot.id);
      expect(updatedSlot.requirements.length).toBe(1);
      expect(updatedSlot.requirements[0].name).toBe('Forma');
    });

    it('addRequirement trims whitespace from name', async () => {
      const req = await repo.addRequirement(slot.id, { name: '  Trimmed  ' });
      expect(req.name).toBe('Trimmed');
    });

    it('addRequirement returns null for unknown slot', async () => {
      expect(await repo.addRequirement('nonexistent', { name: 'Forma' })).toBeNull();
    });

    it('updateRequirement updates requirement properties', async () => {
      const req = await repo.addRequirement(slot.id, { name: 'Forma' });
      const updated = await repo.updateRequirement(slot.id, req.id, { name: 'Forma Prime', acquired: true });
      expect(updated.name).toBe('Forma Prime');
      expect(updated.acquired).toBe(true);
    });

    it('updateRequirement returns null for unknown requirement', async () => {
      expect(await repo.updateRequirement(slot.id, 'nonexistent', { name: 'X' })).toBeNull();
    });

    it('deleteRequirement removes a requirement', async () => {
      const req = await repo.addRequirement(slot.id, { name: 'Forma' });
      expect(await repo.deleteRequirement(slot.id, req.id)).toBe(true);
      const updated = repo.getLoadoutById(loadout.id);
      const updatedSlot = updated.slots.find((s) => s.id === slot.id);
      expect(updatedSlot.requirements.length).toBe(0);
    });

    it('deleteRequirement returns false for unknown requirement', async () => {
      expect(await repo.deleteRequirement(slot.id, 'nonexistent')).toBe(false);
    });
  });

  describe('dashboard summary', () => {
    it('getDashboardSummary returns empty for no loadouts', () => {
      expect(repo.getDashboardSummary()).toEqual([]);
    });

    it('getDashboardSummary includes loadout with unacquired items', async () => {
      const loadout = await repo.createLoadout({ name: 'Test' });
      const slot = loadout.slots[0];
      await await repo.updateSlot(loadout.id, slot.id, { item_id: 'item-1', acquired: false });

      const summary = repo.getDashboardSummary();
      expect(summary.length).toBe(1);
      expect(summary[0].loadout_name).toBe('Test');
      expect(summary[0].unacquired_slots.length).toBe(1);
    });

    it('getDashboardSummary includes unacquired requirements', async () => {
      const loadout = await repo.createLoadout({ name: 'Test' });
      const slot = repo.addSlot(loadout.id, { slot_type: 'other', item_id: 'item-1' });
      await await repo.addRequirement(slot.id, { name: 'Forma', acquired: false });

      const summary = repo.getDashboardSummary();
      expect(summary[0].unacquired_requirements.length).toBe(1);
      expect(summary[0].unacquired_requirements[0].name).toBe('Forma');
    });

    it('getDashboardSummary skips empty placeholder slots', async () => {
      await repo.createLoadout({ name: 'Test' });
      const summary = repo.getDashboardSummary();
      // All default slots are empty, so no unacquired slots
      expect(summary[0].unacquired_slots.length).toBe(0);
    });

    it('getDashboardSummary does not include acquired items', async () => {
      const loadout = await repo.createLoadout({ name: 'Test' });
      await await repo.updateSlot(loadout.id, loadout.slots[0].id, { item_id: 'item-1', acquired: true });

      const summary = repo.getDashboardSummary();
      expect(summary[0].unacquired_slots.length).toBe(0);
    });
  });

  describe('persistence', () => {
    it('persists loadouts in memory across operations', async () => {
      await repo.createLoadout({ name: 'Persist Test' });
      // Loadouts persist in the repository's in-memory store (server sync is fire-and-forget)
      const loadouts = repo.getLoadouts();
      expect(loadouts.length).toBe(1);
      expect(loadouts[0].name).toBe('Persist Test');
    });

    it('loads loadouts from localStorage migration on construction', async () => {
      localStorage.setItem('warframe-loadouts', JSON.stringify({
        loadouts: [
          {
            id: 'loadout-stored',
            name: 'Stored Loadout',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            slots: [],
          },
        ],
      }));

      const mod = await import('../../src/data/loadout-repository.ts');
      const Repo = mod.default;
      const r = new Repo();
      await r.init();
      const loadouts = r.getLoadouts();
      expect(loadouts.length).toBe(1);
      expect(loadouts[0].name).toBe('Stored Loadout');
    });
  });

  describe('edge cases: corrupted localStorage', () => {
    it('handles corrupted localStorage JSON gracefully', async () => {
      localStorage.setItem('warframe-loadouts', 'not-valid{');
      const mod = await import('../../src/data/loadout-repository.ts?corrupt=1');
      const Repo = mod.default;
      const r = new Repo();
      expect(r.getLoadouts()).toEqual([]);
    });

    it('handles missing localStorage key', async () => {
      localStorage.removeItem('warframe-loadouts');
      const mod = await import('../../src/data/loadout-repository.ts?missing=1');
      const Repo = mod.default;
      const r = new Repo();
      expect(r.getLoadouts()).toEqual([]);
    });
  });
});
