import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, mkdtempSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import os from 'os';

const ROOT = resolve(__dirname, '../..');
const CACHE_PATH = resolve(ROOT, 'public/data/wfcd-cache.json');
const RELIC_CACHE_PATH = resolve(ROOT, 'public/data/relics-cache.json');
const PREBUILD_SCRIPT = resolve(ROOT, 'scripts/prebuild.mjs');

describe('prebuild cache freshness', () => {
  let committed, fresh, freshRelicCache;

  beforeAll(() => {
    if (!existsSync(CACHE_PATH)) {
      throw new Error('wfcd-cache.json not found — run yarn node scripts/prebuild.mjs first');
    }

    committed = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));

    // Generate the fresh cache into a temp dir — never into public/data,
    // which parallel test files parse at module load (#127: a mid-write
    // read there fails the whole sibling test file with a JSON error).
    const tmpDir = mkdtempSync(resolve(os.tmpdir(), 'prebuild-test-'));
    execSync(`yarn node "${PREBUILD_SCRIPT}"`, {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, PREBUILD_OUT_DIR: tmpDir },
    });
    fresh = JSON.parse(readFileSync(resolve(tmpDir, 'wfcd-cache.json'), 'utf8'));
    freshRelicCache = JSON.parse(readFileSync(resolve(tmpDir, 'relics-cache.json'), 'utf8'));
  });

  it('committed cache has the same item count as a fresh prebuild', () => {
    expect(fresh.items.length).toBe(committed.items.length);
  });

  it('committed cache has the same material count as a fresh prebuild', () => {
    expect(fresh.materials.length).toBe(committed.materials.length);
  });

  it('committed cache has the same item names as a fresh prebuild', () => {
    const names = (cache) => cache.items.map((i) => i.name).sort();
    expect(names(fresh)).toEqual(names(committed));
  });

  it('schemaVersion is bumped when item count increases', () => {
    if (fresh.items.length > committed.items.length) {
      expect(fresh.schemaVersion).toBeGreaterThan(committed.schemaVersion);
    } else if (fresh.items.length < committed.items.length) {
      expect(fresh.schemaVersion).not.toBeLessThan(committed.schemaVersion);
    }
    // If counts match, no bump needed
  });

  it('schemaVersion in the cache matches SCHEMA_VERSION in prebuild.mjs source', () => {
    const prebuildSource = readFileSync(PREBUILD_SCRIPT, 'utf8');
    const match = prebuildSource.match(/const\s+SCHEMA_VERSION\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const sourceVersion = parseInt(match[1], 10);
    expect(committed.schemaVersion).toBe(sourceVersion);
  });

  it('relics-cache.json exists and has primeRelicMap', () => {
    expect(existsSync(RELIC_CACHE_PATH)).toBe(true);
    const committedRelic = JSON.parse(readFileSync(RELIC_CACHE_PATH, 'utf8'));
    expect(committedRelic.primeRelicMap).toBeDefined();
    expect(typeof committedRelic.primeRelicMap).toBe('object');
    const primeItemCount = Object.keys(committedRelic.primeRelicMap).length;
    expect(primeItemCount).toBeGreaterThan(0);
  });

  it('committed relics-cache matches fresh prebuild prime item count', () => {
    const committedRelic = JSON.parse(readFileSync(RELIC_CACHE_PATH, 'utf8'));
    const committedCount = Object.keys(committedRelic.primeRelicMap).length;
    const freshCount = Object.keys(freshRelicCache.primeRelicMap).length;
    expect(committedCount).toBe(freshCount);
  });

  it('relics-cache schemaVersion matches source SCHEMA_VERSION', () => {
    const committedRelic = JSON.parse(readFileSync(RELIC_CACHE_PATH, 'utf8'));
    const prebuildSource = readFileSync(PREBUILD_SCRIPT, 'utf8');
    const match = prebuildSource.match(/const\s+SCHEMA_VERSION\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const sourceVersion = parseInt(match[1], 10);
    expect(committedRelic.schemaVersion).toBe(sourceVersion);
  });

  it('relics-cache entries have required fields', () => {
    const committedRelic = JSON.parse(readFileSync(RELIC_CACHE_PATH, 'utf8'));
    for (const [itemId, entries] of Object.entries(committedRelic.primeRelicMap)) {
      expect(itemId).toMatch(/^item-\d+$/);
      for (const entry of entries) {
        expect(entry).toHaveProperty('relicName');
        expect(entry).toHaveProperty('component');
        expect(entry).toHaveProperty('rarity');
        expect(entry).toHaveProperty('vaulted');
        expect(typeof entry.vaulted).toBe('boolean');
      }
    }
  });
});
