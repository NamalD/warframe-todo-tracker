import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const WFCD_CACHE_PATH = resolve(__dirname, '../../public/data/wfcd-cache.json');

describe('Incarnon Genesis install costs (prebuild output)', () => {
  const hasCache = existsSync(WFCD_CACHE_PATH);

  it('wfcd-cache.json exists', () => {
    expect(hasCache).toBe(true);
  });

  if (!hasCache) return;

  const data = JSON.parse(readFileSync(WFCD_CACHE_PATH, 'utf8'));

  it('every item has has_incarnon_genesis and track_incarnon_install booleans', () => {
    for (const item of data.items) {
      expect(typeof item.has_incarnon_genesis).toBe('boolean');
      expect(typeof item.track_incarnon_install).toBe('boolean');
    }
  });

  it('track_incarnon_install defaults to false for every item', () => {
    for (const item of data.items) {
      expect(item.track_incarnon_install).toBe(false);
    }
  });

  it('every material has an is_incarnon_install boolean', () => {
    for (const m of data.materials) {
      expect(typeof m.is_incarnon_install).toBe('boolean');
    }
  });

  it('has all 45 Incarnon Genesis weapons flagged', () => {
    const flagged = data.items.filter((i) => i.has_incarnon_genesis);
    expect(flagged.length).toBe(45);
  });

  it('every has_incarnon_genesis item has exactly 3 install materials, each quantity > 0', () => {
    const flagged = data.items.filter((i) => i.has_incarnon_genesis);
    for (const item of flagged) {
      const mats = data.materials.filter(
        (m) => m.craftable_item_id === item.id && m.is_incarnon_install
      );
      expect(mats, `${item.name} should have 3 install materials`).toHaveLength(3);
      for (const m of mats) {
        expect(m.quantity_required, `${item.name} / ${m.material_name}`).toBeGreaterThan(0);
      }
    }
  });

  it('Gorgon has Incarnon Genesis install materials matching the wiki', () => {
    const gorgon = data.items.find((i) => i.name === 'Gorgon');
    expect(gorgon).toBeTruthy();
    expect(gorgon.has_incarnon_genesis).toBe(true);

    const mats = data.materials.filter(
      (m) => m.craftable_item_id === gorgon.id && m.is_incarnon_install
    );
    const byName = Object.fromEntries(mats.map((m) => [m.material_name, m.quantity_required]));
    expect(byName).toEqual({
      'Pathos Clamp': 20,
      'Rune Marrow': 60,
      'Tasoma Extract': 60,
    });
  });

  it('Lex has Incarnon Genesis install materials despite having no blueprint', () => {
    const lex = data.items.find((i) => i.name === 'Lex');
    expect(lex).toBeTruthy();
    expect(lex.has_incarnon_genesis).toBe(true);

    const blueprintMats = data.materials.filter(
      (m) => m.craftable_item_id === lex.id && !m.is_incarnon_install
    );
    expect(blueprintMats.length).toBe(0);

    const incarnonMats = data.materials.filter(
      (m) => m.craftable_item_id === lex.id && m.is_incarnon_install
    );
    const byName = Object.fromEntries(incarnonMats.map((m) => [m.material_name, m.quantity_required]));
    expect(byName).toEqual({
      'Pathos Clamp': 20,
      'Yao Shrub': 70,
      'Saggen Pearl': 150,
    });
  });

  it('items without Incarnon Genesis data have no is_incarnon_install materials', () => {
    const excalibur = data.items.find((i) => i.name === 'Excalibur');
    expect(excalibur).toBeTruthy();
    expect(excalibur.has_incarnon_genesis).toBe(false);

    const mats = data.materials.filter((m) => m.craftable_item_id === excalibur.id);
    expect(mats.every((m) => m.is_incarnon_install === false)).toBe(true);
  });
});
