import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Issue #43: every page must render without page-level horizontal overflow at
// mobile width. Wide tables scroll inside their own `.table-scroll` container
// instead of stretching (item detail, sources) or clipping (shopping list)
// the page.
const wfcdCache = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/wfcd-cache.json'), 'utf8')
);
// Resolve by name, not hardcoded id (ids shift across prebuild regenerations, see #12).
// Cobra & Crane Prime has long component names that force the materials table
// wider than a 375px viewport, which is exactly the case under test.
const wideItem = wfcdCache.items.find((i) => i.name === 'Cobra & Crane Prime');

async function interceptUserDataApi(page: Page) {
  for (const pattern of [/\/api\/materials/, /\/api\/user-items/, /\/api\/todos/]) {
    await page.route(pattern, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      }
    });
  }
}

function pageOverflowPx(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

test.describe('Mobile layout (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await interceptUserDataApi(page);
  });

  test('item detail with a wide materials table does not overflow the page', async ({ page }) => {
    await page.goto(`/items/${wideItem.id}`);
    await expect(page.locator('h1')).toContainText('Cobra & Crane Prime');

    // The table renders wider than the viewport but scrolls inside its card…
    const scroller = page.locator('.table-scroll').first();
    await expect(scroller.locator('table')).toBeVisible();
    // …so the page itself must not scroll horizontally.
    expect(await pageOverflowPx(page)).toBeLessThanOrEqual(0);

    // The Sources column is reachable by scrolling the container.
    const reachable = await scroller.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
      return el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    });
    expect(reachable).toBe(true);
    await expect(scroller.getByText('View sources').first()).toBeVisible();
  });

  test('sources page tables do not overflow the page', async ({ page }) => {
    await page.goto('/sources');
    await expect(page.locator('h1')).toContainText('Sources');
    await expect(page.locator('.table-scroll table').first()).toBeVisible();
    expect(await pageOverflowPx(page)).toBeLessThanOrEqual(0);
  });

  test('long wiki URL wraps instead of widening the item detail page', async ({ page }) => {
    await page.goto(`/items/${wideItem.id}`);
    const wikiLink = page.getByRole('link', { name: /wiki\.warframe\.com/ });
    await expect(wikiLink).toBeVisible();
    const box = await wikiLink.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});
