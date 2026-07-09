import { test, expect, Page } from '@playwright/test';

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
  {
    id: 'mod-4',
    name: 'Point Strike',
    mod_type: 'Rifle Mod',
    polarity: 'madurai',
    rarity: 'Common',
    base_drain: 4,
    fusion_limit: 5,
    is_prime: false,
    is_augment: false,
    is_umbral: false,
    compat_name: null,
    wiki_url: 'https://wiki.warframe.com/w/Point_Strike',
  },
  {
    id: 'mod-5',
    name: 'Vital Sense',
    mod_type: 'Rifle Mod',
    polarity: 'madurai',
    rarity: 'Rare',
    base_drain: 6,
    fusion_limit: 5,
    is_prime: false,
    is_augment: false,
    is_umbral: false,
    compat_name: null,
    wiki_url: 'https://wiki.warframe.com/w/Vital_Sense',
  },
  {
    id: 'mod-6',
    name: 'Streamline',
    mod_type: 'Warframe Mod',
    polarity: 'naramon',
    rarity: 'Uncommon',
    base_drain: 4,
    fusion_limit: 5,
    is_prime: false,
    is_augment: false,
    is_umbral: false,
    compat_name: null,
    wiki_url: 'https://wiki.warframe.com/w/Streamline',
  },
];

/**
 * Seed localStorage with controlled mod data and pre-mark some as owned.
 * Call this before page.goto('/mods') so the async load finds the cache.
 */
async function seedModData(page: Page, ownedModIds: string[] = []) {
  const collection: Record<string, { owned: boolean; rank: number }> = {};
  for (const id of ownedModIds) {
    collection[id] = { owned: true, rank: 3 };
  }

  // localStorage access via page.evaluate() throws a SecurityError on the
  // default about:blank page (opaque origin) — some describe blocks'
  // beforeEach navigate first (establishing the app's origin) and some
  // don't, so this must not assume one or the other.
  if (page.url() === 'about:blank') {
    await page.goto('/mods');
  }

  await page.evaluate(
    ({ cacheVersion, sampleMods, collection }) => {
      localStorage.setItem(
        'warframe-mods-cache',
        JSON.stringify({
          version: cacheVersion,
          cachedAt: '2026-07-07T00:00:00Z',
          mods: sampleMods,
        })
      );
      localStorage.setItem(
        'warframe-mod-collection',
        JSON.stringify(collection)
      );
    },
    { cacheVersion: CACHE_VERSION, sampleMods: SAMPLE_MODS, collection }
  );
}

/**
 * Mock the /data/mods-cache.json fetch to return controlled test data.
 * Call this before navigating to the mods page.
 */
async function mockModsFetch(page: Page) {
  await page.route('**/data/mods-cache.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: CACHE_VERSION,
        cachedAt: '2026-07-07T00:00:00Z',
        mods: SAMPLE_MODS,
      }),
    });
  });
}

test.describe('Mods list page', () => {
  test.beforeEach(async ({ page }) => {
    await mockModsFetch(page);
    await page.goto('/mods');
    await page.waitForTimeout(300);
  });

  test.describe('page rendering', () => {
    test('renders page title', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Mods');
    });

    test('renders all mod cards', async ({ page }) => {
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(6);
    });

    test('displays mod names', async ({ page }) => {
      await expect(page.getByText('Abating Link')).toBeVisible();
      await expect(page.getByText('Primed Continuity')).toBeVisible();
      await expect(page.getByText('Point Strike')).toBeVisible();
    });

    test('displays rarity text on each card', async ({ page }) => {
      // Scope to cards — the rarity filter <select> also has options with
      // this same text, which would otherwise cause a strict-mode violation.
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards.getByText('Common', { exact: true })).toBeVisible();
      await expect(cards.getByText('Uncommon', { exact: true })).toBeVisible();
      await expect(cards.getByText('Rare', { exact: true }).first()).toBeVisible();
      await expect(cards.getByText('Legendary', { exact: true })).toBeVisible();
    });

    test('displays polarity text on each card', async ({ page }) => {
      const card = page.locator('[data-testid="mod-card-mod-1"]');
      await expect(card).toContainText('zenurik');
    });

    test('has data-testid on mods-page container', async ({ page }) => {
      await expect(page.locator('[data-testid="mods-page"]')).toBeVisible();
    });

    test('has data-testid on each mod card', async ({ page }) => {
      for (let i = 1; i <= 6; i++) {
        await expect(
          page.locator(`[data-testid="mod-card-mod-${i}"]`)
        ).toBeVisible();
      }
    });
  });

  test.describe('search', () => {
    test('search by name filters results', async ({ page }) => {
      await page.fill('[data-testid="mod-search-input"]', 'primed');
      await expect(page.getByText('Primed Continuity')).toBeVisible();
      await expect(page.getByText('Abating Link')).not.toBeVisible();
      await expect(page.getByText('Point Strike')).not.toBeVisible();
    });

    test('search matches substring in any position', async ({ page }) => {
      await page.fill('[data-testid="mod-search-input"]', 'strike');
      await expect(page.getByText('Point Strike')).toBeVisible();
      await expect(page.getByText('Abating Link')).not.toBeVisible();
    });

    test('search is case-insensitive', async ({ page }) => {
      await page.fill('[data-testid="mod-search-input"]', 'ABATING');
      await expect(page.getByText('Abating Link')).toBeVisible();
    });

    test('shows empty state when search matches nothing', async ({ page }) => {
      await page.fill('[data-testid="mod-search-input"]', 'zzzzzznonexistent');
      await expect(page.locator('[data-testid="mod-empty"]')).toBeVisible();
      await expect(page.getByText(/No mods match/)).toBeVisible();
    });

    test('clearing search restores all results', async ({ page }) => {
      await page.fill('[data-testid="mod-search-input"]', 'primed');
      await expect(page.getByText('Primed Continuity')).toBeVisible();
      await page.fill('[data-testid="mod-search-input"]', '');
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(6);
    });
  });

  test.describe('type dropdown filter', () => {
    test('shows all types option by default', async ({ page }) => {
      const select = page.locator('[data-testid="mod-type-filter"]');
      await expect(select).toHaveValue('');
    });

    test('filters by "Warframe Mod" type', async ({ page }) => {
      await page.selectOption('[data-testid="mod-type-filter"]', 'Warframe Mod');
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(4);
      await expect(page.getByText('Abating Link')).toBeVisible();
      await expect(page.getByText('Point Strike')).not.toBeVisible();
    });

    test('filters by "Rifle Mod" type', async ({ page }) => {
      await page.selectOption('[data-testid="mod-type-filter"]', 'Rifle Mod');
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(2);
      await expect(page.getByText('Point Strike')).toBeVisible();
      await expect(page.getByText('Vital Sense')).toBeVisible();
      await expect(page.getByText('Abating Link')).not.toBeVisible();
    });

    test('resetting type to "All Types" shows all mods', async ({ page }) => {
      await page.selectOption('[data-testid="mod-type-filter"]', 'Rifle Mod');
      await expect(page.locator('[data-testid^="mod-card-"]')).toHaveCount(2);
      await page.selectOption('[data-testid="mod-type-filter"]', '');
      await expect(page.locator('[data-testid^="mod-card-"]')).toHaveCount(6);
    });
  });

  test.describe('rarity dropdown filter', () => {
    test('filters by "Legendary" rarity', async ({ page }) => {
      await page.selectOption('[data-testid="mod-rarity-filter"]', 'Legendary');
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(1);
      await expect(page.getByText('Primed Continuity')).toBeVisible();
    });

    test('filters by "Rare" rarity', async ({ page }) => {
      await page.selectOption('[data-testid="mod-rarity-filter"]', 'Rare');
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(3);
    });

    test('filters by "Common" rarity', async ({ page }) => {
      await page.selectOption('[data-testid="mod-rarity-filter"]', 'Common');
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(1);
      await expect(page.getByText('Point Strike')).toBeVisible();
    });

    test('resetting rarity to "All Rarities" shows all mods', async ({ page }) => {
      await page.selectOption('[data-testid="mod-rarity-filter"]', 'Legendary');
      await expect(page.locator('[data-testid^="mod-card-"]')).toHaveCount(1);
      await page.selectOption('[data-testid="mod-rarity-filter"]', '');
      await expect(page.locator('[data-testid^="mod-card-"]')).toHaveCount(6);
    });
  });

  test.describe('owned-only filter', () => {
    test('"Show owned only" checkbox renders', async ({ page }) => {
      await expect(
        page.locator('[data-testid="mod-owned-filter"]')
      ).toBeVisible();
      await expect(page.getByText('Show owned only')).toBeVisible();
    });

    test('filters to owned mods only', async ({ page }) => {
      // Seed with some owned mods
      await seedModData(page, ['mod-1', 'mod-4']);
      await page.goto('/mods');
      await page.waitForTimeout(300);

      await page.locator('[data-testid="mod-owned-filter"]').check();
      await page.waitForTimeout(200);

      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(2);
      await expect(page.getByText('Abating Link')).toBeVisible();
      await expect(page.getByText('Point Strike')).toBeVisible();
      await expect(page.getByText('Primed Continuity')).not.toBeVisible();
    });

    test('unchecking owned-only restores full list', async ({ page }) => {
      await seedModData(page, ['mod-1']);
      await page.goto('/mods');
      await page.waitForTimeout(300);

      const checkbox = page.locator('[data-testid="mod-owned-filter"]');
      await checkbox.check();
      await page.waitForTimeout(200);
      await expect(page.locator('[data-testid^="mod-card-"]')).toHaveCount(1);

      await checkbox.uncheck();
      await page.waitForTimeout(200);
      await expect(page.locator('[data-testid^="mod-card-"]')).toHaveCount(6);
    });

    test('shows celebration when all mods are owned and filter is on', async ({
      page,
    }) => {
      await seedModData(page, [
        'mod-1', 'mod-2', 'mod-3', 'mod-4', 'mod-5', 'mod-6',
      ]);
      await page.goto('/mods');
      await page.waitForTimeout(300);

      await page.locator('[data-testid="mod-owned-filter"]').check();
      await page.waitForTimeout(200);

      await expect(page.locator('[data-testid="mod-empty"]')).toBeVisible();
      await expect(page.getByText(/collected every mod/)).toBeVisible();
    });
  });

  test.describe('owned checkbox on cards', () => {
    test('owned checkbox toggles state', async ({ page }) => {
      const checkbox = page.locator('[data-testid="mod-owned-checkbox-mod-1"]');
      // Initially unchecked (no seed data)
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
      await page.waitForTimeout(200);
      await expect(checkbox).toBeChecked();
    });

    test('toggling owned checkbox does not navigate', async ({ page }) => {
      const checkbox = page.locator('[data-testid="mod-owned-checkbox-mod-1"]');
      await checkbox.check();
      await page.waitForTimeout(200);
      await expect(page).toHaveURL('/mods');
    });

    test('owned checkbox click refreshes parent state', async ({ page }) => {
      // Toggle owned on mod-1, then filter to owned-only
      const checkbox = page.locator('[data-testid="mod-owned-checkbox-mod-1"]');
      await checkbox.check();
      await page.waitForTimeout(200);

      // Now check owned-only filter — mod-1 should appear
      await page.locator('[data-testid="mod-owned-filter"]').check();
      await page.waitForTimeout(200);

      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(1);
      await expect(page.getByText('Abating Link')).toBeVisible();
    });

    test('rank display shows correct format', async ({ page }) => {
      await seedModData(page, ['mod-2']);
      await page.goto('/mods');
      await page.waitForTimeout(300);

      // mod-2 has rank 3, fusion_limit 10 => R3/10
      await expect(page.getByText('R3/10')).toBeVisible();
    });

    test('shows "Not owned" for unowned mods', async ({ page }) => {
      const notOwnedElements = page.locator('text=Not owned');
      const count = await notOwnedElements.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('navigation from list to detail', () => {
    test('clicking mod name navigates to detail page', async ({ page }) => {
      await page.getByText('Primed Continuity').click();
      await expect(page).toHaveURL(/\/mods\/mod-2/);
    });

    test('detail page shows mod name', async ({ page }) => {
      await page.getByText('Abating Link').click();
      await expect(page).toHaveURL(/\/mods\/mod-1/);
      await expect(
        page.locator('[data-testid="mod-detail-name"]')
      ).toContainText('Abating Link');
    });
  });
});

test.describe('Mod detail page', () => {
  test.beforeEach(async ({ page }) => {
    await mockModsFetch(page);
  });

  test.describe('detail page rendering', () => {
    test('shows mod name, badges, and stats', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);

      await expect(
        page.locator('[data-testid="mod-detail-name"]')
      ).toContainText('Abating Link');
      await expect(
        page.locator('[data-testid="mod-detail-type-badge"]')
      ).toContainText('Warframe Mod');
      await expect(
        page.locator('[data-testid="mod-detail-rarity-badge"]')
      ).toContainText('Rare');
      await expect(
        page.locator('[data-testid="mod-detail-polarity-badge"]')
      ).toContainText('zenurik');
      await expect(
        page.locator('[data-testid="mod-detail-stats"]')
      ).toContainText('Base Drain: 6');
      await expect(
        page.locator('[data-testid="mod-detail-stats"]')
      ).toContainText('Max Rank: 3');
    });

    test('shows Augment badge for augment mods', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);
      await expect(page.getByText('Augment')).toBeVisible();
    });

    test('shows Prime badge for prime mods', async ({ page }) => {
      await page.goto('/mods/mod-2');
      await page.waitForTimeout(300);
      // The mod name ("Primed Continuity") and wiki link URL both also
      // contain "Prime" as a substring — scope to the actual badge element.
      await expect(page.locator('.badge').getByText('Prime', { exact: true })).toBeVisible();
    });

    test('shows Umbral badge for umbral mods', async ({ page }) => {
      await page.goto('/mods/mod-3');
      await page.waitForTimeout(300);
      await expect(page.locator('.badge').getByText('Umbral', { exact: true })).toBeVisible();
    });

    test('shows compatible with name in stats', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);
      await expect(
        page.locator('[data-testid="mod-detail-stats"]')
      ).toContainText('Trinity');
    });

    test('shows wiki link with correct URL', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);
      const wikiLink = page.locator('[data-testid="mod-detail-wiki-link"]');
      await expect(wikiLink).toHaveAttribute(
        'href',
        'https://wiki.warframe.com/w/Abating_Link'
      );
    });

    test('wiki link opens in new tab', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);
      const wikiLink = page.locator('[data-testid="mod-detail-wiki-link"]');
      await expect(wikiLink).toHaveAttribute('target', '_blank');
    });

    test('has back to mods link', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);
      await expect(page.getByText('← Back to Mods')).toBeVisible();
    });
  });

  test.describe('owned toggle on detail page', () => {
    test('owned toggle renders', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);
      await expect(
        page.locator('[data-testid="mod-detail-owned-toggle"]')
      ).toBeVisible();
    });

    test('toggles owned state', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);
      const checkbox = page
        .locator('[data-testid="mod-detail-owned-toggle"]')
        .locator('input[type="checkbox"]');
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
      await page.waitForTimeout(200);
      await expect(checkbox).toBeChecked();
    });
  });

  test.describe('rank slider on detail page', () => {
    test('shows rank slider when mod is owned', async ({ page }) => {
      // Pre-seed mod-2 as owned
      await seedModData(page, ['mod-2']);
      await page.goto('/mods/mod-2');
      await page.waitForTimeout(300);

      await expect(
        page.locator('[data-testid="mod-detail-rank-slider"]')
      ).toBeVisible();
    });

    test('rank slider shows correct rank value', async ({ page }) => {
      await seedModData(page, ['mod-2']);
      await page.goto('/mods/mod-2');
      await page.waitForTimeout(300);

      await expect(
        page.locator('[data-testid="mod-detail-rank-value"]')
      ).toContainText('Rank 3 / 10');
    });

    test('rank slider updates on change', async ({ page }) => {
      await seedModData(page, ['mod-2']);
      await page.goto('/mods/mod-2');
      await page.waitForTimeout(300);

      const slider = page.locator('[data-testid="mod-detail-rank-slider"]');
      await slider.fill('8');
      await page.waitForTimeout(200);

      await expect(
        page.locator('[data-testid="mod-detail-rank-value"]')
      ).toContainText('Rank 8 / 10');
    });

    test('hides rank slider when mod is not owned', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);

      await expect(page.getByText('Not owned')).toBeVisible();
      await expect(
        page.locator('[data-testid="mod-detail-rank-slider"]')
      ).not.toBeVisible();
    });
  });

  test.describe('navigation flow', () => {
    test('NavBar → Mods → Mod detail → Back', async ({ page }) => {
      await page.goto('/mods');
      await page.waitForTimeout(300);

      // Navigate to detail
      await page.getByText('Abating Link').click();
      await expect(page).toHaveURL(/\/mods\/mod-1/);

      // Click back link
      await page.getByText('← Back to Mods').click();
      await expect(page).toHaveURL('/mods');
      await expect(page.locator('h1')).toContainText('Mods');
    });
  });

  test.describe('loading skeleton', () => {
    test('shows loading skeleton during initial load', async ({ page }) => {
      // Navigate to mods without pre-seeding — the mock is set up so it should be fast
      // but the component renders the skeleton before the data loads
      await page.goto('/mods');
      // On first render the skeleton should appear
      await expect(
        page.locator('[data-testid="mod-loading"]')
      ).toBeVisible();
    });
  });

  test.describe('edge cases — mod not found', () => {
    test('invalid mod ID shows "Mod not found."', async ({ page }) => {
      await page.goto('/mods/nonexistent-id');
      await page.waitForTimeout(300);
      await expect(
        page.locator('[data-testid="mod-detail-not-found"]')
      ).toBeVisible();
      await expect(page.getByText('Mod not found.')).toBeVisible();
    });

    test('not found page has back to mods link', async ({ page }) => {
      await page.goto('/mods/nonexistent-id');
      await page.waitForTimeout(300);
      await expect(page.getByText('← Back to Mods')).toBeVisible();
      await page.getByText('← Back to Mods').click();
      await expect(page).toHaveURL('/mods');
    });
  });

  test.describe('data-testid attributes on detail page', () => {
    test('detail page has required data-testid attributes', async ({ page }) => {
      await page.goto('/mods/mod-1');
      await page.waitForTimeout(300);

      await expect(
        page.locator('[data-testid="mod-detail-page"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="mod-detail-name"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="mod-detail-type-badge"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="mod-detail-rarity-badge"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="mod-detail-polarity-badge"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="mod-detail-stats"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="mod-detail-owned-toggle"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="mod-detail-wiki-link"]')
      ).toBeVisible();
    });
  });

  test.describe('mixed filters', () => {
    test('combines search and type filter', async ({ page }) => {
      await page.goto('/mods');
      await page.waitForTimeout(300);

      await page.fill('[data-testid="mod-search-input"]', 'primed');
      await page.selectOption(
        '[data-testid="mod-type-filter"]',
        'Warframe Mod'
      );

      await expect(page.getByText('Primed Continuity')).toBeVisible();
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(1);
    });

    test('combines search and owned filter', async ({ page }) => {
      await seedModData(page, ['mod-4']);
      await page.goto('/mods');
      await page.waitForTimeout(300);

      await page.fill('[data-testid="mod-search-input"]', 'point');
      await page.locator('[data-testid="mod-owned-filter"]').check();
      await page.waitForTimeout(200);

      await expect(page.getByText('Point Strike')).toBeVisible();
    });

    test('combines type, rarity, and owned filters', async ({ page }) => {
      await seedModData(page, ['mod-4']);
      await page.goto('/mods');
      await page.waitForTimeout(300);

      await page.selectOption('[data-testid="mod-type-filter"]', 'Rifle Mod');
      await page.selectOption('[data-testid="mod-rarity-filter"]', 'Common');
      await page.locator('[data-testid="mod-owned-filter"]').check();
      await page.waitForTimeout(200);

      await expect(page.getByText('Point Strike')).toBeVisible();
      const cards = page.locator('[data-testid^="mod-card-"]');
      await expect(cards).toHaveCount(1);
    });
  });
});
