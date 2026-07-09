/**
 * Aggregate materials needed across tracked items.
 * Used by both the home page dashboard and the shopping list.
 *
 * @param {Array} items - Full items list with is_user_tracked / track_incarnon_install / incarnon_installed flags
 * @param {Object} inventory - Owned quantities { materialName: quantity }
 * @param {Function} getMaterialsForItem - async (itemId) => [{ material_name, quantity_required, is_incarnon_install }]
 * @returns {Promise<Array>} Sorted array of { name, quantity, owned, deficit, done, items }
 */
export async function aggregateTrackedMaterials(items, inventory, getMaterialsForItem) {
  const relevantItems = items.filter(
    (it) => it.is_user_tracked || (it.track_incarnon_install && !it.incarnon_installed)
  );

  const matMap = {};
  for (const item of relevantItems) {
    const materials = await getMaterialsForItem(item.id);
    for (const m of materials) {
      // Only include materials relevant to the tracking type
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

  return Object.values(matMap)
    .map((m) => {
      const ownedQty = inventory[m.name] ?? 0;
      const deficit = Math.max(0, m.quantity - ownedQty);
      return { ...m, owned: ownedQty, deficit, done: deficit <= 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
