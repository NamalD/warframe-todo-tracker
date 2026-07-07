import { describe, it, expect, beforeEach, vi } from 'vitest';

const CACHE_VERSION = '1.1275.0';

const SAMPLE_MODS = [
  {
    id: 'mod-1',
    name: 'Abating Link',
    mod_type: 'Warframe Mod',
    polarity: 'zenurik',
    rarity: 'Rare',
    base_drain: 6,
    fusion_limit: 3,
    is_prime: false,
    is_augment: true,
    is_umbral: false,
    compat_name: 'Trinity',
    wiki_url: 'https://wiki.warframe.com/w/Abating_Link',
  },
  {
    id: 'mod-2',
    name: 'Primed Continuity',
    mod_type: 'Warframe Mod',
    polarity: 'naramon',
    rarity: 'Legendary',
    base_drain: 10,
    fusion_limit: 10,
    is_prime: true,
    is_augment: false,
    is_umbral: false,
    compat_name: null,
    wiki_url: 'https://wiki.warframe.com/w/Primed_Continuity',
  },
  {
    id: 'mod-3',
    name: 'Umbral Intensify',
    mod_type: 'Warframe Mod',
    polarity: 'umbral',
    rarity: 'Rare',
    base_drain: 8,
    fusion_limit: 3,
    is_prime: false,
    is_augment: false,
    is_umbral: true,
    compat_name: null,
    wiki_url: 'https://wiki.warframe.com/w/Umbral_Intensify',
  },
];

let ModRepository;

function createMockCache() {
  return {
    version: CACHE_VERSION,
    cachedAt: '2026-07-07T00:00:00Z',
    mods: SAMPLE_MODS,
  };
}

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  const mod = await import('../../src/data/mod-repository.js');
  ModRepository = mod.default;
});

describe('ModRepository', () => {
  describe('getMods() — with mock fetch returning cache', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });
    });

    it('fetches mods on first call and returns enriched mods', async () => {
      const repo = new ModRepository();
      const mods = await repo.getMods();
      expect(mods.length).toBe(3);
      expect(mods[0].name).toBe('Abating Link');
      expect(mods[0].owned).toBe(false);
      expect(mods[0].rank).toBe(0);
    });

    it('caches mods to localStorage after fetch', async () => {
      const repo = new ModRepository();
      await repo.getMods();

      const cached = localStorage.getItem('warframe-mods-cache');
      expect(cached).toBeTruthy();
      const parsed = JSON.parse(cached);
      expect(parsed.version).toBe(CACHE_VERSION);
      expect(parsed.mods.length).toBe(3);
    });

    it('reuses cached data on subsequent calls without fetch', async () => {
      const repo = new ModRepository();
      await repo.getMods();
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call — should not fetch again
      const mods = await repo.getMods();
      expect(mods.length).toBe(3);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('re-fetches on version mismatch', async () => {
      // Pre-populate cache with an older version
      localStorage.setItem('warframe-mods-cache', JSON.stringify({
        version: '1.0.0',
        cachedAt: '2026-01-01T00:00:00Z',
        mods: [],
      }));

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });

      const repo = new ModRepository();
      const mods = await repo.getMods();
      expect(mods.length).toBe(3);
      // Should have fetched because version mismatched
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('uses cached data on network error', async () => {
      // Pre-populate cache
      localStorage.setItem('warframe-mods-cache', JSON.stringify({
        version: CACHE_VERSION,
        cachedAt: '2026-07-07T00:00:00Z',
        mods: SAMPLE_MODS,
      }));

      // Make fetch fail
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const repo = new ModRepository();
      const mods = await repo.getMods();
      expect(mods.length).toBe(3);
      expect(mods[0].name).toBe('Abating Link');
    });

    it('returns empty array on network error when no cache exists', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const repo = new ModRepository();
      const mods = await repo.getMods();
      expect(mods).toEqual([]);
    });
  });

  describe('getModById()', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });
    });

    it('returns a mod by id', async () => {
      const repo = new ModRepository();
      const mod = await repo.getModById('mod-2');
      expect(mod).not.toBeNull();
      expect(mod.name).toBe('Primed Continuity');
      expect(mod.owned).toBe(false);
      expect(mod.rank).toBe(0);
    });

    it('returns null for unknown id', async () => {
      const repo = new ModRepository();
      const mod = await repo.getModById('nonexistent');
      expect(mod).toBeNull();
    });
  });

  describe('setModOwned()', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });
    });

    it('sets a mod as owned', async () => {
      const repo = new ModRepository();
      await repo.setModOwned('mod-1', true);

      const mod = await repo.getModById('mod-1');
      expect(mod.owned).toBe(true);

      // Verify persisted to collection in localStorage
      const collection = JSON.parse(localStorage.getItem('warframe-mod-collection'));
      expect(collection['mod-1'].owned).toBe(true);
    });

    it('sets a mod as unowned', async () => {
      const repo = new ModRepository();
      await repo.setModOwned('mod-1', true);
      await repo.setModOwned('mod-1', false);

      const mod = await repo.getModById('mod-1');
      expect(mod.owned).toBe(false);
    });

    it('reflects ownership in getMods()', async () => {
      const repo = new ModRepository();
      await repo.setModOwned('mod-1', true);
      await repo.setModOwned('mod-2', true);

      const mods = await repo.getMods();
      const ownedMods = mods.filter((m) => m.owned);
      expect(ownedMods.length).toBe(2);
      expect(ownedMods.map((m) => m.id)).toEqual(['mod-1', 'mod-2']);
    });

    it('persists only interacted mods in collection', async () => {
      const repo = new ModRepository();
      await repo.setModOwned('mod-1', true);

      const collection = JSON.parse(localStorage.getItem('warframe-mod-collection'));
      expect(Object.keys(collection)).toEqual(['mod-1']);
    });
  });

  describe('setModRank()', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });
    });

    it('sets the rank of a mod', async () => {
      const repo = new ModRepository();
      await repo.setModRank('mod-1', 2);

      const mod = await repo.getModById('mod-1');
      expect(mod.rank).toBe(2);

      // Verify persisted
      const collection = JSON.parse(localStorage.getItem('warframe-mod-collection'));
      expect(collection['mod-1'].rank).toBe(2);
    });

    it('clamps rank to fusion_limit', async () => {
      const repo = new ModRepository();
      // mod-1 has fusion_limit=3
      await repo.setModRank('mod-1', 10);

      const mod = await repo.getModById('mod-1');
      expect(mod.rank).toBe(3);
    });

    it('clamps rank to 0 minimum', async () => {
      const repo = new ModRepository();
      await repo.setModRank('mod-1', -5);

      const mod = await repo.getModById('mod-1');
      expect(mod.rank).toBe(0);
    });

    it('preserves rank between instances', async () => {
      const repo = new ModRepository();
      await repo.setModRank('mod-2', 5);

      // New instance reads from localStorage
      const repo2 = new ModRepository();
      const mod = await repo2.getModById('mod-2');
      expect(mod.rank).toBe(5);
    });
  });

  describe('getStats()', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });
    });

    it('returns total, owned, unowned counts', async () => {
      const repo = new ModRepository();
      await repo.setModOwned('mod-1', true);

      const stats = repo.getStats();
      expect(stats.total).toBe(3);
      expect(stats.owned).toBe(1);
      expect(stats.unowned).toBe(2);
    });

    it('returns stats before async init — uses initial loadout data', async () => {
      // Pre-populate collection with some owned mods
      localStorage.setItem('warframe-mod-collection', JSON.stringify({
        'mod-1': { owned: true, rank: 2 },
      }));
      localStorage.setItem('warframe-mods-cache', JSON.stringify({
        version: CACHE_VERSION,
        cachedAt: '2026-07-07T00:00:00Z',
        mods: SAMPLE_MODS,
      }));

      const repo = new ModRepository();

      // Arrange: ensure ensureInitialized is called first
      await repo.getMods();

      const stats = repo.getStats();
      expect(stats.total).toBe(3);
      expect(stats.owned).toBe(1);
    });
  });

  describe('edge cases: corrupted localStorage', () => {
    it('handles corrupted mods-cache JSON gracefully', async () => {
      localStorage.setItem('warframe-mods-cache', 'not-valid{');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });

      const repo = new ModRepository();
      const mods = await repo.getMods();
      expect(mods.length).toBe(3);
    });

    it('handles corrupted mod-collection JSON gracefully', async () => {
      localStorage.setItem('warframe-mod-collection', 'not-valid{');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });

      const repo = new ModRepository();
      const mods = await repo.getMods();
      expect(mods.length).toBe(3);
      // Should have reset to empty collection
      expect(mods[0].owned).toBe(false);
      expect(mods[0].rank).toBe(0);
    });

    it('handles missing mods-cache key gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });

      const repo = new ModRepository();
      const mods = await repo.getMods();
      expect(mods.length).toBe(3);
    });

    it('handles missing mod-collection key gracefully', async () => {
      localStorage.removeItem('warframe-mod-collection');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockCache()),
      });

      const repo = new ModRepository();
      const mods = await repo.getMods();
      expect(mods.length).toBe(3);
      expect(mods[0].owned).toBe(false);
    });
  });
});
