import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }) =>
    React.createElement('a', { href, className, ...props }, children),
}));

const mockItems = [
  { id: 'item-1', name: 'Excalibur', item_type: 'warframe', mastery_rank_required: 0, is_user_tracked: true },
];

const mockMaterials = {
  'item-1': [
    { material_name: 'Alloy Plate', quantity_required: 1200, craftable_item_id: 'item-1' },
  ],
};

const mockInventory = { 'Alloy Plate': 0 };

const mockState = vi.hoisted(() => ({
  items: () => mockItems.map((it) => ({ ...it })),
  inventory: () => ({ ...mockInventory }),
  materials: (id) => (mockMaterials[id] || []).map((m) => ({ ...m })),
  loadoutReqs: () => [],
}));

vi.mock('../../src/data/store.ts', () => ({
  default: {
    initTodos: () => Promise.resolve(),
    initMaterials: () => Promise.resolve(),
    getAllItems: () => Promise.resolve(mockState.items()),
    getMaterialInventory: () => mockState.inventory(),
    getMaterialsForItem: (id) => Promise.resolve(mockState.materials(id)),
    setOwnedQuantity: (materialName, qty) => {
      const parsed = parseInt(qty, 10);
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    },
  },
}));

vi.mock('../../src/data/loadout-store.ts', () => ({
  default: {
    init: () => Promise.resolve(),
    getAllRequirements: () => mockState.loadoutReqs(),
  },
}));

import ShoppingList from '../../app/shopping-list/page';

describe('ShoppingList loadout badges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.items = () => mockItems.map((it) => ({ ...it }));
    mockState.inventory = () => ({ ...mockInventory });
    mockState.loadoutReqs = () => [];
  });

  it('renders without crashing when there are no tracked items', async () => {
    mockState.items = () => [];
    render(React.createElement(ShoppingList));
    await waitFor(() => {
      expect(screen.getByText(/No tracked items yet/i)).toBeInTheDocument();
    });
  });

  it('links tracked-item badges to /items/<id>', async () => {
    render(React.createElement(ShoppingList));

    await waitFor(() => {
      expect(screen.getByText('Alloy Plate')).toBeInTheDocument();
    });

    const badge = screen.getByText('Excalibur');
    expect(badge.tagName).toBe('A');
    expect(badge.getAttribute('href')).toBe('/items/item-1');
  });

  it('links loadout requirement badges to /loadouts/<id> instead of /items/undefined', async () => {
    mockState.loadoutReqs = () => [
      { name: 'Polymer Bundle', loadout: 'Excalibur Prime', loadoutId: 'loadout-1', slot: 'primary' },
    ];

    render(React.createElement(ShoppingList));

    await waitFor(() => {
      expect(screen.getByText('Polymer Bundle')).toBeInTheDocument();
    });

    // Should NOT link to /items/undefined
    expect(screen.queryByText(/items\/undefined/i)).not.toBeInTheDocument();

    // Should link to the loadout page
    const badge = screen.getByText('Excalibur Prime (primary)');
    expect(badge.tagName).toBe('A');
    expect(badge.getAttribute('href')).toBe('/loadouts/loadout-1');
  });

  it('uses stable keys for loadout badges to avoid React duplicate-key warnings', async () => {
    // Two loadouts requiring the same material in the same slot type
    mockState.loadoutReqs = () => [
      { name: 'Polymer Bundle', loadout: 'Excalibur Prime', loadoutId: 'loadout-1', slot: 'primary' },
      { name: 'Polymer Bundle', loadout: 'Mesa Prime', loadoutId: 'loadout-2', slot: 'primary' },
    ];

    // suppress console.error to catch React key warnings
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(React.createElement(ShoppingList));

    await waitFor(() => {
      expect(screen.getByText('Polymer Bundle')).toBeInTheDocument();
    });

    // No duplicate key warnings should have been logged
    const keyWarnings = consoleError.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('key'))
    );
    expect(keyWarnings).toHaveLength(0);

    consoleError.mockRestore();
  });

  it('renders loadout badges alongside tracked-item badges in the same Used In column', async () => {
    mockState.loadoutReqs = () => [
      { name: 'Alloy Plate', loadout: 'Excalibur Prime', loadoutId: 'loadout-1', slot: 'warframe' },
    ];

    render(React.createElement(ShoppingList));

    await waitFor(() => {
      expect(screen.getByText('Alloy Plate')).toBeInTheDocument();
    });

    // Both tracked item and loadout badge should be present
    expect(screen.getByText('Excalibur')).toBeInTheDocument();
    expect(screen.getByText('Excalibur Prime (warframe)')).toBeInTheDocument();
  });
});
