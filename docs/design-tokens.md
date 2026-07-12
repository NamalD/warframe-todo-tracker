# Design tokens

The app's visual language is defined as CSS custom properties (`--wf-*`) in
the `:root` block at the top of [`src/index.css`](../src/index.css). They are
the single source of truth for the dark palette, corner radii, and type scale.
This document is the reference for that vocabulary and the plan for finishing
the migration.

> **Rule of thumb:** never hardcode a hex color or a scale value. Reference a
> token with `var(--wf-*)` — in `index.css` **and** in inline `style={{}}`
> props (e.g. `style={{ color: 'var(--wf-accent)' }}`). A unit test
> (`tests/unit/design-tokens.test.js`) fails the build if a raw hex creeps
> back into `index.css` or a `var()` references an undefined token.

## Why

The UI was styled with hardcoded hex values repeated across `index.css` and
~300 inline `style={{}}` props (issue #40). The same greys and accents were
copy-pasted dozens of times with occasional drift, so there was no way to
retheme, and "the card color" or "the button border" had no canonical value.
Tokens fix the source-of-truth problem first; the inline-style migration
(below) then collapses the duplication page by page.

## Token groups

### Surfaces — dark elevation ladder

| Token | Value | Use |
|-------|-------|-----|
| `--wf-bg` | `#0b0d14` | App background |
| `--wf-surface-sunken` | `#0f121a` | Inputs, nav gradient base, mobile menu |
| `--wf-surface` | `#13161f` | Cards |
| `--wf-surface-active` | `#161a24` | Active nav link |
| `--wf-surface-raised` | `#181c26` | Buttons, raised controls |
| `--wf-surface-hover` | `#1f2432` | Button hover |
| `--wf-fill-subtle` | `#1e2230` | Badge / progress-track / skeleton / checkbox fills |

### Borders & dividers

| Token | Value | Use |
|-------|-------|-----|
| `--wf-border-subtle` | `#1a1f2a` | Dimmed border (e.g. acquired loadout slot) |
| `--wf-border` | `#1e2230` | Default border / divider |
| `--wf-border-raised` | `#262b3a` | Raised overlay border (toasts, popovers) |
| `--wf-border-strong` | `#2a2f3f` | Stronger border (inputs, buttons, tree rows) |
| `--wf-border-focus` | `#3c465a` | Focus / hover border |

### Text — neutral ramp (strongest → faintest)

| Token | Value | Use |
|-------|-------|-----|
| `--wf-text-strong` | `#ffffff` | Active/emphasis text |
| `--wf-text` | `#e7e9ee` | Default body text |
| `--wf-text-secondary` | `#c9cdd8` | Card paragraphs, table cells |
| `--wf-text-muted` | `#b6bcc7` | Nav links, labels, badges |
| `--wf-text-dim` | `#9aa0ad` | Table headers |
| `--wf-text-faint` | `#8a91a0` | Muted text, empty states |

### Accents

| Token | Value | Use |
|-------|-------|-----|
| `--wf-accent` | `#ffcf6a` | Gold brand mark, card headings |
| `--wf-link` | `#7cc4ff` | Links, focus outline |
| `--wf-link-hover` | `#a8d8ff` | Link hover |

### Status

| Token | Value | Use |
|-------|-------|-----|
| `--wf-success` | `#6fcf97` | Completed, acquired, progress-done, success toast |
| `--wf-success-hover` | `#5ad68e` | Checkbox checked hover |
| `--wf-warning` | `#f2c94c` | In-progress, progress fill |
| `--wf-danger` | `#eb5757` | Blocked / destructive, error toast |
| `--wf-info` | `#56ccf2` | Info toast |

### Buttons

Base buttons compose surface + border tokens (`.btn`). The primary variant has
two dedicated tokens:

| Token | Value | Use |
|-------|-------|-----|
| `--wf-btn-primary-bg` | `#2a3444` | `.btn.primary` background |
| `--wf-btn-primary-border` | `#3a4255` | `.btn.primary` border |

### Category badge hues

`--wf-cat-warframe`, `--wf-cat-primary`, `--wf-cat-secondary`, `--wf-cat-melee`,
`--wf-cat-companion`, `--wf-cat-archwing`, `--wf-cat-sentinels`,
`--wf-cat-tektolyst`, `--wf-cat-other` — the equipment-category colors used by
`.badge.<category>`. Kept separate from the status colors (even where the value
matches today) so categories and statuses can diverge later.

### Radii

| Token | Value |
|-------|-------|
| `--wf-radius-xs` | `3px` |
| `--wf-radius-sm` | `6px` |
| `--wf-radius-md` | `8px` |
| `--wf-radius-lg` | `10px` |
| `--wf-radius-pill` | `999px` |

### Type scale

`--wf-font-sans` (family) plus `--wf-font-xs` `12px`, `--wf-font-sm` `13px`,
`--wf-font-md` `14px`, `--wf-font-lg` `16px`.

## Notes & known gaps

- **Two sub-perceptual greys were consolidated** when tokenizing `index.css`:
  table-cell text `#cdd1db → --wf-text-secondary (#c9cdd8)` and default badge
  text `#b6bdcb → --wf-text-muted (#b6bcc7)`. Both deltas are ~1 in 8-bit RGB
  (invisible) and were copy-paste drift, not intentional shades.
- **Spacing is not yet tokenized.** Padding/margin/gap values in `index.css`
  are still literals; a spacing scale is a good follow-up but was out of scope
  for the color/radius/type first pass.
- **A few intrinsic literals remain** by design: `1px` hamburger bars, the
  `7px` skeleton-line radius, the `40px` empty-state icon, the `18px` toast
  dismiss glyph, and the toast `box-shadow` (an `rgba()` elevation shadow) are
  component-specific, not part of any scale. A shadow/elevation scale is a
  reasonable future token group.

## Inline-style migration (follow-up)

`index.css` is fully tokenized. The remaining work is the ~300 inline
`style={{}}` props across `app/**`, many of which reintroduce the same hexes
(and a handful of one-off variants that should collapse onto a token). Migrate
per page, replacing literals with `var(--wf-*)`, and add each converted page's
route to a Playwright content assertion so the refactor stays honest. Where an
inline style merely recreates `.card` / `.btn` / `.badge`, prefer the existing
class over re-declaring the tokens inline.
