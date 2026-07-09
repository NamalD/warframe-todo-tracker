import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Item IDs are assigned by prebuild.mjs in @wfcd/items iteration order, which
// isn't guaranteed stable across package versions/regenerations (see #12) —
// resolve by name against the actual generated cache instead of hardcoding IDs.
const wfcdCache = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/wfcd-cache.json'), 'utf8')
);
function itemMaterials(name) {
  const item = wfcdCache.items.find((i) => i.name === name);
  return wfcdCache.materials.filter((m) => m.craftable_item_id === item.id && !m.is_incarnon_install);
}
const excaliburMaterials = itemMaterials('Excalibur');
const rubicoPrimeMaterials = itemMaterials('Rubico Prime');

/**
 * Select an option in a SearchableSelect by typing to filter then clicking.
 * Uses the input's placeholder text to find the right component.
 */
async function selectSearchableOption(page, placeholder, optionLabel) {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(optionLabel);
  // Wait for dropdown to appear with filtered options
  await page.waitForTimeout(300);
  // Click the option by text inside the dropdown only (exact match)
  const dropdown = page.locator('[style*="position: absolute"][style*="z-index: 10"]');
  await dropdown.getByText(optionLabel, { exact: true }).click();
  await page.waitForTimeout(200);
}

test.describe('Todos page', () => {
  const UNIQUE_NOTES = `E2E regression todo ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    await page.goto('/todos');
    await page.waitForTimeout(500);
  });

  test('loads seed todos', async ({ page }) => {
    const cards = page.locator('.card');
    expect(await cards.count()).toBeGreaterThan(2);
  });

  test.describe('create todo', () => {
    test('adds a new todo via form', async ({ page }) => {
      const before = await page.locator('.card').count();
      await page.getByPlaceholder('Notes').fill(UNIQUE_NOTES);
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(300);
      const after = await page.locator('.card').count();
      expect(after).toBeGreaterThan(before);
    });

    test('new todo text appears in list', async ({ page }) => {
      await page.getByPlaceholder('Notes').fill(UNIQUE_NOTES);
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText(UNIQUE_NOTES)).toBeVisible();
    });
  });

  test.describe('item and material selection', () => {
    test('item searchable select lists craftable items', async ({ page }) => {
      // Focus the item SearchableSelect to open the dropdown
      const itemInput = page.getByPlaceholder('Item (optional)');
      await itemInput.click();
      await page.waitForTimeout(200);
      // The dropdown should show items
      const dropdownOptions = page.locator('[style*="position: absolute"][style*="z-index: 10"] div');
      const texts = await dropdownOptions.allTextContents();
      expect(texts).toContain('Excalibur');
      expect(texts).toContain('Mesa');
      expect(texts).toContain('Kronen Prime');
      // Close by clicking elsewhere
      await page.locator('h1').click();
    });

    test('selecting an item populates material dropdown', async ({ page }) => {
      const materialInput = page.getByPlaceholder('Material (optional)');

      // Before selecting anything, material dropdown should be disabled
      await expect(materialInput).toBeDisabled();

      // Select Excalibur via the SearchableSelect
      await selectSearchableOption(page, 'Item (optional)', 'Excalibur');

      // Material dropdown should now be enabled
      await expect(materialInput).not.toBeDisabled();

      // Open material dropdown to check options
      await materialInput.click();
      await page.waitForTimeout(200);
      const matOptions = page.locator('[style*="position: absolute"][style*="z-index: 10"] div');
      const matTexts = await matOptions.allTextContents();
      expect(matTexts).toContain(excaliburMaterials[0].material_name);
      expect(matTexts).toContain(excaliburMaterials[1].material_name);
    });

    test('creates todo linked to item and material', async ({ page }) => {
      const material = rubicoPrimeMaterials[0].material_name;

      // Select Rubico Prime
      await selectSearchableOption(page, 'Item (optional)', 'Rubico Prime');

      // Select material
      await selectSearchableOption(page, 'Material (optional)', material);

      // Add the todo
      await page.getByPlaceholder('Notes').fill('Farm for Rubico');
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(300);

      // The todo should show the item name as a link — check the last card added
      const todoCards = page.locator('.card');
      const lastCard = todoCards.last();
      await expect(lastCard.getByRole('link', { name: 'Rubico Prime', exact: true })).toBeVisible();
      // The material link to sources should appear
      await expect(lastCard.getByRole('link', { name: `Source: ${material}` })).toBeVisible();

      // Verify localStorage has the linked data
      const data = await page.evaluate(() => localStorage.getItem('warframe-todos'));
      const todos = JSON.parse(data || '[]');
      const created = todos.find((t) => t.user_notes === 'Farm for Rubico');
      expect(created).toBeTruthy();
      expect(created.craftable_item_id).toBe(wfcdCache.items.find((i) => i.name === 'Rubico Prime').id);
      expect(created.linked_material_name).toBe(material);
    });

    test('can create freeform todo without item or material', async ({ page }) => {
      await page.getByPlaceholder('Notes').fill('Freeform task');
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(300);

      const data = await page.evaluate(() => localStorage.getItem('warframe-todos'));
      const todos = JSON.parse(data || '[]');
      const created = todos.find((t) => t.user_notes === 'Freeform task');
      expect(created).toBeTruthy();
      expect(created.craftable_item_id).toBe(null);
      expect(created.linked_material_name).toBe(null);
    });
  });

  test.describe('edit todo', () => {
    test('edits a todo', async ({ page }) => {
      await page.getByRole('button', { name: 'Edit' }).first().click();
      await page.waitForTimeout(200);
      const textarea = page.locator('textarea').first();
      await textarea.fill('Edited regression note');
      await page.getByRole('button', { name: 'Save' }).first().click();
      await page.waitForTimeout(300);
      await expect(page.getByText('Edited regression note')).toBeVisible();
    });
  });

  test('delete button is visible and removes todo', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible();
    const before = await page.locator('.card').count();
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.waitForTimeout(300);
    const after = await page.locator('.card').count();
    expect(after).toBe(before - 1);
  });

  test.describe('localStorage persistence', () => {
    test('adds todo to localStorage', async ({ page }) => {
      await page.getByPlaceholder('Notes').fill('localStorage check');
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(200);
      const data = await page.evaluate(() => localStorage.getItem('warframe-todos'));
      expect(JSON.parse(data || '[]').some((t) => t.user_notes === 'localStorage check')).toBe(true);
    });

    test('todos survive page reload', async ({ page }) => {
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('warframe-todos') || '[]').length);
      await page.getByPlaceholder('Notes').fill('Reload survivor');
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(200);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      await expect(page.getByText('Reload survivor')).toBeVisible();
    });
  });
});
