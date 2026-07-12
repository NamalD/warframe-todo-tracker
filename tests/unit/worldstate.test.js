import { describe, it, expect } from 'vitest';
import { extractWorldState } from '../../src/data/worldstate-transform.ts';

// Trimmed fixture mirroring the real warframestat.us /pc shape (verified 2026-07-12).
const RAW = {
  sortie: {
    boss: 'Kela De Thaym',
    faction: 'Grineer',
    expiry: '2026-07-13T16:00:00.000Z',
    variants: [
      { missionType: 'Rescue', modifier: 'Eximus Stronghold', node: 'Rusalka (Sedna)' },
      { missionType: 'Defense', modifier: 'Radiation Pockets', node: 'Stephano (Uranus)' },
    ],
  },
  archonHunt: {
    boss: 'Archon Amar',
    faction: 'Narmer',
    expiry: '2026-07-13T00:00:00.000Z',
    missions: [
      { type: 'Sabotage', node: 'Olympus (Mars)' },
      { type: 'Assassination', node: 'War (Mars)' },
    ],
  },
  steelPath: { currentReward: { name: 'Rifle Riven Mod', cost: 75 }, expiry: '2026-07-12T23:59:59.000Z' },
  fissures: [
    { tier: 'Lith', tierNum: 1, missionType: 'Sabotage', node: 'Cervantes (Earth)', expiry: 'x', isStorm: false, isHard: false },
    { tier: 'Meso', tierNum: 2, missionType: 'Capture', node: 'Ara (Mars)', expiry: 'x', isStorm: false, isHard: true },
    { tier: 'Axi', tierNum: 4, missionType: 'Survival', node: 'Xini (Eris)', expiry: 'x', isStorm: true, isHard: false },
  ],
  invasions: [
    {
      node: 'Acheron (Pluto)',
      desc: 'Grineer Offensive',
      completion: 0.157,
      rewardTypes: ['detonite', 'fieldron'],
      attacker: { reward: { countedItems: [{ count: 3, type: 'Detonite Injector', key: 'Detonite Injector' }] } },
      defender: { reward: { countedItems: [{ count: 3, type: 'Fieldron', key: 'Fieldron' }] } },
    },
  ],
  arbitration: { node: 'SolNode000', type: 'Unknown', enemy: 'Tenno', expiry: '+275760-09-13T00:00:00.000Z' },
  voidTrader: {
    character: "Baro Ki'Teer",
    location: 'TennoConHUB2',
    activation: '2026-07-11T15:00:00.000Z',
    expiry: '2026-07-18T15:00:00.000Z',
  },
  cetusCycle: { state: 'day', isDay: true, expiry: '2026-07-12T23:40:00.000Z' },
  vallisCycle: { state: 'cold', isDay: false, expiry: '2026-07-12T22:53:28.000Z' },
  cambionCycle: { state: 'fass', isDay: null, expiry: '2026-07-12T23:40:00.000Z' },
  duviriCycle: { state: 'anger', isDay: null, expiry: '2026-07-13T00:00:00.000Z' },
  dailyDeals: [
    { item: 'Vauban', salePrice: 150, originalPrice: 300, discount: 50, sold: 100, total: 100, expiry: '2026-07-13T13:00:00.000Z' },
  ],
  archimedeas: [
    {
      expiry: '2026-07-13T00:00:00.000Z',
      missions: [
        { missionType: 'Disruption', deviation: { name: 'Double Trouble' }, risks: [{ name: 'Entanglement', isHard: false }, { name: 'Hostile Regeneration', isHard: true }] },
      ],
      personalModifiers: [{ name: 'Energy Exhaustion', description: 'Lose 2 Energy per second.' }],
    },
    { expiry: '2026-07-13T00:00:00.000Z', missions: [], personalModifiers: [] },
  ],
};

describe('extractWorldState', () => {
  it('maps the sortie boss/faction/expiry and variant missions', () => {
    const { sortie } = extractWorldState(RAW);
    expect(sortie).toMatchObject({ boss: 'Kela De Thaym', faction: 'Grineer', expiry: '2026-07-13T16:00:00.000Z' });
    expect(sortie.missions).toEqual([
      { missionType: 'Rescue', modifier: 'Eximus Stronghold', node: 'Rusalka (Sedna)' },
      { missionType: 'Defense', modifier: 'Radiation Pockets', node: 'Stephano (Uranus)' },
    ]);
  });

  it('maps archon hunt missions to {type, node}', () => {
    const { archonHunt } = extractWorldState(RAW);
    expect(archonHunt.boss).toBe('Archon Amar');
    expect(archonHunt.missions).toEqual([
      { type: 'Sabotage', node: 'Olympus (Mars)' },
      { type: 'Assassination', node: 'War (Mars)' },
    ]);
  });

  it('exposes the Steel Path weekly reward', () => {
    const { steelPath } = extractWorldState(RAW);
    expect(steelPath.currentReward).toEqual({ name: 'Rifle Riven Mod', cost: 75 });
  });

  it('splits fissures into normal vs steel-path by isHard, sorted by tier', () => {
    const { fissures } = extractWorldState(RAW);
    expect(fissures.normal.map((f) => f.tier)).toEqual(['Lith', 'Axi']);
    expect(fissures.steelPath.map((f) => f.tier)).toEqual(['Meso']);
    expect(fissures.normal.find((f) => f.tier === 'Axi').isStorm).toBe(true);
  });

  it('surfaces invasion reward names and rewardTypes', () => {
    const { invasions } = extractWorldState(RAW);
    expect(invasions).toHaveLength(1);
    expect(invasions[0]).toMatchObject({
      node: 'Acheron (Pluto)',
      attackerReward: '3x Detonite Injector',
      defenderReward: '3x Fieldron',
      rewardTypes: ['detonite', 'fieldron'],
    });
  });

  it('drops completed invasions and clamps completion to a 0-100 integer', () => {
    const raw = {
      invasions: [
        { node: 'Done (Pluto)', completed: true, completion: -0.04, attacker: {}, defender: {} },
        { node: 'Active (Europa)', completed: false, completion: 85.45, attacker: {}, defender: {} },
        { node: 'Behind (Venus)', completed: false, completion: -1.29, attacker: {}, defender: {} },
      ],
    };
    const { invasions } = extractWorldState(raw);
    expect(invasions.map((i) => i.node)).toEqual(['Active (Europa)', 'Behind (Venus)']);
    expect(invasions[0].completion).toBe(85);
    expect(invasions[1].completion).toBe(0);
  });

  it('drops fissures whose expiry has passed, keeps future/unparseable ones', () => {
    const raw = {
      fissures: [
        { tier: 'Lith', tierNum: 1, node: 'past', expiry: '2000-01-01T00:00:00.000Z', isHard: false },
        { tier: 'Meso', tierNum: 2, node: 'future', expiry: '2999-01-01T00:00:00.000Z', isHard: false },
        { tier: 'Neo', tierNum: 3, node: 'sp-future', expiry: '2999-01-01T00:00:00.000Z', isHard: true },
      ],
    };
    const { fissures } = extractWorldState(raw);
    expect(fissures.normal.map((f) => f.tier)).toEqual(['Meso']);
    expect(fissures.steelPath.map((f) => f.tier)).toEqual(['Neo']);
  });

  it('hides an internal Baro location key but keeps a real relay name', () => {
    expect(extractWorldState({ voidTrader: { location: 'TennoConHUB2' } }).voidTrader.location).toBeNull();
    expect(extractWorldState({ voidTrader: { location: 'Larunda Relay (Mercury)' } }).voidTrader.location).toBe(
      'Larunda Relay (Mercury)',
    );
  });

  it('treats an Unknown/placeholder arbitration as no data (null)', () => {
    expect(extractWorldState(RAW).arbitration).toBeNull();
  });

  it('keeps a valid arbitration', () => {
    const raw = { arbitration: { node: 'Cinxia (Ceres)', type: 'Defense', enemy: 'Corpus', expiry: '2026-07-12T23:00:00.000Z' } };
    expect(extractWorldState(raw).arbitration).toEqual({
      node: 'Cinxia (Ceres)',
      type: 'Defense',
      enemy: 'Corpus',
      expiry: '2026-07-12T23:00:00.000Z',
    });
  });

  it('maps the void trader and day/night cycles', () => {
    const ws = extractWorldState(RAW);
    expect(ws.voidTrader).toMatchObject({ location: null, expiry: '2026-07-18T15:00:00.000Z' });
    expect(ws.cycles.cetus).toEqual({ state: 'day', isDay: true, expiry: '2026-07-12T23:40:00.000Z' });
    expect(ws.cycles.cambion.state).toBe('fass');
  });

  it("maps Darvo's daily deal", () => {
    const { darvoDeal } = extractWorldState(RAW);
    expect(darvoDeal).toMatchObject({ item: 'Vauban', salePrice: 150, originalPrice: 300, discount: 50 });
  });

  it('labels archimedeas and maps deviation/risk modifiers', () => {
    const { archimedeas } = extractWorldState(RAW);
    expect(archimedeas.map((a) => a.label)).toEqual(['Deep Archimedea', 'Temporal Archimedea']);
    expect(archimedeas[0].missions[0]).toMatchObject({ missionType: 'Disruption', deviation: 'Double Trouble' });
    expect(archimedeas[0].personalModifiers[0].name).toBe('Energy Exhaustion');
  });

  it('is total: empty/garbage input never throws', () => {
    expect(() => extractWorldState({})).not.toThrow();
    expect(() => extractWorldState(null)).not.toThrow();
    const empty = extractWorldState({});
    expect(empty.sortie).toBeNull();
    expect(empty.invasions).toEqual([]);
    expect(empty.fissures).toEqual({ normal: [], steelPath: [] });
    expect(empty.cycles.cetus).toBeNull();
  });
});
