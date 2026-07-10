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

  test.describe('category filter', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByLabel('Show tracked items only').uncheck();
      await page.waitForTimeout(200);
    });

    test('renders category pill buttons', async ({ page }) => {
      await expect(page.getByTestId('category-filter')).toBeVisible();
      await expect(page.getByTestId('category-btn-warframe')).toBeVisible();
      await expect(page.getByTestId('category-btn-primary')).toBeVisible();
    });

    test('filters to a single category', async ({ page }) => {
      const allCount = await page.locator('.card').count();

      await page.getByTestId('category-btn-warframe').click();
      await page.waitForTimeout(200);

      const filteredCount = await page.locator('.card').count();
      expect(filteredCount).toBeLessThan(allCount);
      expect(filteredCount).toBeGreaterThan(0);
      // Verify only warframe cards are visible
      const warframeBadges = await page.locator('.card .badge.warframe').count();
      expect(warframeBadges).toBe(filteredCount);
    });

    test('supports multi-select with two categories', async ({ page }) => {
      await page.getByTestId('category-btn-warframe').click();
      await page.getByTestId('category-btn-primary').click();
      await page.waitForTimeout(200);

      const count = await page.locator('.card').count();
      expect(count).toBeGreaterThan(0);
      // Both selected categories should have visible items
      expect(await page.locator('.badge.warframe').count()).toBeGreaterThan(0);
      expect(await page.locator('.badge.primary').count()).toBeGreaterThan(0);
      // An unselected category should be excluded
      expect(await page.locator('.badge.melee').count()).toBe(0);
    });

    test('deselects on second click', async ({ page }) => {
      const allCount = await page.locator('.card').count();

      await page.getByTestId('category-btn-warframe').click();
      await page.waitForTimeout(100);
      // Verify filter actually applied
      const filtered = await page.locator('.card').count();
      expect(filtered).toBeLessThan(allCount);

      await page.getByTestId('category-btn-warframe').click();
      await page.waitForTimeout(200);

      const afterCount = await page.locator('.card').count();
      expect(afterCount).toBe(allCount);
    });

    test('Select All and Clear All buttons work', async ({ page }) => {
      const allCount = await page.locator('.card').count();

      // Select All — should show all items
      await page.getByTestId('category-select-all').click();
      await page.waitForTimeout(200);
      expect(await page.locator('.card').count()).toBe(allCount);

      // Clear All — should also show all items
      await page.getByTestId('category-clear-all').click();
      await page.waitForTimeout(200);
      expect(await page.locator('.card').count()).toBe(allCount);
    });

    test('combines category filter with search text', async ({ page }) => {
      await page.getByTestId('category-btn-warframe').click();
      await page.waitForTimeout(100);

      const input = page.getByPlaceholder('Search items by name...');
      await input.fill('excalibur');
      await page.waitForTimeout(200);

      // Only Excalibur (warframe) visible
      expect(await page.locator('.card').count()).toBe(1);
      await expect(page.getByText('Excalibur')).toBeVisible();
    });
  });
});
