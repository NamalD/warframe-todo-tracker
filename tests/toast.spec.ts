import { test, expect } from '@playwright/test';

/**
 * End-to-end coverage for the toast/notification system (issue #52).
 * Drives a real sync failure through the UI and asserts the toast surfaces,
 * then verifies it can be manually dismissed.
 */
test.describe('Toast notifications', () => {
  async function routeTodos(page, mutationStatus: number) {
    // GET returns an empty list; the save (PUT) responds with the given status.
    await page.route(/\/api\/todos/, async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      } else {
        await route.fulfill({ status: mutationStatus, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
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

  test('surfaces an error toast when a save fails', async ({ page }) => {
    await routeTodos(page, 500);
    await page.goto('/todos');
    await page.waitForTimeout(300);

    await page.getByPlaceholder('Notes').fill('Trigger a failed save');
    await page.getByRole('button', { name: 'Add' }).click();

    const toast = page.getByTestId('toast');
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast).toContainText("Couldn't save your to-do changes");
    await expect(toast).toHaveAttribute('data-toast-type', 'error');
  });

  test('the error toast can be dismissed manually', async ({ page }) => {
    await routeTodos(page, 500);
    await page.goto('/todos');
    await page.waitForTimeout(300);

    await page.getByPlaceholder('Notes').fill('Another failed save');
    await page.getByRole('button', { name: 'Add' }).click();

    const toast = page.getByTestId('toast');
    await expect(toast).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(toast).toHaveCount(0);
  });

  test('no toast appears when the save succeeds', async ({ page }) => {
    await routeTodos(page, 200);
    await page.goto('/todos');
    await page.waitForTimeout(300);

    await page.getByPlaceholder('Notes').fill('Successful save');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('toast')).toHaveCount(0);
  });
});
