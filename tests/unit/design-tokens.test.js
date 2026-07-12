import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const CSS_PATH = resolve(ROOT, 'src/index.css');
const css = readFileSync(CSS_PATH, 'utf8');

/**
 * Guards the design-token layer introduced for issue #40. The palette,
 * radii, and type scale live as `--wf-*` custom properties in `:root`;
 * every rule should reference them via `var(--wf-*)` rather than raw
 * literals so the theme stays tunable from one place.
 */
describe('design tokens (index.css)', () => {
  // Split the file into the leading `:root` token definitions and the rest.
  // Token definition lines look like `  --wf-foo: <value>;`.
  const tokenDefLine = /^\s*--wf-[\w-]+:/;

  it('defines the core token groups in :root', () => {
    for (const token of [
      '--wf-bg',
      '--wf-surface',
      '--wf-border',
      '--wf-text',
      '--wf-accent',
      '--wf-link',
      '--wf-success',
      '--wf-warning',
      '--wf-danger',
      '--wf-radius-md',
      '--wf-font-md',
    ]) {
      expect(css, `missing token ${token}`).toContain(`${token}:`);
    }
  });

  it('has no raw hex colors outside token definitions', () => {
    const offenders = css
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /#[0-9a-fA-F]{3,6}\b/.test(line) && !tokenDefLine.test(line));
    expect(offenders.map((o) => `L${o.n}: ${o.line.trim()}`)).toEqual([]);
  });

  it('references only tokens that are defined', () => {
    const defined = new Set([...css.matchAll(/(--wf-[\w-]+):/g)].map((m) => m[1]));
    const referenced = new Set([...css.matchAll(/var\((--wf-[\w-]+)\)/g)].map((m) => m[1]));
    const undefinedRefs = [...referenced].filter((t) => !defined.has(t));
    expect(undefinedRefs).toEqual([]);
  });
});
