import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const MODS_CACHE_PATH = resolve(__dirname, '../../public/data/mods-cache.json');
const WFCD_CACHE_PATH = resolve(__dirname, '../../public/data/wfcd-cache.json');

describe('mods-cache.json (prebuild output)', () => {
  const hasModsCache = existsSync(MODS_CACHE_PATH);

  it('exists after prebuild', () => {
    expect(hasModsCache).toBe(true);
  });

  if (!hasModsCache) return;

  let data;
  try {
    data = JSON.parse(readFileSync(MODS_CACHE_PATH, 'utf8'));
  } catch {
    it('is valid JSON', () => {
      expect(true).toBe(false);
    });
    return;
  }

  it('has version, schemaVersion, cachedAt, and mods keys', () => {
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('schemaVersion');
    expect(data).toHaveProperty('cachedAt');
    expect(data).toHaveProperty('mods');
  });

  it('version is a non-empty string', () => {
    expect(typeof data.version).toBe('string');
    expect(data.version.length).toBeGreaterThan(0);
  });

  it('cachedAt is a valid ISO date string', () => {
    expect(typeof data.cachedAt).toBe('string');
    const d = new Date(data.cachedAt);
    expect(d.toISOString()).toBe(data.cachedAt);
  });

  it('mods is an array with entries', () => {
    expect(Array.isArray(data.mods)).toBe(true);
    expect(data.mods.length).toBeGreaterThan(0);
  });

  it('each mod has all required fields', () => {
    const required = ['id', 'name', 'mod_type', 'polarity', 'rarity',
      'base_drain', 'fusion_limit', 'is_prime', 'is_augment', 'is_umbral',
      'compat_name', 'unique_name', 'wiki_url'];

    for (const mod of data.mods) {
      for (const field of required) {
        expect(mod).toHaveProperty(field);
      }
    }
  });

  it('each mod has a unique sequential id (mod-N)', () => {
    const ids = data.mods.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    data.mods.forEach((mod, i) => {
      expect(mod.id).toBe(`mod-${i + 1}`);
    });
  });

  it('each mod has a non-empty name', () => {
    for (const mod of data.mods) {
      expect(mod.name).toBeTruthy();
    }
  });

  it('mod_type is normalized (not a raw WFCD type)', () => {
    const allowedTypes = [
      'Warframe Mod', 'Rifle Mod', 'Shotgun Mod', 'Melee Mod',
      'Pistol Mod', 'Archwing Mod', 'Sentinel Mod', 'Stance Mod',
      'Aura', 'Parazon Mod', 'Railjack Mod', 'Other',
    ];
    for (const mod of data.mods) {
      expect(allowedTypes).toContain(mod.mod_type);
    }
  });

  it('base_drain and fusion_limit are numbers', () => {
    for (const mod of data.mods) {
      expect(typeof mod.base_drain).toBe('number');
      expect(typeof mod.fusion_limit).toBe('number');
      expect(Number.isFinite(mod.base_drain)).toBe(true);
      expect(mod.fusion_limit).toBeGreaterThanOrEqual(0);
    }
  });

  it('rarity is one of Common, Uncommon, Rare, or Legendary', () => {
    const allowed = ['Common', 'Uncommon', 'Rare', 'Legendary'];
    for (const mod of data.mods) {
      expect(allowed).toContain(mod.rarity);
    }
  });

  it('is_prime, is_augment, is_umbral are booleans', () => {
    for (const mod of data.mods) {
      expect(typeof mod.is_prime).toBe('boolean');
      expect(typeof mod.is_augment).toBe('boolean');
      expect(typeof mod.is_umbral).toBe('boolean');
    }
  });

  it('has some Prime mods', () => {
    const primes = data.mods.filter((m) => m.is_prime);
    expect(primes.length).toBeGreaterThan(0);
  });

  it('has some Umbral mods', () => {
    const umbrals = data.mods.filter((m) => m.is_umbral);
    expect(umbrals.length).toBeGreaterThan(0);
  });

  it('wiki_url is either a string or null', () => {
    for (const mod of data.mods) {
      expect(mod.wiki_url === null || typeof mod.wiki_url === 'string').toBe(true);
    }
  });

  it('if wiki_url is set, it starts with https://', () => {
    for (const mod of data.mods) {
      if (mod.wiki_url) {
        expect(mod.wiki_url).toMatch(/^https:\/\//);
      }
    }
  });

  it('wfcd-cache.json still exists and is unchanged format', () => {
    expect(existsSync(WFCD_CACHE_PATH)).toBe(true);
    const wfcdData = JSON.parse(readFileSync(WFCD_CACHE_PATH, 'utf8'));
    expect(wfcdData).toHaveProperty('items');
    expect(wfcdData).toHaveProperty('materials');
    expect(wfcdData).toHaveProperty('treeRelationships');
    expect(Array.isArray(wfcdData.items)).toBe(true);
    expect(wfcdData.items.length).toBeGreaterThan(0);
  });
});

describe('normalizeModType (via prebuild output)', () => {
  const hasModsCache = existsSync(MODS_CACHE_PATH);
  if (!hasModsCache) return;

  let mods;
  try {
    mods = JSON.parse(readFileSync(MODS_CACHE_PATH, 'utf8')).mods;
  } catch {
    return;
  }

  it('maps Warframe type to Warframe Mod', () => {
    const warframeMod = mods.find((m) => m.name === 'Abating Link');
    expect(warframeMod).toBeTruthy();
    if (warframeMod) {
      expect(warframeMod.mod_type).toBe('Warframe Mod');
    }
  });

  it('detects Umbral mods from name', () => {
    const umbralMod = mods.find((m) => m.name === 'Umbral Fiber');
    expect(umbralMod).toBeTruthy();
    if (umbralMod) {
      expect(umbralMod.is_umbral).toBe(true);
    }
  });

  it('sets compat_name for warframe-augment mods', () => {
    const augmentMod = mods.find((m) => m.name === 'Abating Link');
    expect(augmentMod).toBeTruthy();
    if (augmentMod) {
      expect(augmentMod.compat_name).toBe('Trinity');
    }
  });
});
