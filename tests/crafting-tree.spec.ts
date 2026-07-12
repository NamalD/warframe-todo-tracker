import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const wfcdCache = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/wfcd-cache.json'), 'utf8')
);

// Resolve items by name (IDs can shift across @wfcd/items versions)
const oraxia = wfcdCache.items.find((i) => i.name === 'Oraxia');
const ash = wfcdCache.items.find((i) => i.name === 'Ash');
const akbolto = wfcdCache.items.find((i) => i.name === 'Akbolto');

test.describe('Crafting tree UI', () => {
  test.beforeEach(async ({ page }) => {
    // Use the real dev server data — no API interception needed for
    // read-only item detail pages.
    await page.goto('/');
    await page.waitForTimeout(200);
  });

  test.describe('Oraxia (Warframe with manual component map)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/items/${oraxia.id}`);
      await page.waitForTimeout(500);
    });

    test('renders the crafting tree card', async ({ page }) => {
      await expect(page.locator('.card:has-text("Crafting Tree")')).toBeVisible();
    });

    test('shows expandable component nodes', async ({ page }) => {
      // Oraxia should have 3 component children: Neuroptics, Chassis, Systems
      const treeCard = page.locator('.card:has-text("Crafting Tree")');
      await expect(treeCard.locator('text=Oraxia Neuroptics').first()).toBeVisible();
      await expect(treeCard.locator('text=Oraxia Chassis').first()).toBeVisible();
      await expect(treeCard.locator('text=Oraxia Systems').first()).toBeVisible();
    });

    test('displays "Neuroptics" not "Helmet"', async ({ page }) => {
      const treeCard = page.locator('.card:has-text("Crafting Tree")');
      await expect(treeCard.locator('text=Oraxia Neuroptics').first()).toBeVisible();
      await expect(treeCard.locator('text=Oraxia Helmet')).toHaveCount(0);
    });

    test('shows component materials by default', async ({ page }) => {
      // Component nodes are expanded by default (expanded=true in useState)
      const treeCard = page.locator('.card:has-text("Crafting Tree")');
      await expect(treeCard.locator('text=Duviri Murmur Item A').first()).toBeVisible();
      await expect(treeCard.locator('text=Neural Sensor').first()).toBeVisible();
    });

    test('shows aggregated progress bar for intermediate nodes', async ({ page }) => {
      // The component row should have a progress bar below it
      const treeCard = page.locator('.card:has-text("Crafting Tree")');
      const progressBars = treeCard.locator('.progress-bar');
      const count = await progressBars.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  test.describe('Ash (Warframe)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/items/${ash.id}`);
      await page.waitForTimeout(500);
    });

    test('renders Ash crafting tree with 3 components', async ({ page }) => {
      const treeCard = page.locator('.card:has-text("Crafting Tree")');
      await expect(treeCard.locator('text=Ash Neuroptics').first()).toBeVisible();
      await expect(treeCard.locator('text=Ash Chassis').first()).toBeVisible();
      await expect(treeCard.locator('text=Ash Systems').first()).toBeVisible();
    });

    test('shows Ash Chassis materials by default', async ({ page }) => {
      const treeCard = page.locator('.card:has-text("Crafting Tree")');
      await expect(treeCard.locator('text=Morphic').first()).toBeVisible();
      await expect(treeCard.locator('text=Ferrite').first()).toBeVisible();
    });
  });

  test.describe('Akbolto (Weapon with auto-detected sub-components)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/items/${akbolto.id}`);
      await page.waitForTimeout(500);
    });

    test('renders Akbolto crafting tree with Bolto child', async ({ page }) => {
      const treeCard = page.locator('.card:has-text("Crafting Tree")');
      await expect(treeCard.locator('text=Bolto').first()).toBeVisible();
    });

    test('shows quantity multiplier for sub-component', async ({ page }) => {
      // Akbolto needs 2 Bolto
      const treeCard = page.locator('.card:has-text("Crafting Tree")');
      await expect(treeCard.locator('text=x2').first()).toBeVisible();
    });

    test('expanding Bolto shows its materials', async ({ page }) => {
      const treeCard = page.locator('.card:has-text("Crafting Tree")');
      // Bolto is already expanded by default
      await expect(treeCard.locator('text=Neurode').first()).toBeVisible();
      await expect(treeCard.locator('text=Polymer Bundle').first()).toBeVisible();
    });
  });

  test.describe('Item without a tree', () => {
    test('shows empty tree state for raw materials', async ({ page }) => {
      // Orokin Cell is a raw material with no sub-components
      const orokinCell = wfcdCache.items.find((i) => i.name === 'Orokin Cell');
      if (!orokinCell) {
        test.skip(true, 'Orokin Cell not found in cache');
        return;
      }
      await page.goto(`/items/${orokinCell.id}`);
      await page.waitForTimeout(500);
      // Should still render the card but with no children
      await expect(page.locator('.card:has-text("Crafting Tree")')).toBeVisible();
    });
  });
});
