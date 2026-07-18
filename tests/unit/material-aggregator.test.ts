import { describe, it, expect } from 'vitest';
import { aggregateTrackedMaterials } from '../../src/data/material-aggregator.ts';

const mockItems = [
  { id: 'item-1', name: 'Excalibur', item_type: 'warframe', mastery_rank_required: 0, is_user_tracked: true },
  { id: 'item-2', name: 'Mesa', item_type: 'warframe', mastery_rank_required: 4, is_user_tracked: true },
];

const mockMaterials = {
  'item-1': [
    { material_name: 'Alloy Plate', quantity_required: 1200, craftable_item_id: 'item-1' },
  ],
};

const mockInventory = {};

describe('aggregateTrackedMaterials', () => {
  it('includes loadoutId, slot, and type on loadout requirement entries', async () => {
    const result = await aggregateTrackedMaterials(
      mockItems,
      mockInventory,
      (id) => Promise.resolve(mockMaterials[id] || []),
      [
        { name: 'Polymer Bundle', loadout: 'Excalibur Prime', loadoutId: 'loadout-1', slot: 'primary' },
        { name: 'Polymer Bundle', loadout: 'Excalibur Prime', loadoutId: 'loadout-1', slot: 'secondary' },
      ]
    );

    const polymer = result.find((m) => m.name === 'Polymer Bundle');
    expect(polymer).toBeDefined();
    expect(polymer.items).toHaveLength(2);

    // Each entry should have a stable id, loadoutId, slot, and type
    for (const item of polymer.items) {
      expect(item.id).toBe(`${item.loadoutId}-${item.slot}`);
      expect(item.loadoutId).toBe('loadout-1');
      expect(['primary', 'secondary']).toContain(item.slot);
      expect(item.type).toBe('loadout');
    }

    // Keys should be unique (no duplicates)
    const keys = polymer.items.map((i) => i.id);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not add type/loadoutId to tracked-item entries', async () => {
    const result = await aggregateTrackedMaterials(
      mockItems,
      mockInventory,
      (id) => Promise.resolve(mockMaterials[id] || []),
      []
    );

    const alloyPlate = result.find((m) => m.name === 'Alloy Plate');
    expect(alloyPlate).toBeDefined();
    expect(alloyPlate.items).toHaveLength(1);
    expect(alloyPlate.items[0].id).toBe('item-1');
    expect(alloyPlate.items[0].type).toBeUndefined();
    expect(alloyPlate.items[0].loadoutId).toBeUndefined();
  });
});
