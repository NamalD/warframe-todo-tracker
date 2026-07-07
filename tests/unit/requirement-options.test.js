import { describe, it, expect } from 'vitest';
import { getOptionsForSlot, getAllOptionNames } from '../../src/data/requirement-options.js';

describe('requirement-options', () => {
  describe('getOptionsForSlot', () => {
    it('returns warframe options for warframe slot_type', () => {
      const options = getOptionsForSlot('warframe');
      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThan(0);
      expect(options.find((o) => o.name === 'Orokin Reactor')).toBeTruthy();
      expect(options.find((o) => o.name === 'Forma')).toBeTruthy();
      expect(options.find((o) => o.name === 'Exilus Adapter')).toBeTruthy();
    });

    it('returns primary options for primary slot_type', () => {
      const options = getOptionsForSlot('primary');
      expect(options.find((o) => o.name === 'Orokin Catalyst')).toBeTruthy();
      expect(options.find((o) => o.name === 'Riven Mod')).toBeTruthy();
    });

    it('returns secondary options for secondary slot_type', () => {
      const options = getOptionsForSlot('secondary');
      expect(options.find((o) => o.name === 'Orokin Catalyst')).toBeTruthy();
      expect(options.find((o) => o.name === 'Riven Mod')).toBeTruthy();
    });

    it('returns melee options for melee slot_type', () => {
      const options = getOptionsForSlot('melee');
      expect(options.find((o) => o.name === 'Orokin Catalyst')).toBeTruthy();
      expect(options.find((o) => o.name === 'Riven Mod')).toBeTruthy();
    });

    it('returns companion options for companion slot_type', () => {
      const options = getOptionsForSlot('companion');
      expect(options.find((o) => o.name === 'Orokin Reactor')).toBeTruthy();
    });

    it('returns archwing options for archwing slot_type', () => {
      const options = getOptionsForSlot('archwing');
      expect(options.find((o) => o.name === 'Orokin Reactor')).toBeTruthy();
    });

    it('falls back to "other" options for unknown slot_type', () => {
      const options = getOptionsForSlot('unknown-type');
      expect(options.length).toBeGreaterThan(0);
      // "other" has Forma, Orokin Catalyst, Orokin Reactor
      expect(options.find((o) => o.name === 'Forma')).toBeTruthy();
    });

    it('each option has a name property', () => {
      const options = getOptionsForSlot('warframe');
      for (const opt of options) {
        expect(opt).toHaveProperty('name');
        expect(typeof opt.name).toBe('string');
        expect(opt.name.length).toBeGreaterThan(0);
      }
    });

    it('some options have wiki_url', () => {
      const options = getOptionsForSlot('warframe');
      const withUrl = options.filter((o) => o.wiki_url);
      expect(withUrl.length).toBeGreaterThan(0);
      for (const opt of withUrl) {
        expect(opt.wiki_url).toMatch(/^https?:\/\//);
      }
    });

    it('returns a new array each call (not shared reference)', () => {
      const first = getOptionsForSlot('warframe');
      const second = getOptionsForSlot('warframe');
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
    });
  });

  describe('getAllOptionNames', () => {
    it('returns an array of unique option names', () => {
      const names = getAllOptionNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
      expect(names.includes('Forma')).toBe(true);
      expect(names.includes('Orokin Reactor')).toBe(true);
      expect(names.includes('Orokin Catalyst')).toBe(true);
    });

    it('returns unique names (no duplicates)', () => {
      const names = getAllOptionNames();
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });
  });
});
