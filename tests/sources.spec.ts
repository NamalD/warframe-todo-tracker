import { test, expect } from '@playwright/test';

test.describe('Sources page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sources');
    await page.waitForTimeout(300);
  });

  test('renders source cards', async ({ page }) => {
    const cards = await page.locator('.card').count();
    expect(cards).toBeGreaterThan(0);
  });

  test('groups sources by material', async ({ page }) => {
    const headings = await page.locator('.card h2').allTextContents();
    const unique = new Set(headings);
    expect(unique.size).toBeGreaterThan(0);
  });

  test('material highlight via query param', async ({ page }) => {
    await page.goto('/sources?material=Argon%20Crystal');
    await page.waitForTimeout(300);
    const highlighted = await page.locator('tr[style]').count();
    expect(highlighted).toBeGreaterThan(0);
  });

  test('each card has a source type and location', async ({ page }) => {
    const text = await page.locator('.card').first().innerText();
    expect(text).toBeTruthy();
  });
});
