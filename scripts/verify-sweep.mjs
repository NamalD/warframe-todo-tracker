// Cheap programmatic page sweep for the verify skill (.claude/skills/verify).
//
// Prints one line per page/width — load status, console/page errors, HTTP
// >=400 responses, page-level horizontal overflow — so a change can be
// verified from numbers instead of screenshots. Screenshots are opt-in.
//
// Run under PnP (playwright is a repo dep):
//   node .yarn/releases/yarn-*.cjs node scripts/verify-sweep.mjs [options]
//
// Options:
//   --base URL        server to sweep (default http://localhost:3001, must be running)
//   --pages a,b,c     routes to check; ":item-detail" and ":loadout-detail"
//                     resolve to a data-rich item / the seeded loadout
//                     (default: all main routes)
//   --widths 375,1280 viewport widths (default 375,1280)
//   --seed            seed demo data first: tracked items, todos, a populated
//                     loadout (idempotent; re-seed failures are ignored)
//   --shots DIR       also write full-page screenshots into DIR
//   --json PATH       write full offender/error details as JSON
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const BASE = opt('base', 'http://localhost:3001');
const WIDTHS = opt('widths', '375,1280').split(',').map(Number);
const SEED = flag('seed');
const SHOTS = opt('shots', null);
const JSON_OUT = opt('json', null);
const LOADOUT_ID = 'loadout-verify-sweep';

const DEFAULT_PAGES = [
  '/', '/items', ':item-detail', '/sources', '/todos', '/loadouts',
  ':loadout-detail', '/mods', '/shopping-list', '/builds', '/login',
];
const pages = opt('pages', null)?.split(',') ?? DEFAULT_PAGES;

if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// ── Resolve data-dependent routes ─────────────────────────────────────────
const cache = await (await fetch(`${BASE}/data/wfcd-cache.json`)).json();
const matCount = new Map();
for (const m of cache.materials) {
  matCount.set(m.craftable_item_id, (matCount.get(m.craftable_item_id) || 0) + 1);
}
// Longest-named item with several materials — stresses layout the hardest.
const richItems = cache.items
  .filter((i) => (matCount.get(i.id) || 0) >= 4)
  .sort((a, b) => b.name.length - a.name.length);

// ── Optional seed ──────────────────────────────────────────────────────────
async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: path === '/api/user-items' ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

if (SEED) {
  for (const it of richItems.slice(0, 3)) {
    await post('/api/user-items', { item_id: it.id, fields: { is_user_tracked: true } });
  }
  await post('/api/todos', {
    id: 'todo-verify-sweep-0', craftable_item_id: richItems[0].id, status: 'in_progress',
    user_notes: 'Farm the Neuroptics from Deimos bounties, then radshare the remaining relics with clanmates',
  });
  await post('/api/todos', {
    id: 'todo-verify-sweep-1', linked_material_name: 'Orokin Cell', user_notes: 'short note', status: 'pending',
  });
  const slotTypes = ['warframe', 'primary', 'secondary', 'melee', 'companion', 'archwing', 'other'];
  const slots = slotTypes.map((type, i) => ({
    id: `${LOADOUT_ID}-${type}`, loadout_id: LOADOUT_ID, slot_type: type,
    item_id: i < 3 ? richItems[i].id : null,
    custom_item_name: i === 3 ? 'Prisma Grakata with a very long custom item name for stress testing' : null,
    acquired: i === 1, notes: i === 0 ? 'Needs two more forma before the build is complete' : '',
    display_order: i,
    requirements: i === 0 ? [
      { id: 'req-vs-1', loadout_slot_id: `${LOADOUT_ID}-warframe`, name: 'Orokin Reactor (from Nightwave cred offerings this week)', wiki_url: null, user_notes: '', acquired: false, display_order: 0 },
      { id: 'req-vs-2', loadout_slot_id: `${LOADOUT_ID}-warframe`, name: 'Exilus Adapter', wiki_url: null, user_notes: '', acquired: true, display_order: 1 },
    ] : [],
  }));
  await post('/api/loadouts', {
    id: LOADOUT_ID, name: 'Verify Sweep Loadout — Long Name For Layout Stress',
    data: { slots, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
  });
  console.log('seeded (existing data reused where creates conflicted)');
}

const routes = pages
  .map((p) => {
    if (p === ':item-detail') return `/items/${richItems[0].id}`;
    if (p === ':loadout-detail') return SEED ? `/loadouts/${LOADOUT_ID}` : null;
    return p;
  })
  .filter(Boolean);

// ── Sweep ──────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const report = [];
let failures = 0;

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 812 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const httpErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('response', (res) => { if (res.status() >= 400) httpErrors.push(`${res.status()} ${res.url()}`); });

  for (const route of routes) {
    consoleErrors.length = 0;
    httpErrors.length = 0;
    const name = route === '/' ? 'home' : route.slice(1).replace(/\//g, '-');
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(1000);
      const layout = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const overflows = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > vw + 1 || r.left < -1);
        };
        const offenders = [];
        for (const el of document.querySelectorAll('body *')) {
          if (!el.checkVisibility?.() || !overflows(el)) continue;
          if (el.parentElement && overflows(el.parentElement)) continue;
          if (el.closest('.table-scroll')) continue; // scrolls inside its card by design
          const r = el.getBoundingClientRect();
          offenders.push({
            el: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''),
            width: Math.round(r.width), right: Math.round(r.right),
            text: (el.textContent || '').trim().slice(0, 40),
          });
        }
        return {
          overflowPx: Math.max(document.documentElement.scrollWidth - vw, 0),
          offenders: offenders.slice(0, 5),
        };
      });
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-${name}.png`, fullPage: true });
      const bad = layout.overflowPx > 0 || consoleErrors.length > 0 || httpErrors.length > 0;
      if (bad) failures++;
      console.log(
        `${width}px ${route}  ${bad ? 'FAIL' : 'ok'}  overflow=${layout.overflowPx}px consoleErrors=${consoleErrors.length} http>=400=${httpErrors.length}`
      );
      report.push({
        width, route, overflowPx: layout.overflowPx, offenders: layout.offenders,
        consoleErrors: [...consoleErrors].slice(0, 5), httpErrors: [...httpErrors].slice(0, 5),
      });
    } catch (err) {
      failures++;
      const msg = err.message.split('\n')[0];
      console.log(`${width}px ${route}  FAIL  ${msg}`);
      report.push({ width, route, error: msg });
    }
  }
  await ctx.close();
}
await browser.close();

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  console.log(`details: ${JSON_OUT}`);
}
process.exit(failures > 0 ? 1 : 0);
