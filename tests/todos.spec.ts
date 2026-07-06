import { test, expect } from '@playwright/test';

test.describe('Todos page', () => {
  const UNIQUE_NOTES = `E2E regression todo ${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    await page.goto('/todos');
    await page.waitForTimeout(300);
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
    test('item dropdown lists craftable items', async ({ page }) => {
      const itemSelect = page.locator('select').first();
      const options = await itemSelect.locator('option').allTextContents();
      expect(options).toContain('Item (optional)');
      expect(options).toContain('Excalibur');
      expect(options).toContain('Mesa');
      expect(options).toContain('Kronen Prime');
    });

    test('selecting an item populates material dropdown', async ({ page }) => {
      const selects = page.locator('select');
      const itemSelect = selects.nth(0);
      const materialSelect = selects.nth(1);

      // Before selecting anything, material dropdown should be disabled
      await expect(materialSelect).toBeDisabled();

      // Select Excalibur
      await itemSelect.selectOption('item-1');
      await page.waitForTimeout(200);

      // Material dropdown should now be enabled and have options
      await expect(materialSelect).not.toBeDisabled();
      const matOptions = await materialSelect.locator('option').allTextContents();
      expect(matOptions).toContain('Material (optional)');
      expect(matOptions).toContain('Alloy Plate');
      expect(matOptions).toContain('Polymer Bundle');
    });

    test('creates todo linked to item and material', async ({ page }) => {
      const selects = page.locator('select');
      await selects.nth(0).selectOption('item-4'); // Rubico Prime
      await page.waitForTimeout(200);
      await selects.nth(1).selectOption('Argon Crystal');
      await page.getByPlaceholder('Notes').fill('Farm Argon for Rubico');
      await page.getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(300);

      // The todo should show the item name as a link — check the last card added
      const todoCards = page.locator('.card');
      const lastCard = todoCards.last();
      await expect(lastCard.getByRole('link', { name: 'Rubico Prime' })).toBeVisible();
      // The material link to sources should appear
      await expect(lastCard.getByRole('link', { name: 'Source: Argon Crystal' })).toBeVisible();

      // Verify localStorage has the linked data
      const data = await page.evaluate(() => localStorage.getItem('warframe-todos'));
      const todos = JSON.parse(data || '[]');
      const created = todos.find((t) => t.user_notes === 'Farm Argon for Rubico');
      expect(created).toBeTruthy();
      expect(created.craftable_item_id).toBe('item-4');
      expect(created.linked_material_name).toBe('Argon Crystal');
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
