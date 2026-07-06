import { test, expect } from '@playwright/test';

test.describe('Items list page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/items');
    await page.waitForTimeout(200);
  });

  test.describe('card rendering', () => {
    test('renders item cards', async ({ page }) => {
      const count = await page.locator('.card').count();
      expect(count).toBeGreaterThan(0);
    });

    test('displays item names', async ({ page }) => {
      const titles = await page.locator('.link-title').allTextContents();
      expect(titles.length).toBeGreaterThan(0);
      expect(titles[0]).toBe('Excalibur');
    });

    test('displays mastery rank badges', async ({ page }) => {
      const mr = await page.locator('.muted').filter({ hasText: /^MR \d+$/ }).allTextContents();
      expect(mr.length).toBeGreaterThan(0);
    });
  });

  test.describe('tracked-only filter', () => {
    test('checkbox limits visible cards', async ({ page }) => {
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
  });

  test.describe('badges', () => {
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
      const tracked = page.locator('.card').filter({ has: page.getByText('tracked', { exact: true }) }).first();
      await expect(tracked).toBeVisible();
    });
  });

  test('clicking item navigates to detail', async ({ page }) => {
    await page.locator('.link-title').first().click();
    await expect(page).toHaveURL(/\/items\/item-1/);
    await expect(page.locator('h1')).toContainText('Excalibur');
  });
});
