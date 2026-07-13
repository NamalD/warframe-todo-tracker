import { describe, it, expect } from 'vitest';
import { NECRAMECHS, ARCHGUNS, NECRAMECH_MELEES, getNecramechMeleesFor, formatSlotType } from '../../src/data/necramech-options.ts';

describe('necramech-options', () => {
  it('lists the known necramechs', () => {
    expect(NECRAMECHS).toEqual(expect.arrayContaining(['Bonewidow', 'Voidrig']));
  });

  it('lists archguns including Mausolon', () => {
    expect(ARCHGUNS).toEqual(expect.arrayContaining(['Mausolon']));
    expect(new Set(ARCHGUNS).size).toBe(ARCHGUNS.length); // no duplicates
  });

  describe('getNecramechMeleesFor', () => {
    it('returns only Ironbridge for Bonewidow', () => {
      expect(getNecramechMeleesFor('Bonewidow')).toEqual(['Ironbridge']);
    });

    it('returns only Cocytus for Voidrig', () => {
      expect(getNecramechMeleesFor('Voidrig')).toEqual(['Cocytus']);
    });

    it('returns the full list for an unknown/unset mech', () => {
      expect(getNecramechMeleesFor(null)).toEqual(NECRAMECH_MELEES);
      expect(getNecramechMeleesFor(undefined)).toEqual(NECRAMECH_MELEES);
      expect(getNecramechMeleesFor('Some Custom Mech')).toEqual(NECRAMECH_MELEES);
    });
  });

  describe('formatSlotType', () => {
    it('adds a space for necramech_melee', () => {
      expect(formatSlotType('necramech_melee')).toBe('necramech melee');
    });

    it('passes through already-readable slot types unchanged', () => {
      expect(formatSlotType('necramech')).toBe('necramech');
      expect(formatSlotType('archgun')).toBe('archgun');
      expect(formatSlotType('warframe')).toBe('warframe');
    });
  });
});
