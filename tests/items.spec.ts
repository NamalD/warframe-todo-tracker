import { test, expect } from '@playwright/test';

test.describe('Items list page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/items');
    await page.waitForTimeout(200);
  });

  test.describe('card rendering', () => {
    // These tests exercise the general list, not tracked-only filtering —
    // a fresh browser context starts with nothing tracked, and the list
    // defaults to tracked-only (#1), so uncheck it first.
    test.beforeEach(async ({ page }) => {
      await page.getByLabel('Show tracked items only').uncheck();
      await page.waitForTimeout(200);
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
    test('checkbox limits visible cards', async ({ page }) => {
      // Start from the full list so checking actually reduces the count —
      // a fresh context has zero tracked items, so the default (checked)
      // state already shows zero cards.
      await page.getByLabel('Show tracked items only').uncheck();
      await page.waitForTimeout(200);
      const allCards = await page.locator('.card').count();

      await page.getByLabel('Show tracked items only').check();
      await page.waitForTimeout(300);
      const filtered = await page.locator('.card').count();
      expect(filtered).toBeLessThan(allCards);
    });

    test('unchecking restores full list', async ({ page }) => {
      await page.getByLabel('Show tracked items only').check();
      await page.waitForTimeout(200);
      await page.getByLabel('Show tracked items only').uncheck();
      await page.waitForTimeout(200);
      const allCards = await page.locator('.card').count();
      expect(allCards).toBeGreaterThan(5);
    });

    test('shows an empty-state message when nothing is tracked', async ({ page }) => {
      // Default state: tracked-only checked, fresh context has nothing tracked.
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

      await page.goto('/items');
      await page.waitForTimeout(200);
      await page.getByLabel('Show tracked items only').uncheck();
      await page.waitForTimeout(200);

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
