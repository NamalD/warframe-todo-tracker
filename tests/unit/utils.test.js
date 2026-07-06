import { describe, it, expect } from 'vitest';
import { groupBy, isLoadoutComplete } from '../../src/utils.js';

describe('groupBy', () => {
  it('groups an array of objects by a given key', () => {
    const data = [
      { material_name: 'Alloy Plate', source: 'Ocean' },
      { material_name: 'Ferrite', source: 'Everest' },
      { material_name: 'Alloy Plate', source: 'Vesper' },
      { material_name: 'Ferrite', source: 'Montalvu' },
    ];
    const result = groupBy(data, 'material_name');
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['Alloy Plate']).toHaveLength(2);
    expect(result['Ferrite']).toHaveLength(2);
  });

  it('returns an empty object for an empty array', () => {
    const result = groupBy([], 'any_key');
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('handles a single item array', () => {
    const data = [{ name: 'Test', value: 1 }];
    const result = groupBy(data, 'name');
    expect(result['Test']).toHaveLength(1);
    expect(result['Test'][0].value).toBe(1);
  });

  it('handles missing keys gracefully (undefined key)', () => {
    const data = [
      { name: 'A' },
      { name: 'B' },
      { other: 'C' },
    ];
    const result = groupBy(data, 'name');
    expect(result['A']).toHaveLength(1);
    expect(result['B']).toHaveLength(1);
    expect(result['undefined']).toHaveLength(1);
  });

  it('groups numbers as keys', () => {
    const data = [
      { level: 1, name: 'a' },
      { level: 2, name: 'b' },
      { level: 1, name: 'c' },
    ];
    const result = groupBy(data, 'level');
    expect(result['1']).toHaveLength(2);
    expect(result['2']).toHaveLength(1);
  });
});

describe('isLoadoutComplete', () => {
  it('returns false for empty slots', () => {
    const loadout = { slots: [] };
    expect(isLoadoutComplete(loadout)).toBe(false);
  });

  it('returns false for null/undefined slots', () => {
    expect(isLoadoutComplete({})).toBe(false);
  });

  it('returns false when all populated slots are unacquired', () => {
    const loadout = {
      slots: [
        { item_id: 'item-1', custom_item_name: null, acquired: false },
        { item_id: 'item-2', custom_item_name: null, acquired: false },
      ],
    };
    expect(isLoadoutComplete(loadout)).toBe(false);
  });

  it('returns false when only some slots are acquired', () => {
    const loadout = {
      slots: [
        { item_id: 'item-1', custom_item_name: null, acquired: true },
        { item_id: 'item-2', custom_item_name: null, acquired: false },
      ],
    };
    expect(isLoadoutComplete(loadout)).toBe(false);
  });

  it('returns true when all populated slots are acquired', () => {
    const loadout = {
      slots: [
        { item_id: 'item-1', custom_item_name: null, acquired: true },
        { item_id: 'item-2', custom_item_name: null, acquired: true },
      ],
    };
    expect(isLoadoutComplete(loadout)).toBe(true);
  });

  it('ignores empty slots (no item_id or custom_item_name)', () => {
    const loadout = {
      slots: [
        { item_id: 'item-1', custom_item_name: null, acquired: true },
        { item_id: null, custom_item_name: null, acquired: false },
        { item_id: null, custom_item_name: null, acquired: false },
      ],
    };
    expect(isLoadoutComplete(loadout)).toBe(true);
  });

  it('considers custom_item_name slots as populated', () => {
    const loadout = {
      slots: [
        { item_id: null, custom_item_name: 'Custom Item', acquired: true },
      ],
    };
    expect(isLoadoutComplete(loadout)).toBe(true);
  });

  it('returns false for custom_item_name slots not acquired', () => {
    const loadout = {
      slots: [
        { item_id: null, custom_item_name: 'Custom Item', acquired: false },
      ],
    };
    expect(isLoadoutComplete(loadout)).toBe(false);
  });
});
