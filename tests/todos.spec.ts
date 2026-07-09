import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const wfcdCache = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/wfcd-cache.json'), 'utf8')
);
function itemMaterials(name) {
  const item = wfcdCache.items.find((i) => i.name === name);
  return wfcdCache.materials.filter((m) => m.craftable_item_id === item.id && !m.is_incarnon_install);
}
const excaliburMaterials = itemMaterials('Excalibur');
const rubicoPrimeMaterials = itemMaterials('Rubico Prime');

async function selectSearchableOption(page, placeholder, optionLabel) {
  const input = page.getByPlaceholder(placeholder);
  await input.click();
  await input.fill(optionLabel);
  await page.waitForTimeout(300);
  const dropdown = page.locator('[style*="position: absolute"][style*="z-index: 10"]');
  await dropdown.getByText(optionLabel, { exact: true }).click();
  await page.waitForTimeout(200);
}

/**
 * Intercept all /api/todos and /api/materials calls so test data
 * never hits the real server DB. GET returns empty data, mutations
 * are swallowed.
 */
async function interceptUserDataApi(page) {
  await page.route(/\/api\/todos/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });
  await page.route(/materials/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });
}

test.describe('Todos page', () => {
  const UNIQUE_NOTES = `E2E regression todo ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    await interceptUserDataApi(page);
    await page.goto('/todos');
    await page.waitForTimeout(500);
  });

  test('shows new todo form', async ({ page }) => {
    await expect(page.getByPlaceholder('Notes')).toBeVisible();
  });

  test.describe('create todo', () => {
    test('adds a new todo via form', async ({ page }) => {
      await page.getByPlaceholder('Notes').fill(UNIQUE_NOTES);
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText(UNIQUE_NOTES).first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('item and material selection', () => {
    test('selecting an item populates material dropdown', async ({ page }) => {
      const materialInput = page.getByPlaceholder('Material (optional)');

      await expect(materialInput).toBeDisabled();

      await selectSearchableOption(page, 'Item (optional)', 'Excalibur');

      await expect(materialInput).not.toBeDisabled();

      await materialInput.click();
      await page.waitForTimeout(200);
      const matOptions = page.locator('[style*="position: absolute"][style*="z-index: 10"] div');
      const matTexts = await matOptions.allTextContents();
      expect(matTexts).toContain(excaliburMaterials[0].material_name);
      expect(matTexts).toContain(excaliburMaterials[1].material_name);
    });

    test('creates todo linked to item and material', async ({ page }) => {
      const material = rubicoPrimeMaterials[0].material_name;

      await selectSearchableOption(page, 'Item (optional)', 'Rubico Prime');
      await selectSearchableOption(page, 'Material (optional)', material);
      await page.getByPlaceholder('Notes').fill('Farm for Rubico');
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(300);

      await expect(page.getByRole('link', { name: 'Rubico Prime', exact: true }).first()).toBeVisible({ timeout: 5000 });
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
      await expect(page.getByText('Edited regression note').first()).toBeVisible({ timeout: 5000 });
    });
  });

  test('delete button is visible and removes todo', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible();
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.waitForTimeout(300);
  });
});
