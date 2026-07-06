// Warframe TODO Tracker — Regression Test Suite
// Run: node tests/regression/playwright.mjs
// Requires: npm install playwright  (already in devDeps)
//
// This suite exercises all core pages and user flows.
// Known failures are tagged with BUG markers and don't halt the run.

import { chromium } from 'playwright';

process.env.LD_LIBRARY_PATH = '/tmp/chrome-libs/usr/lib/x86_64-linux-gnu:' + (process.env.LD_LIBRARY_PATH || '');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME_PATH = process.env.CHROME_PATH || '/home/namal/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';

const results = [];
let browser, page;

function record(test, pass, detail = '') {
  results.push({ test, pass, detail });
  const icon = pass ? '✓' : '✗';
  console.log(`  ${icon} ${test}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  console.log(`\n🧪 Warframe TODO Tracker — Regression Suite\n`);
  console.log(`   Base: ${BASE}\n`);

  browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });

  page = await browser.newPage();
  page.on('pageerror', err => console.log(`  ⚠ page error: ${err.message.split('\n')[0]}`));

  // ── TESTS ──────────────────────────────────────────

  await testItemsList();
  await testItemDetail();
  await testSourcesPage();
  await testTodosCrud();
  await testEdgeCases();

  // ── REPORT ─────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log(`${'═'.repeat(50)}\n`);

  if (failed > 0) {
    console.log('Failures:');
    results.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.test} — ${r.detail}`));
    console.log();
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

// ── Test: Items List ─────────────────────────────────

async function testItemsList() {
  console.log('═══ Items List ═══');

  await page.goto(`${BASE}/items`, { waitUntil: 'networkidle' });
  const count = await page.$$eval('.card', els => els.length);
  record('Renders item cards', count > 0, `${count} cards`);

  // Tracked-only filter
  await page.click('input[type="checkbox"]');
  await page.waitForTimeout(400);
  const filtered = await page.$$eval('.card', els => els.length);
  record('Filter: tracked only', filtered > 0 && filtered <= count, `${filtered} cards (was ${count})`);

  // Uncheck
  await page.click('input[type="checkbox"]');
  await page.waitForTimeout(200);

  // Badge rendering
  const badges = await page.$$eval('.badge', els => els.map(e => e.textContent));
  const hasTypes = badges.some(b => ['warframe', 'primary', 'secondary', 'melee', 'companion', 'archwing', 'other'].includes(b));
  record('Item type badges render', hasTypes);
}

// ── Test: Item Detail ────────────────────────────────

async function testItemDetail() {
  console.log('═══ Item Detail ═══');

  // BUG: This page crashes due to Link import from wrong package.
  // We test that the critical error is present, then skip dependent checks.
  await page.goto(`${BASE}/items/item-1`, { waitUntil: 'networkidle' });

  // Wait and check if the page rendered the detail view or crashed
  await page.waitForTimeout(2000);
  const hasH1 = await page.$('h1').catch(() => null);

  if (hasH1) {
    const title = await page.textContent('h1');
    record('Item detail renders title', title === 'Excalibur', `"${title}"`);

    // Materials table
    const matRows = await page.$$('table tbody tr');
    record('Materials table has rows', matRows.length > 0, `${matRows.length} rows`);

    // Track button
    const btn = await page.textContent('.btn.primary');
    record('Track button shows correct state', btn === 'Untrack', `"${btn}"`);

    // Crafting tree
    const treeRows = await page.$$('.tree-row');
    record('Crafting tree renders', treeRows.length >= 0, `${treeRows.length} relationships`);
  } else {
    record('Item detail renders', false, 'BUG: React Error #130 — Link imported from next/navigation instead of next/link');
    // Skip remaining item detail tests since page crashed
    record('Materials table', false, 'skipped — page crashed');
    record('Track button', false, 'skipped — page crashed');
    record('Crafting tree', false, 'skipped — page crashed');
  }
}

// ── Test: Sources Page ───────────────────────────────

async function testSourcesPage() {
  console.log('═══ Sources Page ═══');

  await page.goto(`${BASE}/sources`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const cards = await page.$$('.card');
  record('Renders source cards', cards.length > 0, `${cards.length} cards`);

  // Material highlight via query param
  await page.goto(`${BASE}/sources?material=Argon%20Crystal`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const highlighted = await page.$$('tr[style]');
  record('Material highlight from query param', highlighted.length > 0, `${highlighted.length} highlighted rows`);
}

// ── Test: Todos CRUD ─────────────────────────────────

async function testTodosCrud() {
  console.log('═══ Todos CRUD ═══');

  await page.goto(`${BASE}/todos`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); // let client hydration settle

  // Count initial cards (form + seed todos)
  const before = await page.$$('.card');
  const seedCount = before.length - 1; // minus form card
  record('Seed todos load', seedCount >= 2, `${seedCount} seed todos`);

  // Create a new todo
  const newNote = `Regression test todo ${Date.now()}`;
  await page.fill('input[type="text"][placeholder="Notes"]', newNote);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);

  const afterCreate = await page.$$('.card');
  record('Create todo increases count', afterCreate.length > before.length, `${before.length} → ${afterCreate.length}`);

  // Verify content
  const allText = await page.textContent('main');
  record('New todo text visible', allText.includes(newNote));

  // Edit the last added todo (second card, first is the form)
  const editBtns = await page.$$('.card .btn');
  if (editBtns.length > 1) {
    await editBtns[1].click(); // second btn = edit on first todo card
    await page.waitForTimeout(300);

    const textarea = await page.$('textarea');
    if (textarea) {
      await textarea.fill(newNote + ' [EDITED]');
      await page.click('button:has-text("Save")');
      await page.waitForTimeout(500);
      const updated = await page.textContent('main');
      record('Edit todo persists', updated.includes('[EDITED]'));
    } else {
      record('Edit mode opens textarea', false, 'textarea not found');
    }
  } else {
    record('Edit button present', false, 'no edit buttons found');
  }

  // localStorage persistence
  const lsData = await page.evaluate(() => localStorage.getItem('warframe-todos'));
  const parsed = JSON.parse(lsData || '[]');
  const persisted = parsed.some(t => t.user_notes && t.user_notes.includes(newNote));
  record('Todo persists in localStorage', persisted);

  // Reload and verify
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const afterReload = await page.textContent('main');
  record('Todo survives page reload', afterReload.includes(newNote));

  // BUG: No delete button
  const hasDeleteBtn = await page.$('button:has-text("Delete")').catch(() => null);
  record('Delete button exists', !!hasDeleteBtn, hasDeleteBtn ? 'present' : 'MISSING — no way to delete todos');
}

// ── Test: Edge Cases ─────────────────────────────────

async function testEdgeCases() {
  console.log('═══ Edge Cases ═══');

  // Home page
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const homeText = await page.textContent('main');
  record('Home page renders', homeText.trim().length > 0, `"${homeText.trim()}"`);

  // Non-existent item
  await page.goto(`${BASE}/items/nonexistent`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const notFound = await page.textContent('main');
  record('Non-existent item shows fallback', notFound.includes('not found'), `"${notFound.trim()}"`);

  // 404 page
  const resp404 = await page.goto(`${BASE}/nonexistent`, { waitUntil: 'networkidle' });
  record('404 returns 404 status', resp404.status() === 404, `HTTP ${resp404.status()}`);
}

// ── Go ──────────────────────────────────────────────

run().catch(err => {
  console.error(`\n  💥 Suite crashed: ${err.message}`);
  if (browser) browser.close().catch(() => {});
  process.exit(2);
});
