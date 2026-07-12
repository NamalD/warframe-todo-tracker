import { test, expect } from '@playwright/test';

const future = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

function worldStateFixture() {
  return {
    fetchedAt: new Date().toISOString(),
    stale: false,
    sortie: {
      boss: 'Kela De Thaym',
      faction: 'Grineer',
      expiry: future(20),
      missions: [
        { missionType: 'Rescue', modifier: 'Eximus Stronghold', node: 'Rusalka (Sedna)' },
        { missionType: 'Defense', modifier: 'Radiation Pockets', node: 'Stephano (Uranus)' },
      ],
    },
    archonHunt: {
      boss: 'Archon Amar',
      faction: 'Narmer',
      expiry: future(30),
      missions: [{ type: 'Sabotage', node: 'Olympus (Mars)' }],
    },
    steelPath: { currentReward: { name: 'Rifle Riven Mod', cost: 75 }, expiry: future(48) },
    fissures: {
      normal: [{ tier: 'Lith', tierNum: 1, missionType: 'Sabotage', node: 'Cervantes (Earth)', expiry: future(1), isStorm: false }],
      steelPath: [{ tier: 'Meso', tierNum: 2, missionType: 'Capture', node: 'Ara (Mars)', expiry: future(1), isStorm: false }],
    },
    invasions: [
      {
        node: 'Acheron (Pluto)',
        desc: 'Grineer Offensive',
        completion: 42,
        attackerReward: '3x Detonite Injector',
        defenderReward: '3x Fieldron',
        rewardTypes: ['detonite', 'fieldron'],
      },
    ],
    arbitration: null,
    // At relay now: activation in the past, expiry in the future -> location is shown.
    voidTrader: { character: "Baro Ki'Teer", location: 'Larunda Relay (Mercury)', activation: future(-24), expiry: future(48) },
    cycles: {
      cetus: { state: 'day', isDay: true, expiry: future(1) },
      vallis: { state: 'cold', isDay: false, expiry: future(1) },
      cambion: { state: 'fass', isDay: null, expiry: future(1) },
      duviri: { state: 'anger', isDay: null, expiry: future(1) },
    },
    darvoDeal: { item: 'Vauban', salePrice: 150, originalPrice: 300, discount: 50, sold: 40, total: 100, expiry: future(6) },
    archimedeas: [
      { label: 'Deep Archimedea', expiry: future(48), missions: [{ missionType: 'Disruption', deviation: 'Double Trouble', risks: [] }], personalModifiers: [{ name: 'Energy Exhaustion', description: 'x' }] },
      { label: 'Temporal Archimedea', expiry: future(48), missions: [], personalModifiers: [] },
    ],
  };
}

async function routeWorldState(page, handler) {
  await page.route(/\/api\/worldstate/, handler);
}

test.describe('World State dashboard', () => {
  test('renders live world state sections with content', async ({ page }) => {
    await routeWorldState(page, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(worldStateFixture()) });
    });
    await page.goto('/worldstate');

    // Sortie content
    await expect(page.getByText('Kela De Thaym')).toBeVisible();
    await expect(page.getByText('Eximus Stronghold')).toBeVisible();
    // Invasion reward name the issue calls out
    await expect(page.getByText('3x Fieldron')).toBeVisible();
    // Baro location + arriving state
    await expect(page.getByText('Larunda Relay (Mercury)')).toBeVisible();
    // A day/night cycle state
    await expect(page.getByText('Plains of Eidolon')).toBeVisible();
    await expect(page.getByText('day', { exact: true })).toBeVisible();
    // Deep Archimedea labelled section
    await expect(page.getByRole('heading', { name: 'Deep Archimedea' })).toBeVisible();

    // A live countdown is rendered (far-future expiry -> shows hours/days)
    await expect(page.getByTestId('countdown').first()).toContainText(/\d+[dh]/);
  });

  test('nav link routes to the dashboard', async ({ page }) => {
    await routeWorldState(page, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(worldStateFixture()) });
    });
    await page.goto('/');
    await page.getByRole('link', { name: 'World State' }).first().click();
    await expect(page).toHaveURL(/\/worldstate$/);
    await expect(page.getByRole('heading', { name: 'World State', level: 1 })).toBeVisible();
  });

  test('shows an error card with retry when the endpoint fails', async ({ page }) => {
    await routeWorldState(page, async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Failed to fetch world state' }) });
    });
    await page.goto('/worldstate');
    await expect(page.getByTestId('ws-error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
