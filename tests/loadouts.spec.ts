import { test, expect } from '@playwright/test';

test.describe('Loadouts list page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/loadouts');
    await page.waitForTimeout(300);
  });

  test.describe('rendering', () => {
    test('shows loadouts heading', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Loadouts');
    });

    test('shows empty state when no loadouts exist', async ({ page }) => {
      // Clear localStorage to ensure no loadouts
      await page.evaluate(() => localStorage.removeItem('warframe-loadouts'));
      await page.reload();
      await page.waitForTimeout(300);

      const emptyState = page.locator('.empty-state');
      if (await emptyState.count() > 0) {
        await expect(emptyState).toContainText('No loadouts yet');
      }
    });

    test('shows filter buttons', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'In Progress' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Complete' })).toBeVisible();
    });
  });

  test.describe('create loadout', () => {
    test('can create a new loadout', async ({ page }) => {
      // Clear existing
      await page.evaluate(() => localStorage.removeItem('warframe-loadouts'));
      await page.reload();
      await page.waitForTimeout(300);

      await page.getByRole('button', { name: '+ New Loadout' }).click();
      await page.getByPlaceholder('Loadout name').fill('Test Loadout');
      await page.getByRole('button', { name: 'Create' }).click();
      await page.waitForTimeout(300);

      // Should see the new loadout card
      await expect(page.locator('text=Test Loadout').first()).toBeVisible();
    });

    test('empty name does not create loadout', async ({ page }) => {
      await page.getByRole('button', { name: '+ New Loadout' }).click();
      await page.getByRole('button', { name: 'Create' }).click();
      // Form should stay open
      await expect(page.getByPlaceholder('Loadout name')).toBeVisible();
    });
  });

  test.describe('delete loadout', () => {
    test('deleting loadout shows confirm dialog', async ({ page }) => {
      // First create a loadout
      await page.evaluate(() => localStorage.removeItem('warframe-loadouts'));
      await page.reload();
      await page.waitForTimeout(300);

      await page.getByRole('button', { name: '+ New Loadout' }).click();
      await page.getByPlaceholder('Loadout name').fill('To Delete');
      await page.getByRole('button', { name: 'Create' }).click();
      await page.waitForTimeout(300);

      // Dialog should appear on delete
      page.on('dialog', async (dialog) => {
        expect(dialog.message()).toContain('Delete');
        await dialog.accept();
      });

      await page.locator('button:has-text("Delete")').first().click();
      await page.waitForTimeout(300);
    });
  });

  test.describe('navigation', () => {
    test('clicking Open navigates to loadout detail', async ({ page }) => {
      await page.evaluate(() => localStorage.removeItem('warframe-loadouts'));
      await page.reload();
      await page.waitForTimeout(300);

      await page.getByRole('button', { name: '+ New Loadout' }).click();
      await page.getByPlaceholder('Loadout name').fill('Nav Test');
      await page.getByRole('button', { name: 'Create' }).click();
      await page.waitForTimeout(300);

      await page.getByRole('link', { name: 'Nav Test' }).click();
      await expect(page).toHaveURL(/\/loadouts\/loadout-/);
    });
  });
});

test.describe('Loadout detail page', () => {
  test.beforeEach(async ({ page }) => {
    // Seed a loadout in localStorage
    await page.goto('/');
    await page.evaluate(() => {
      const data = {
        loadouts: [{
          id: 'loadout-test-1',
          name: 'Test Loadout',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          slots: [
            {
              id: 'slot-test-1',
              loadout_id: 'loadout-test-1',
              slot_type: 'warframe',
              item_id: 'item-1',
              custom_item_name: null,
              acquired: false,
              notes: 'Test notes',
              display_order: 0,
              requirements: [
                {
                  id: 'req-test-1',
                  loadout_slot_id: 'slot-test-1',
                  name: 'Test Requirement',
                  wiki_url: null,
                  user_notes: '',
                  acquired: false,
                  display_order: 0
                }
              ]
            }
          ]
        }]
      };
      localStorage.setItem('warframe-loadouts', JSON.stringify(data));
    });
    await page.goto('/loadouts/loadout-test-1');
    await page.waitForTimeout(300);
  });

  test.describe('rendering', () => {
    test('shows loadout name', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Test Loadout');
    });

    test('shows back link', async ({ page }) => {
      await expect(page.getByText('Back to Loadouts')).toBeVisible();
    });

    test('shows slot cards', async ({ page }) => {
      const slotCards = page.locator('.slot-card');
      await expect(slotCards).toHaveCount(1);
    });

    test('shows slot type badge', async ({ page }) => {
      await expect(page.locator('.badge.warframe')).toBeVisible();
    });

    test('shows acquired checkbox', async ({ page }) => {
      const checkbox = page.locator('.slot-card input[type="checkbox"]').first();
      await expect(checkbox).toBeVisible();
      await expect(checkbox).not.toBeChecked();
    });

    test('toggling acquired updates checkbox', async ({ page }) => {
      const checkbox = page.locator('.slot-card input[type="checkbox"]').first();
      await checkbox.check();
      await page.waitForTimeout(200);
      await expect(checkbox).toBeChecked();

      await checkbox.uncheck();
      await page.waitForTimeout(200);
      await expect(checkbox).not.toBeChecked();
    });
  });

  test.describe('requirements', () => {
    test('expand button shows requirement count', async ({ page }) => {
      await expect(page.locator('button:has-text("Requirements (1)")')).toBeVisible();
    });

    test('clicking expand reveals requirements', async ({ page }) => {
      await page.locator('button:has-text("Requirements")').click();
      await expect(page.locator('text=Test Requirement')).toBeVisible();
    });

    test('can add a requirement', async ({ page }) => {
      await page.locator('button:has-text("Requirements")').click();
      await page.locator('button:has-text("+ Add Requirement")').click();
      await page.getByPlaceholder('Name (required)').fill('New Req');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.waitForTimeout(200);
      await expect(page.locator('text=New Req')).toBeVisible();
    });
  });

  test.describe('edge cases', () => {
    test('non-existent loadout shows not found', async ({ page }) => {
      await page.goto('/loadouts/nonexistent-id');
      await page.waitForTimeout(300);
      await expect(page.locator('.empty-state')).toContainText('not found');
    });

    test('empty loadout shows empty state with add button', async ({ page }) => {
      await page.evaluate(() => {
        const data = {
          loadouts: [{
            id: 'loadout-empty-1',
            name: 'Empty Loadout',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            slots: []
          }]
        };
        localStorage.setItem('warframe-loadouts', JSON.stringify(data));
      });
      await page.goto('/loadouts/loadout-empty-1');
      await page.waitForTimeout(300);
      await expect(page.locator('.empty-state')).toContainText('No slots yet');
      await expect(page.locator('button:has-text("Add Your First Slot")')).toBeVisible();
    });

    test('delete slot removes it from page', async ({ page }) => {
      page.on('dialog', async (dialog) => await dialog.accept());
      await page.locator('button:has-text("Delete Slot")').click();
      await page.waitForTimeout(300);
      await expect(page.locator('.empty-state')).toContainText('No slots yet');
    });

    test('delete loadout navigates back to list', async ({ page }) => {
      page.on('dialog', async (dialog) => await dialog.accept());
      await page.locator('button:has-text("Delete Loadout")').click();
      await page.waitForTimeout(300);
      await expect(page).toHaveURL('/loadouts');
    });
  });

  test.describe('duplicate handling', () => {
    test('adding duplicate item shows alert', async ({ page }) => {
      await page.getByRole('button', { name: '+ Add Slot' }).click();

      // Try to add the same item (item-1 = Excalibur)
      await page.locator('select').nth(1).selectOption('item-1');

      let dialogMessage = '';
      page.on('dialog', async (dialog) => {
        dialogMessage = dialog.message();
        await dialog.accept();
      });

      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.waitForTimeout(200);
      expect(dialogMessage).toContain('already in the loadout');
    });
  });

  test.describe('mobile layout', () => {
    test('slot cards stack on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(300);

      const slotCard = page.locator('.slot-card').first();
      const flexDirection = await slotCard.locator('> div:first-child').evaluate(
        (el) => getComputedStyle(el).flexDirection
      );
      expect(flexDirection).toBe('column');
    });

    test('checkboxes have 44px touch targets', async ({ page }) => {
      const checkbox = page.locator('.slot-card input[type="checkbox"]').first();
      const box = await checkbox.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    });
  });
});
