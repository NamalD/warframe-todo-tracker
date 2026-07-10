// @ts-nocheck
/**
 * Groups an array of objects by the value of a given key.
 * @template T
 * @param {T[]} arr
 * @param {keyof T} key
 * @returns {Record<string, T[]>}
 */
export function groupBy(arr, key) {
  return arr.reduce((acc, curr) => {
    const k = curr[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(curr);
    return acc;
  }, {});
}

/**
 * Checks if a loadout is complete (all populated slots acquired).
 * @param {Object} loadout
 * @returns {boolean}
 */
export function isLoadoutComplete(loadout) {
  const slots = (loadout.slots || []).filter((s) => s.item_id || s.custom_item_name);
  if (slots.length === 0) return false;
  return slots.every((s) => s.acquired);
}
