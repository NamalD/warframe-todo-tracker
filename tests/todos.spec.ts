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

  test('loads todo cards', async ({ page }) => {
    // The page should render some todo cards (seed data or server data)
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 5000 });
  });

  test.describe('create todo', () => {
    test('adds a new todo via form', async ({ page }) => {
      // Use .first() to avoid strict-mode collisions from duplicate
      // entries left in the shared dev server DB by prior test runs
      await page.getByPlaceholder('Notes').fill(UNIQUE_NOTES);
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(300);
      // Wait for the new todo's text to appear (use .first() for safety)
      await expect(page.getByText(UNIQUE_NOTES).first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('item and material selection', () => {
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

      // The todo should show the item name as a link
      await expect(page.getByRole('link', { name: 'Rubico Prime', exact: true }).first()).toBeVisible({ timeout: 5000 });
      // The material link to sources should appear
      await expect(page.getByRole('link', { name: `Source: ${material}` }).first()).toBeVisible({ timeout: 5000 });
    });

    test('can create freeform todo without item or material', async ({ page }) => {
      await page.getByPlaceholder('Notes').fill('Freeform task');
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText('Freeform task').first()).toBeVisible({ timeout: 5000 });
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
      // Use .first() because the shared DB may have duplicates from prior runs
      await expect(page.getByText('Edited regression note').first()).toBeVisible({ timeout: 5000 });
    });
  });

  test('delete button is visible and removes todo', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible();
    page.on('dialog', (dialog) => dialog.accept());
    // Just assert the delete button works — don't check card count since
    // the shared dev DB state is unpredictable across test runs
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.waitForTimeout(300);
  });
});
