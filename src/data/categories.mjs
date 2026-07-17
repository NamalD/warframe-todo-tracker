/**
 * Shared category taxonomy between prebuild and the Items page.
 *
 * - `ITEM_TYPE_MAP`: @wfcd/items category string → internal item_type
 * - `CATEGORY_LABELS`: internal item_type → human label (derived from ITEM_TYPE_MAP + extras)
 */

export const ITEM_TYPE_MAP = {
  Warframes: 'warframe',
  Primary: 'primary',
  Secondary: 'secondary',
  Melee: 'melee',
  'Arch-Gun': 'archgun',
  'Arch-Melee': 'archmelee',
  Sentinels: 'sentinels',
};

export const CATEGORY_LABELS = {
  ...Object.fromEntries(
    Object.entries(ITEM_TYPE_MAP).map(([display, type]) => [type, display])
  ),
  tektolyst_artifact: 'Tektolyst Artifact',
  companion: 'Companion',
};
