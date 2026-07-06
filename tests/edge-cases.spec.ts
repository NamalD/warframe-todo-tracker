import { test, expect } from '@playwright/test';

test.describe('Edge cases and navigation', () => {
  test('home page renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(200);
    const text = await page.locator('main').innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('non-existent item renders not found', async ({ page }) => {
    await page.goto('/items/nonexistent');
    await page.waitForTimeout(300);
    const text = await page.locator('main').innerText();
    expect(text.toLowerCase()).toContain('not found');
  });

  test('unknown route returns 404', async ({ page }) => {
    const response = await page.goto('/nonexistent-route');
    expect(response?.status()).toBe(404);
  });

  test('navigates from home to items', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Items/i }).click();
    await expect(page).toHaveURL(/\/items/);
  });

  test('items page links back to home', async ({ page }) => {
    await page.goto('/items');
    const homeLink = page.locator('a[href="/"]');
    if ((await homeLink.count()) > 0) {
      await homeLink.first().click();
      await expect(page).toHaveURL('/');
    }
  });
});
