// @ts-nocheck
/**
 * Aggregate materials needed across tracked items and loadout requirements.
 * Used by both the home page dashboard and the shopping list.
 *
 * @param {Array} items - Full items list with tracking flags
 * @param {Object} inventory - Owned quantities { materialName: quantity }
 * @param {Function} getMaterialsForItem - async (itemId) => materials array
 * @param {Array} loadoutReqs - Array of { name, loadout, slot } from loadout repository
 * @returns {Promise<Array>} Sorted array of { name, quantity, owned, deficit, done, items }
 */
export async function aggregateTrackedMaterials(items, inventory, getMaterialsForItem, loadoutReqs = []) {
  const relevantItems = items.filter(
    (it) => it.is_user_tracked || (it.track_incarnon_install && !it.incarnon_installed)
  );

  const matMap = {};
  for (const item of relevantItems) {
    const materials = await getMaterialsForItem(item.id);
    for (const m of materials) {
      if (m.is_incarnon_install ? !item.track_incarnon_install : !item.is_user_tracked) continue;
      const key = m.material_name;
      if (!matMap[key]) {
        matMap[key] = { name: m.material_name, quantity: 0, items: [] };
      }
      matMap[key].quantity += m.quantity_required;
      matMap[key].items.push({
        id: item.id,
        label: m.is_incarnon_install ? `${item.name} (Incarnon Install)` : item.name,
      });
    }
  }

  // Add loadout slot requirements (each counts as 1)
  for (const req of loadoutReqs) {
    const key = req.name;
    if (!matMap[key]) {
      matMap[key] = { name: req.name, quantity: 0, items: [] };
    }
    matMap[key].quantity += 1;
    matMap[key].items.push({
      label: `${req.loadout} (${req.slot})`,
    });
  }

  return Object.values(matMap)
    .map((m) => {
      const ownedQty = inventory[m.name] ?? 0;
      const deficit = Math.max(0, m.quantity - ownedQty);
      return { ...m, owned: ownedQty, deficit, done: deficit <= 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
