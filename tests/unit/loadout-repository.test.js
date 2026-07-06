import { describe, it, expect, beforeEach, vi } from 'vitest';

let LoadoutRepository;
let repo;

beforeEach(async () => {
  localStorage.clear();
  // Mock fetch for syncToServer
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
  const mod = await import('../../src/data/loadout-repository.js');
  LoadoutRepository = mod.default;
  repo = new LoadoutRepository();
});

describe('LoadoutRepository', () => {
  describe('loadout CRUD', () => {
    it('getLoadouts returns empty array initially', () => {
      expect(repo.getLoadouts()).toEqual([]);
    });

    it('createLoadout creates a new loadout with slots', () => {
      const loadout = repo.createLoadout({ name: 'Test Loadout' });
      expect(loadout).toHaveProperty('id');
      expect(loadout.name).toBe('Test Loadout');
      expect(loadout.slots.length).toBe(7); // all slot types
      expect(loadout.slots[0].slot_type).toBe('warframe');
    });

    it('createLoadout trims whitespace from name', () => {
      const loadout = repo.createLoadout({ name: '  Padded Name  ' });
      expect(loadout.name).toBe('Padded Name');
    });

    it('getLoadoutById returns the correct loadout', () => {
      const created = repo.createLoadout({ name: 'Find Me' });
      const found = repo.getLoadoutById(created.id);
      expect(found).not.toBeNull();
      expect(found.name).toBe('Find Me');
    });

    it('getLoadoutById returns null for unknown id', () => {
      expect(repo.getLoadoutById('nonexistent')).toBeNull();
    });

    it('getLoadouts returns all loadouts', () => {
      repo.createLoadout({ name: 'A' });
      repo.createLoadout({ name: 'B' });
      expect(repo.getLoadouts().length).toBe(2);
    });

    it('updateLoadout updates name', () => {
      const created = repo.createLoadout({ name: 'Old' });
      const updated = repo.updateLoadout(created.id, { name: 'New' });
      expect(updated.name).toBe('New');
    });

    it('updateLoadout returns null for unknown id', () => {
      expect(repo.updateLoadout('nonexistent', { name: 'X' })).toBeNull();
    });

    it('deleteLoadout removes a loadout', () => {
      const created = repo.createLoadout({ name: 'Delete Me' });
      expect(repo.getLoadouts().length).toBe(1);
      const result = repo.deleteLoadout(created.id);
      expect(result).toBe(true);
      expect(repo.getLoadouts().length).toBe(0);
    });

    it('deleteLoadout returns false for unknown id', () => {
      expect(repo.deleteLoadout('nonexistent')).toBe(false);
    });
  });

  describe('slot CRUD', () => {
    let loadout;

    beforeEach(() => {
      loadout = repo.createLoadout({ name: 'Slot Test' });
    });

    it('addSlot adds a slot to a loadout', () => {
      const slot = repo.addSlot(loadout.id, {
        slot_type: 'other',
        item_id: 'item-1',
      });
      expect(slot).toHaveProperty('id');
      expect(slot.item_id).toBe('item-1');

      const updated = repo.getLoadoutById(loadout.id);
      expect(updated.slots.length).toBe(8); // 7 default + 1 new
    });

    it('addSlot returns null for unknown loadout', () => {
      expect(repo.addSlot('nonexistent', { slot_type: 'other' })).toBeNull();
    });

    it('addSlot rejects duplicate item_id', () => {
      repo.addSlot(loadout.id, { slot_type: 'other', item_id: 'item-1' });
      const result = repo.addSlot(loadout.id, { slot_type: 'other', item_id: 'item-1' });
      expect(result).toBeNull();
    });

    it('addSlot rejects duplicate custom_item_name', () => {
      repo.addSlot(loadout.id, { slot_type: 'other', custom_item_name: 'Custom' });
      const result = repo.addSlot(loadout.id, { slot_type: 'other', custom_item_name: 'Custom' });
      expect(result).toBeNull();
    });

    it('updateSlot updates slot properties', () => {
      const originalSlot = loadout.slots[0];
      const updated = repo.updateSlot(loadout.id, originalSlot.id, { acquired: true, notes: 'Test note' });
      expect(updated.acquired).toBe(true);
      expect(updated.notes).toBe('Test note');
    });

    it('updateSlot returns null for unknown loadout', () => {
      expect(repo.updateSlot('nonexistent', 'slot-1', { acquired: true })).toBeNull();
    });

    it('updateSlot returns null for unknown slot', () => {
      expect(repo.updateSlot(loadout.id, 'nonexistent', { acquired: true })).toBeNull();
    });

    it('deleteSlot resets slot to empty', () => {
      const slot = loadout.slots[0];
      // First populate the slot
      repo.updateSlot(loadout.id, slot.id, { item_id: 'item-1', notes: 'test' });
      const result = repo.deleteSlot(loadout.id, slot.id);
      expect(result).toBe(true);

      const updated = repo.getLoadoutById(loadout.id);
      const resetSlot = updated.slots.find((s) => s.id === slot.id);
      expect(resetSlot.item_id).toBeNull();
      expect(resetSlot.custom_item_name).toBeNull();
      expect(resetSlot.acquired).toBe(false);
      expect(resetSlot.notes).toBe('');
    });

    it('deleteSlot returns false for unknown loadout', () => {
      expect(repo.deleteSlot('nonexistent', 'slot-1')).toBe(false);
    });

    it('deleteSlot returns false for unknown slot', () => {
      expect(repo.deleteSlot(loadout.id, 'nonexistent')).toBe(false);
    });
  });

  describe('requirement CRUD', () => {
    let loadout;
    let slot;

    beforeEach(() => {
      loadout = repo.createLoadout({ name: 'Req Test' });
      slot = repo.addSlot(loadout.id, { slot_type: 'other', item_id: 'item-1' });
    });

    it('addRequirement adds a requirement to a slot', () => {
      const req = repo.addRequirement(slot.id, { name: 'Forma' });
      expect(req).toHaveProperty('id');
      expect(req.name).toBe('Forma');

      const updated = repo.getLoadoutById(loadout.id);
      const updatedSlot = updated.slots.find((s) => s.id === slot.id);
      expect(updatedSlot.requirements.length).toBe(1);
      expect(updatedSlot.requirements[0].name).toBe('Forma');
    });

    it('addRequirement trims whitespace from name', () => {
      const req = repo.addRequirement(slot.id, { name: '  Trimmed  ' });
      expect(req.name).toBe('Trimmed');
    });

    it('addRequirement returns null for unknown slot', () => {
      expect(repo.addRequirement('nonexistent', { name: 'X' })).toBeNull();
    });

    it('updateRequirement updates requirement properties', () => {
      const req = repo.addRequirement(slot.id, { name: 'Forma' });
      const updated = repo.updateRequirement(slot.id, req.id, { acquired: true, user_notes: 'Done' });
      expect(updated.acquired).toBe(true);
      expect(updated.user_notes).toBe('Done');
    });

    it('updateRequirement returns null for unknown slot', () => {
      expect(repo.updateRequirement('nonexistent', 'req-1', { acquired: true })).toBeNull();
    });

    it('updateRequirement returns null for unknown requirement', () => {
      expect(repo.updateRequirement(slot.id, 'nonexistent', { acquired: true })).toBeNull();
    });

    it('deleteRequirement removes a requirement', () => {
      const req = repo.addRequirement(slot.id, { name: 'Forma' });
      const result = repo.deleteRequirement(slot.id, req.id);
      expect(result).toBe(true);

      const updated = repo.getLoadoutById(loadout.id);
      const updatedSlot = updated.slots.find((s) => s.id === slot.id);
      expect(updatedSlot.requirements.length).toBe(0);
    });

    it('deleteRequirement returns false for unknown slot', () => {
      expect(repo.deleteRequirement('nonexistent', 'req-1')).toBe(false);
    });

    it('deleteRequirement returns false for unknown requirement', () => {
      expect(repo.deleteRequirement(slot.id, 'nonexistent')).toBe(false);
    });
  });

  describe('dashboard summary', () => {
    it('getDashboardSummary returns empty for no loadouts', () => {
      expect(repo.getDashboardSummary()).toEqual([]);
    });

    it('getDashboardSummary includes loadout with unacquired items', () => {
      const loadout = repo.createLoadout({ name: 'Test' });
      const slot = loadout.slots[0];
      repo.updateSlot(loadout.id, slot.id, { item_id: 'item-1', acquired: false });

      const summary = repo.getDashboardSummary();
      expect(summary.length).toBe(1);
      expect(summary[0].loadout_name).toBe('Test');
      expect(summary[0].unacquired_slots.length).toBe(1);
    });

    it('getDashboardSummary includes unacquired requirements', () => {
      const loadout = repo.createLoadout({ name: 'Test' });
      const slot = repo.addSlot(loadout.id, { slot_type: 'other', item_id: 'item-1' });
      repo.addRequirement(slot.id, { name: 'Forma', acquired: false });

      const summary = repo.getDashboardSummary();
      expect(summary[0].unacquired_requirements.length).toBe(1);
      expect(summary[0].unacquired_requirements[0].name).toBe('Forma');
    });

    it('getDashboardSummary skips empty placeholder slots', () => {
      repo.createLoadout({ name: 'Test' });
      const summary = repo.getDashboardSummary();
      // All default slots are empty, so no unacquired slots
      expect(summary[0].unacquired_slots.length).toBe(0);
    });

    it('getDashboardSummary does not include acquired items', () => {
      const loadout = repo.createLoadout({ name: 'Test' });
      repo.updateSlot(loadout.id, loadout.slots[0].id, { item_id: 'item-1', acquired: true });

      const summary = repo.getDashboardSummary();
      expect(summary[0].unacquired_slots.length).toBe(0);
    });
  });

  describe('persistence', () => {
    it('persists loadouts to localStorage', () => {
      repo.createLoadout({ name: 'Persist Test' });
      const stored = localStorage.getItem('warframe-loadouts');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored);
      expect(parsed.loadouts.length).toBe(1);
      expect(parsed.loadouts[0].name).toBe('Persist Test');
    });

    it('loads loadouts from localStorage on construction', async () => {
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

      const mod = await import('../../src/data/loadout-repository.js');
      const Repo = mod.default;
      const r = new Repo();
      const loadouts = r.getLoadouts();
      expect(loadouts.length).toBe(1);
      expect(loadouts[0].name).toBe('Stored Loadout');
    });
  });

  describe('edge cases: corrupted localStorage', () => {
    it('handles corrupted localStorage JSON gracefully', async () => {
      localStorage.setItem('warframe-loadouts', 'not-valid{');
      const mod = await import('../../src/data/loadout-repository.js?corrupt=1');
      const Repo = mod.default;
      const r = new Repo();
      expect(r.getLoadouts()).toEqual([]);
    });

    it('handles missing localStorage key', async () => {
      localStorage.removeItem('warframe-loadouts');
      const mod = await import('../../src/data/loadout-repository.js?missing=1');
      const Repo = mod.default;
      const r = new Repo();
      expect(r.getLoadouts()).toEqual([]);
    });
  });
});
