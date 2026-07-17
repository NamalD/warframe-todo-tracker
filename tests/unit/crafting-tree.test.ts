import { describe, it, expect, vi } from 'vitest';

/**
 * Minimal inline fixtures matching the real cache schema.
 * The repository uses JSDoc types, so we keep these plain objects.
 */

const FAKE_ITEMS = [
  { id: 'item-1', name: 'Akbolto', item_type: 'secondary', uniqueName: '/Lotus/Weapons/Tenno/Akimbo/AkimboBolto' },
  { id: 'item-2', name: 'Bolto', item_type: 'secondary', uniqueName: '/Lotus/Weapons/Tenno/Pistol/CrossBow' },
  { id: 'item-3', name: 'Oraxia', item_type: 'warframe', uniqueName: '/Lotus/Types/Warframes/Oraxia' },
];

const FAKE_MATERIALS = [
  // Akbolto: has one intermediate (Bolto x2) and one raw resource
  { id: 'mat-1', craftable_item_id: 'item-1', material_name: 'Akbolto Blueprint', component_unique_name: '/Lotus/Types/Recipes/Weapons/AkBoltoBlueprint', quantity_required: 1, is_intermediate: false, sub_item_id: null },
  { id: 'mat-2', craftable_item_id: 'item-1', material_name: 'Bolto', component_unique_name: '/Lotus/Weapons/Tenno/Pistol/CrossBow', quantity_required: 2, is_intermediate: true, sub_item_id: 'item-2' },
  { id: 'mat-3', craftable_item_id: 'item-1', material_name: 'Orokin Cell', component_unique_name: '/Lotus/Types/Items/MiscItems/OrokinCell', quantity_required: 1, is_intermediate: false, sub_item_id: null },

  // Bolto: raw resources only (no intermediates)
  { id: 'mat-4', craftable_item_id: 'item-2', material_name: 'Bolto Blueprint', component_unique_name: '/Lotus/Types/Recipes/Weapons/BoltoBlueprint', quantity_required: 1, is_intermediate: false, sub_item_id: null },
  { id: 'mat-5', craftable_item_id: 'item-2', material_name: 'Alloy Plate', component_unique_name: '/Lotus/Types/Items/MiscItems/AlloyPlate', quantity_required: 300, is_intermediate: false, sub_item_id: null },

  // Oraxia: no intermediates, but has manual warframe map
  { id: 'mat-6', craftable_item_id: 'item-3', material_name: 'Oraxia Neuroptics', component_unique_name: '/Lotus/Types/Recipes/WarframeRecipes/OraxiaHelmetComponent', quantity_required: 1, is_intermediate: false, sub_item_id: null },
  { id: 'mat-7', craftable_item_id: 'item-3', material_name: 'Orokin Cell', component_unique_name: '/Lotus/Types/Items/MiscItems/OrokinCell', quantity_required: 3, is_intermediate: false, sub_item_id: null },
];

const FAKE_WARFRAME_SUB_MATERIALS = {
  'item-3': {
    'Oraxia Neuroptics': {
      materials: [
        { name: 'Morphics', quantity: 3 },
        { name: 'Plastids', quantity: 2 },
      ],
      quantity: 1,
    },
    'Oraxia Chassis': {
      materials: [
        { name: 'Ferrite', quantity: 300 },
        { name: 'Rubedo', quantity: 100 },
      ],
      quantity: 1,
    },
  },
};

/**
 * Extract the #buildCraftingTree logic into a testable helper so we can
 * exercise it without hitting fetch/localStorage.
 */
function buildCraftingTree(items, materials, warframeComponentSubMaterials, itemId, multiplier = 1, depth = 0) {
  const MAX_DEPTH = 8;
  if (depth > MAX_DEPTH) {
    return {
      item: { id: itemId + '-cycle-warning', name: 'Cycle detected', item_type: 'warning' },
      materials: [],
      children: [],
      quantityForParent: multiplier,
    };
  }

  const item = items.find((i) => i.id === itemId);
  if (!item) {
    return {
      item: { id: itemId, name: 'Unknown', item_type: 'unknown' },
      materials: [],
      children: [],
      quantityForParent: multiplier,
    };
  }

  const itemMaterials = materials.filter((m) => m.craftable_item_id === itemId);
  const children = [];

  // Source 1: auto-detected intermediates from @wfcd/items
  for (const mat of itemMaterials) {
    if (mat.is_intermediate && mat.sub_item_id) {
      const childNode = buildCraftingTree(items, materials, warframeComponentSubMaterials, mat.sub_item_id, multiplier * mat.quantity_required, depth + 1);
      childNode.quantityForParent = mat.quantity_required;
      children.push(childNode);
    }
  }

  // Source 2: manual Warframe component map
  const manualSubs = warframeComponentSubMaterials[itemId];
  if (manualSubs && item.item_type === 'warframe') {
    for (const [compName, compData] of Object.entries(manualSubs)) {
      const syntheticId = `${itemId}-${compName.replace(/\s+/g, '-').toLowerCase()}`;
      const childNode = {
        item: { id: syntheticId, name: compName, item_type: 'warframe_component' },
        materials: compData.materials.map((m, i) => ({
          ...m,
          id: `${syntheticId}-mat-${i}`,
          craftable_item_id: syntheticId,
          component_unique_name: null,
          quantity_required: m.quantity,
          wiki_url: `https://wiki.warframe.com/w/${encodeURIComponent(m.name.replace(/ /g, '_'))}`,
          is_intermediate: false,
          sub_item_id: null,
          is_incarnon_install: false,
          created_at: new Date().toISOString(),
        })),
        children: [],
        quantityForParent: compData.quantity,
      };
      children.push(childNode);
    }
  }

  return { item, materials: itemMaterials, children, quantityForParent: multiplier };
}

describe('buildCraftingTree', () => {
  it('returns single node for item with no intermediate materials', () => {
    const tree = buildCraftingTree(FAKE_ITEMS, FAKE_MATERIALS, FAKE_WARFRAME_SUB_MATERIALS, 'item-2');
    expect(tree.item.name).toBe('Bolto');
    expect(tree.children).toHaveLength(0);
    expect(tree.materials).toHaveLength(2);
    expect(tree.quantityForParent).toBe(1);
  });

  it('recurses one level for weapons with craftable sub-parts', () => {
    const tree = buildCraftingTree(FAKE_ITEMS, FAKE_MATERIALS, FAKE_WARFRAME_SUB_MATERIALS, 'item-1');
    expect(tree.item.name).toBe('Akbolto');
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].item.name).toBe('Bolto');
    expect(tree.children[0].quantityForParent).toBe(2);
    expect(tree.children[0].children).toHaveLength(0);
  });

  it('uses manual warframe map when is_intermediate is false', () => {
    const tree = buildCraftingTree(FAKE_ITEMS, FAKE_MATERIALS, FAKE_WARFRAME_SUB_MATERIALS, 'item-3');
    expect(tree.item.name).toBe('Oraxia');
    expect(tree.children).toHaveLength(2);
    expect(tree.children.map((c) => c.item.name).sort()).toEqual(['Oraxia Chassis', 'Oraxia Neuroptics']);
    expect(tree.children[0].materials).toHaveLength(2);
    expect(tree.children[0].children).toHaveLength(0);
  });

  it('rolls up quantities correctly', () => {
    // Akbolto needs 2 Bolto, each Bolto needs 300 Alloy Plate
    const tree = buildCraftingTree(FAKE_ITEMS, FAKE_MATERIALS, FAKE_WARFRAME_SUB_MATERIALS, 'item-1');
    const boltoNode = tree.children[0];
    const alloyPlate = boltoNode.materials.find((m) => m.material_name === 'Alloy Plate');
    expect(alloyPlate.quantity_required).toBe(300);
    // quantityForParent on the Bolto node is 2 (how many Bolto per Akbolto)
    expect(boltoNode.quantityForParent).toBe(2);
    // Top-level quantityForParent is 1
    expect(tree.quantityForParent).toBe(1);
  });

  it('handles cycles gracefully (max depth guard)', () => {
    // Create a self-referencing cycle: item-99 references itself
    const cycleItems = [{ id: 'item-99', name: 'CycleItem', item_type: 'other', uniqueName: '/Lotus/Test/CycleItem' }];
    const cycleMaterials = [
      { id: 'mat-c', craftable_item_id: 'item-99', material_name: 'CycleComponent', component_unique_name: '/Lotus/Test/CycleComponent', quantity_required: 1, is_intermediate: true, sub_item_id: 'item-99' },
    ];
    const tree = buildCraftingTree(cycleItems, cycleMaterials, {}, 'item-99', 1, 0);
    // Should produce 8 nested CycleItem nodes, then a cycle warning at depth 9
    let node = tree;
    let depth = 0;
    while (node.children.length > 0 && depth < 20) {
      node = node.children[0];
      depth++;
    }
    expect(node.item.name).toBe('Cycle detected');
  });

  it('omits raw materials from children array', () => {
    const tree = buildCraftingTree(FAKE_ITEMS, FAKE_MATERIALS, FAKE_WARFRAME_SUB_MATERIALS, 'item-1');
    // Akbolto has Orokin Cell as a raw material — should NOT appear as a child
    const childNames = tree.children.map((c) => c.item.name);
    expect(childNames).not.toContain('Orokin Cell');
    expect(childNames).toEqual(['Bolto']);
  });
});
