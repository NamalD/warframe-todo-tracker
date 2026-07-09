import { test, expect } from '@playwright/test';

test.describe('Items list page', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept user-data API calls to prevent interference from other tests
    await page.route(/\/api\/todos/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    });
    await page.route(/\/api\/materials/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
    });
    await page.goto('/items');
    await page.waitForTimeout(300);
  });

  test.describe('card rendering', () => {
    // Fresh context starts with nothing tracked, so the list defaults
    // to showing all items (no tracked-only filter).
    test.beforeEach(async ({ page }) => {
      // No setup needed — default is all-items view
    });

    test('renders item cards', async ({ page }) => {
      const count = await page.locator('.card').count();
      expect(count).toBeGreaterThan(0);
    });

    test('displays item names', async ({ page }) => {
      const titles = await page.locator('.link-title').allTextContents();
      expect(titles.length).toBeGreaterThan(0);
      expect(titles[0].trim().length).toBeGreaterThan(0);
    });

    test('displays mastery rank badges', async ({ page }) => {
      const mr = await page.locator('.muted').filter({ hasText: /^MR \d+$/ }).allTextContents();
      expect(mr.length).toBeGreaterThan(0);
    });
  });

  test.describe('tracked-only filter', () => {
    test('checkbox limits to zero when nothing is tracked', async ({ page }) => {
      // With no tracked items, checking the filter shows 0 cards
      const allCards = await page.locator('.card').count();
      expect(allCards).toBeGreaterThan(0);

      await page.getByLabel('Show tracked items only').check();
      await page.waitForTimeout(300);
      const filtered = await page.locator('.card').count();
      expect(filtered).toBe(0);
    });

    test('unchecking restores full list', async ({ page }) => {
      await page.getByLabel('Show tracked items only').check();
      await page.waitForTimeout(200);
      // Should show 0 when nothing is tracked
      const filtered = await page.locator('.card').count();
      expect(filtered).toBe(0);

      await page.getByLabel('Show tracked items only').uncheck();
      await page.waitForTimeout(200);
      const allCards = await page.locator('.card').count();
      expect(allCards).toBeGreaterThan(5);
    });

    test('shows an empty-state message when tracked-only is checked with no tracked items', async ({ page }) => {
      // Enable the filter to trigger the empty state
      await page.getByLabel('Show tracked items only').check();
      await page.waitForTimeout(200);
      await expect(page.getByText(/no tracked items yet/i)).toBeVisible();
    });
  });

  test.describe('badges', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByLabel('Show tracked items only').uncheck();
      await page.waitForTimeout(200);
    });

    test('renders item-type badges', async ({ page }) => {
      const badges = await page.locator('.badge').allTextContents();
      const validTypes = new Set([
        'warframe',
        'primary',
        'secondary',
        'melee',
        'companion',
        'archwing',
        'other',
      ]);
      expect(badges.some((b) => validTypes.has(b.trim().toLowerCase()))).toBe(true);
    });

    test('shows tracked badge for tracked items', async ({ page }) => {
      // Track the first item in the list, then verify its badge appears.
      const firstTitle = (await page.locator('.link-title').first().textContent()).trim();
      await page.locator('.link-title').first().click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: 'Track' }).click();
      await expect(page.getByRole('button', { name: 'Untrack' })).toBeVisible();

      await page.goto('/items', { waitUntil: 'networkidle' });
      // Wait for the page to fully initialize (useEffect fetches items, sets tracked default)
      await page.getByLabel('Show tracked items only').waitFor({ state: 'visible', timeout: 5000 });
      // After tracking, showTrackedOnly defaults to true. Uncheck to see all items.
      await page.getByLabel('Show tracked items only').uncheck();
      await page.waitForTimeout(300);

      const trackedCard = page.locator('.card').filter({ hasText: firstTitle });
      await expect(trackedCard.locator('.badge', { hasText: 'tracked' })).toBeVisible();
    });
  });

  test('clicking item navigates to detail', async ({ page }) => {
    await page.getByLabel('Show tracked items only').uncheck();
    await page.waitForTimeout(200);
    const firstTitle = (await page.locator('.link-title').first().textContent()).trim();
    await page.locator('.link-title').first().click();
    await expect(page.locator('h1')).toContainText(firstTitle);
  });
});
