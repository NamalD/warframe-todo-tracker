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

  test.fixme('delete button is visible and removes todo', async ({ page }) => {
    // Known fixme: no delete button implemented
    await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible();
  });
});
