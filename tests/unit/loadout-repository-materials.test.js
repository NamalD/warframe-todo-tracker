import { describe, it, expect, beforeEach, vi } from 'vitest';

let LoadoutRepository;
let repo;

beforeEach(async () => {
  localStorage.clear();
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
      const loadout = repo.createLoadout({ name: 'Test' });
      expect(loadout).toHaveProperty('id');
      expect(loadout.name).toBe('Test');
      expect(loadout.slots.length).toBe(7);
    });
    it('getLoadoutById returns the correct loadout', () => {
      const created = repo.createLoadout({ name: 'Find Me' });
      expect(repo.getLoadoutById(created.id).name).toBe('Find Me');
    });
    it('getLoadoutById returns null for unknown id', () => {
      expect(repo.getLoadoutById('nonexistent')).toBeNull();
    });
    it('deleteLoadout removes a loadout', () => {
      const created = repo.createLoadout({ name: 'Delete Me' });
      expect(repo.deleteLoadout(created.id)).toBe(true);
      expect(repo.getLoadouts().length).toBe(0);
    });
  });

  describe('material CRUD', () => {
    let loadout, slot, req;
    beforeEach(() => {
      loadout = repo.createLoadout({ name: 'Mat Test' });
      slot = repo.addSlot(loadout.id, { slot_type: 'other', item_id: 'item-1' });
      req = repo.addRequirement(slot.id, { name: 'Incarnon', item_id: 'item-w' });
    });
    it('addRequirement accepts item_id and materials', () => {
      const r = repo.addRequirement(slot.id, {
        name: 'New', item_id: 'item-x',
        materials: [{ name: 'Mat1', quantity_needed: 5 }]
      });
      expect(r.item_id).toBe('item-x');
      expect(r.materials.length).toBe(1);
    });
    it('addRequirement defaults item_id and materials', () => {
      const r = repo.addRequirement(slot.id, { name: 'Plain' });
      expect(r.item_id).toBeNull();
      expect(r.materials).toEqual([]);
    });
    it('addMaterial adds a material to a requirement', () => {
      const mat = repo.addMaterial(req.id, { name: 'Pathos Clamps', quantity_needed: 150 });
      expect(mat).toHaveProperty('id');
      expect(mat.name).toBe('Pathos Clamps');
      expect(mat.quantity_needed).toBe(150);
      expect(mat.quantity_owned).toBe(0);
    });
    it('addMaterial returns null for unknown requirementId', () => {
      expect(repo.addMaterial('nonexistent', { name: 'Test' })).toBeNull();
    });
    it('addMaterial triggers auto-recalc', () => {
      repo.addMaterial(req.id, { name: 'A', quantity_needed: 150 });
      repo.addMaterial(req.id, { name: 'B', quantity_needed: 2 });
      const updated = repo.getLoadoutById(loadout.id).slots
        .find((s) => s.id === slot.id).requirements.find((r) => r.id === req.id);
      expect(updated.acquired).toBe(false);
      expect(updated.materials.length).toBe(2);
    });
    it('updateMaterial updates quantity and recalculates', () => {
      const mat = repo.addMaterial(req.id, { name: 'Pathos', quantity_needed: 150 });
      repo.updateMaterial(req.id, mat.id, { quantity_owned: 150 });
      const check = repo.getLoadoutById(loadout.id).slots
        .find((s) => s.id === slot.id).requirements.find((r) => r.id === req.id);
      expect(check.materials.find((m) => m.id === mat.id).acquired).toBe(true);
    });
    it('updateMaterial returns null for unknown material', () => {
      expect(repo.updateMaterial(req.id, 'nonexistent', { quantity_owned: 10 })).toBeNull();
    });
    it('deleteMaterial removes a material and recalculates', () => {
      const m1 = repo.addMaterial(req.id, { name: 'A', quantity_needed: 150 });
      repo.addMaterial(req.id, { name: 'B', quantity_needed: 2, quantity_owned: 2 });
      expect(repo.deleteMaterial(req.id, m1.id)).toBe(true);
      const check = repo.getLoadoutById(loadout.id).slots
        .find((s) => s.id === slot.id).requirements.find((r) => r.id === req.id);
      expect(check.materials.length).toBe(1);
      expect(check.acquired).toBe(true);
    });
    it('deleteMaterial returns false for unknown', () => {
      expect(repo.deleteMaterial(req.id, 'nonexistent')).toBe(false);
    });
  });

  describe('dashboard summary', () => {
    it('getDashboardSummary returns empty for no loadouts', () => {
      expect(repo.getDashboardSummary()).toEqual([]);
    });
    it('getDashboardSummary includes unacquired materials', () => {
      const l = repo.createLoadout({ name: 'Test' });
      const s = repo.addSlot(l.id, { slot_type: 'warframe', item_id: 'item-1' });
      const r = repo.addRequirement(s.id, { name: 'Incarnon', item_id: 'item-w' });
      repo.addMaterial(r.id, { name: 'Pathos', quantity_needed: 150, quantity_owned: 42 });
      const summary = repo.getDashboardSummary();
      expect(summary[0].unacquired_requirements.length).toBe(1);
      expect(summary[0].unacquired_requirements[0].material_name).toBe('Pathos');
      expect(summary[0].unacquired_requirements[0].quantity_owned).toBe(42);
      expect(summary[0].unacquired_requirements[0].quantity_needed).toBe(150);
    });
    it('getDashboardSummary excludes acquired materials', () => {
      const l = repo.createLoadout({ name: 'Test' });
      const s = repo.addSlot(l.id, { slot_type: 'warframe', item_id: 'item-1' });
      const r = repo.addRequirement(s.id, { name: 'Incarnon', item_id: 'item-w' });
      repo.addMaterial(r.id, { name: 'Done', quantity_needed: 150, quantity_owned: 150 });
      repo.addMaterial(r.id, { name: 'Pending', quantity_needed: 2, quantity_owned: 0 });
      const summary = repo.getDashboardSummary();
      expect(summary[0].unacquired_requirements.length).toBe(1);
      expect(summary[0].unacquired_requirements[0].material_name).toBe('Pending');
    });
    it('getDashboardSummary includes legacy requirements', () => {
      const l = repo.createLoadout({ name: 'Test' });
      const s = repo.addSlot(l.id, { slot_type: 'other', item_id: 'item-1' });
      repo.addRequirement(s.id, { name: 'Forma', acquired: false });
      const summary = repo.getDashboardSummary();
      expect(summary[0].unacquired_requirements.length).toBe(1);
      expect(summary[0].unacquired_requirements[0].name).toBe('Forma');
    });
  });
});
