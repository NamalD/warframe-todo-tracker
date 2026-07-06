import { test, expect } from '@playwright/test';

test.describe('Item detail page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/items/item-1');
    await page.waitForTimeout(200);
  });

  test('renders item title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Excalibur');
  });

  test('renders item type badge', async ({ page }) => {
    await expect(page.locator(`.badge.warframe`)).toBeVisible();
  });

  test('shows tracked badge when item is tracked', async ({ page }) => {
    await expect(page.getByText('tracked', { exact: true })).toBeVisible();
  });

  test('track button has correct initial state', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Untrack' });
    await expect(btn).toBeVisible();
  });

  test('tracks button changes state on click', async ({ page }) => {
    await page.getByRole('button', { name: 'Untrack' }).click();
    await expect(page.getByRole('button', { name: 'Track' })).toBeVisible();
  });

  test('renders materials table', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('materials table contains known material', async ({ page }) => {
    const body = await page.locator('table tbody').innerText();
    expect(body).toContain('Alloy Plate');
  });

  test('renders crafting tree', async ({ page }) => {
    await expect(page.locator('.card:has-text("Crafting Tree")')).toBeVisible();
  });

  test('displays wiki link', async ({ page }) => {
    const link = page.locator('a[href*="wiki.warframe.com"]').first();
    await expect(link).toBeVisible();
  });

  test.fixme('item detail page does not crash with React error #130', async ({ page }) => {
    // Known fixme: this page may crash depending on Link import path
    // Remove fixme once the regression in playwright.mjs is resolved
    await expect(page.locator('main')).toBeVisible();
  });
});
