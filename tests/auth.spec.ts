import { test, expect } from '@playwright/test';

const TEST_PASSWORD = 'test-password-123';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept login API to use a known test password
    await page.route('**/api/login', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.password === TEST_PASSWORD) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid password' }),
        });
      }
    });

    // Intercept logout API
    await page.route('**/api/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });
  });

  test('redirects unauthenticated users to login page', async ({ page }) => {
    // Clear any existing auth cookie
    await page.context().clearCookies();
    await page.goto('/todos');
    await page.waitForURL('**/login**');
    await expect(page.getByPlaceholder('Password')).toBeVisible();
  });

  test('redirects to login with redirect param preserving original path', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/items');
    await page.waitForURL('**/login**');
    const url = page.url();
    expect(url).toContain('redirect=%2Fitems');
  });

  test('shows login page with password input and sign in button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('shows error on invalid password', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Invalid password')).toBeVisible({ timeout: 5000 });
  });

  test('redirects to home on successful login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/');
    await expect(page.getByTestId('brand-link')).toBeVisible({ timeout: 5000 });
  });

  test('allows access to protected pages after login', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/');

    // Then navigate to a protected page
    await page.goto('/todos');
    await page.waitForLoadState('networkidle');
    // Should not be redirected to login
    expect(page.url()).not.toContain('/login');
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/');

    // Click sign out
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForURL('**/login**');
    await expect(page.getByPlaceholder('Password')).toBeVisible();
  });

  test('new browser context requires login', async ({ browser }) => {
    // Login in one context
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await page1.route('**/api/login', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.password === TEST_PASSWORD) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid password' }),
        });
      }
    });
    await page1.goto('/login');
    await page1.getByPlaceholder('Password').fill(TEST_PASSWORD);
    await page1.getByRole('button', { name: 'Sign In' }).click();
    await page1.waitForURL('**/');

    // Create a new context (simulates new device / private browsing)
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.route('**/api/login', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.password === TEST_PASSWORD) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid password' }),
        });
      }
    });
    await page2.goto('/todos');
    await page2.waitForURL('**/login**');
    await expect(page2.getByPlaceholder('Password')).toBeVisible();

    await context1.close();
    await context2.close();
  });
});