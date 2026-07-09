import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Item IDs are assigned by prebuild.mjs in @wfcd/items iteration order, which
// isn't guaranteed stable across package versions/regenerations (see #12) —
// resolve Excalibur's current id/materials by name instead of hardcoding IDs.
const wfcdCache = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/wfcd-cache.json'), 'utf8')
);
const excalibur = wfcdCache.items.find((i) => i.name === 'Excalibur');
const excaliburMaterials = wfcdCache.materials.filter(
  (m) => m.craftable_item_id === excalibur.id && !m.is_incarnon_install
);

test.describe('Item detail page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/items/${excalibur.id}`);
    await page.waitForTimeout(200);
    // Reference data always starts untracked — normalize to tracked so the
    // rest of this suite (which exercises the Untrack path) has a
    // deterministic starting state.
    const trackBtn = page.getByRole('button', { name: 'Track' });
    if (await trackBtn.isVisible().catch(() => false)) {
      await trackBtn.click();
      await expect(page.getByRole('button', { name: 'Untrack' })).toBeVisible();
    }
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

  test('track button changes state on click', async ({ page }) => {
    await page.getByRole('button', { name: 'Untrack' }).click();
    await expect(page.getByRole('button', { name: 'Track' })).toBeVisible();
  });

  test('track/untrack persists across navigation to items list and back', async ({ page }) => {
    // Untrack Excalibur
    await page.getByRole('button', { name: 'Untrack' }).click();
    await expect(page.getByRole('button', { name: 'Track' })).toBeVisible();

    // Navigate to items list — but Excalibur is now untracked, and the list
    // defaults to tracked-only, so uncheck that filter to find it.
    await page.goto('/items');
    await page.waitForTimeout(200);
    await page.getByRole('checkbox').uncheck();
    const itemCard = page.locator('.card').filter({ has: page.locator(`a.link-title[href="/items/${excalibur.id}"]`) });
    await expect(itemCard).toBeVisible();
    await expect(itemCard.locator('.badge', { hasText: 'tracked' })).toHaveCount(0);

    // Navigate back to item detail — button should still say "Track"
    await itemCard.locator('.link-title').click();
    await expect(page).toHaveURL(new RegExp(`/items/${excalibur.id}$`));
    await expect(page.getByRole('button', { name: 'Track' })).toBeVisible();
  });

  test('track/untrack persists across page reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Untrack' }).click();
    await expect(page.getByRole('button', { name: 'Track' })).toBeVisible();

    await page.reload();
    await page.waitForTimeout(200);
    await expect(page.getByRole('button', { name: 'Track' })).toBeVisible();
    await expect(page.locator('.badge', { hasText: 'tracked' })).toHaveCount(0);
  });

  test('renders materials table', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('materials table contains known material', async ({ page }) => {
    const body = await page.locator('table tbody').innerText();
    expect(body).toContain(excaliburMaterials[0].material_name);
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

test.describe('Incarnon Genesis install tracking', () => {
  const gorgon = wfcdCache.items.find((i) => i.name === 'Gorgon');

  test.beforeEach(async ({ page }) => {
    await page.goto(`/items/${gorgon.id}`);
    await page.waitForTimeout(200);
  });

  test('shows Incarnon Genesis Install card for Gorgon', async ({ page }) => {
    await expect(page.locator('.card:has-text("Incarnon Genesis Install")')).toBeVisible();
  });

  test('Incarnon materials are hidden until tracked', async ({ page }) => {
    const card = page.locator('.card:has-text("Incarnon Genesis Install")');
    await expect(card.getByText('Not tracked.')).toBeVisible();
    await expect(card.locator('table')).toHaveCount(0);
  });

  test('tracking Incarnon install reveals its materials table', async ({ page }) => {
    const card = page.locator('.card:has-text("Incarnon Genesis Install")');
    await card.getByRole('button', { name: 'Track' }).click();
    await expect(card.locator('table')).toBeVisible();
    await expect(card.getByText('Pathos Clamp')).toBeVisible();
    await expect(card.getByText('Rune Marrow')).toBeVisible();
    await expect(card.getByText('Tasoma Extract')).toBeVisible();
  });

  test('Incarnon materials do not appear in the base Required Materials table', async ({ page }) => {
    const requiredCard = page.locator('.card:has-text("Required Materials")');
    await expect(requiredCard.getByText('Pathos Clamp')).toHaveCount(0);
  });

  test('Incarnon tracking persists across reload', async ({ page }) => {
    const card = page.locator('.card:has-text("Incarnon Genesis Install")');
    await card.getByRole('button', { name: 'Track' }).click();
    await expect(card.getByRole('button', { name: 'Untrack' })).toBeVisible();

    await page.reload();
    await page.waitForTimeout(200);
    const reloadedCard = page.locator('.card:has-text("Incarnon Genesis Install")');
    await expect(reloadedCard.getByRole('button', { name: 'Untrack' })).toBeVisible();
    await expect(reloadedCard.locator('table')).toBeVisible();
  });

  test('does not show Incarnon Genesis Install card for items without it', async ({ page }) => {
    await page.goto(`/items/${excalibur.id}`);
    await page.waitForTimeout(200);
    await expect(page.locator('.card:has-text("Incarnon Genesis Install")')).toHaveCount(0);
  });
});
