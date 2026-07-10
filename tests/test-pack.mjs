#!/usr/bin/env node
/**
 * test-pack.mjs — Run the full test suite in one command.
 * Usage: npm test  (or: node tests/test-pack.mjs)
 *
 * Phases:
 *   1. Prebuilt cache files     — fast file-existence check
 *   2. Unit tests (Vitest)      — 300+ React/JS tests
 *   3. Browser smoke tests      — skipped if app not running
 *
 * Exit 0 = all reachable phases passed.
 * Exit 1 = at least one required phase failed.
 */

import { spawnSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'http';
import { get as httpsGet } from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const results = [];

function phase(name, fn) {
  process.stdout.write(`\n  🧪 ${name}\n${'─'.repeat(50)}\n`);
  try {
    fn();
    console.log(`  PASS\n`);
    results.push({ name, pass: true });
  } catch (err) {
    console.log(`  FAIL — ${err.message.split('\n')[0]}\n`);
    results.push({ name, pass: false });
  }
}

function skip(name, reason) {
  console.log(`\n  🧪 ${name} ... SKIP (${reason})\n`);
  results.push({ name, pass: true });
}

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { cwd: ROOT, stdio: 'inherit', timeout: 300000, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`exit code ${r.status}`);
  if (r.signal) throw new Error(`killed by ${r.signal}`);
}

function urlReachable(url) {
  return new Promise(resolve => {
    const proto = url.startsWith('https') ? httpsGet : get;
    const req = proto(url, { timeout: 2000 }, res => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  // ── Phase 1: Asset integrity ───────────────────────
  phase('Prebuilt cache files', () => {
    const required = ['public/data/wfcd-cache.json', 'public/data/mods-cache.json'];
    for (const f of required) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) throw new Error(`MISSING: ${f}`);
      const size = (statSync(p).size / 1024).toFixed(1);
      process.stdout.write(`  ✓ ${f} (${size} KB)\n`);
    }
  });

  // ── Phase 2: Unit tests ───────────────────────────
  const yarnBin = resolve(ROOT, '.yarn/releases/yarn-4.17.1.cjs');
  const vitest = process.execPath;  // run via `node yarn vitest run`
  phase('Unit tests (Vitest)', () => run(vitest, [yarnBin, 'vitest', 'run']));

  // ── Phase 3: Browser smoke tests ───────────────────
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  const reachable = await urlReachable(BASE_URL);
  if (!reachable) {
    skip('Browser smoke tests', `${BASE_URL} not reachable`);
  } else {
    phase('Browser smoke tests', () =>
      run(process.execPath, ['tests/smoke/playwright.mjs'], {
        env: { ...process.env, BASE_URL },
      })
    );
  }

  // ── Report ─────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const failed = results.filter(r => !r.pass);

  console.log(`  ${'═'.repeat(50)}`);
  console.log(`  Result: ${passed}/${total} phases passed\n`);

  if (failed.length > 0) {
    console.error('  Failed phases:');
    failed.forEach(r => console.error(`    ✗ ${r.name}`));
    console.error();
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n  💥 Test pack crashed: ${err.message}`);
  process.exit(2);
});
