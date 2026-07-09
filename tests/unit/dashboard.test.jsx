import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }) =>
    React.createElement('a', { href, className, ...props }, children),
}));

// ── Test data ─────────────────────────────────────────────────

const mockItems = [
  { id: 'item-1', name: 'Excalibur', item_type: 'warframe', mastery_rank_required: 0, is_user_tracked: true },
  { id: 'item-2', name: 'Mesa', item_type: 'warframe', mastery_rank_required: 4, is_user_tracked: true },
  { id: 'item-3', name: 'Kronen Prime', item_type: 'melee', mastery_rank_required: 14, is_user_tracked: false },
];

const mockMaterials = {
  'item-1': [
    { material_name: 'Alloy Plate', quantity_required: 1200, wiki_url: 'https://wiki/alloy_plate', craftable_item_id: 'item-1' },
    { material_name: 'Circuits', quantity_required: 600, wiki_url: 'https://wiki/circuits', craftable_item_id: 'item-1' },
    { material_name: 'Polymer Bundle', quantity_required: 200, wiki_url: 'https://wiki/polymer', craftable_item_id: 'item-1' },
    { material_name: 'Orokin Cell', quantity_required: 1, wiki_url: 'https://wiki/orokin_cell', craftable_item_id: 'item-1' },
  ],
  'item-2': [
    { material_name: 'Alloy Plate', quantity_required: 800, wiki_url: 'https://wiki/alloy_plate', craftable_item_id: 'item-2' },
    { material_name: 'Circuits', quantity_required: 300, wiki_url: 'https://wiki/circuits', craftable_item_id: 'item-2' },
    { material_name: 'Nano Spores', quantity_required: 1500, wiki_url: 'https://wiki/nano_spores', craftable_item_id: 'item-2' },
  ],
};

// Partial ownership — Alloy Plate fully owned, Circuits partially, others not owned
const mockInventory = {
  'Alloy Plate': 2000,
  'Circuits': 500,
  'Polymer Bundle': 0,
};

const mockTodos = [
  { id: 'todo-1', title: 'Farm Alloy Plate', status: 'in_progress' },
  { id: 'todo-2', title: 'Build Excalibur', status: 'pending' },
];

// ── Hoisted mock state (shared mutable references) ────────────

const mockState = vi.hoisted(() => ({
  items: () => mockItems.map((it) => ({ ...it })),
  todos: () => mockTodos.map((t) => ({ ...t })),
  inventory: () => ({ ...mockInventory }),
  materials: (id) => (mockMaterials[id] || []).map((m) => ({ ...m })),
  trackedMods: () => [],
}));

vi.mock('../../src/data/mod-store.js', () => ({
  default: {
    getTrackedMods: () => Promise.resolve(mockState.trackedMods()),
  },
}));

vi.mock('../../src/data/store.js', () => ({
  default: {
    getAllItems: () => Promise.resolve(mockState.items()),
    getTodos: () => mockState.todos(),
    getMaterialInventory: () => mockState.inventory(),
    getMaterialsForItem: (id) => Promise.resolve(mockState.materials(id)),
    setOwnedQuantity: (materialName, qty) => {
      const parsed = parseInt(qty, 10);
      const newQty = isNaN(parsed) || parsed < 0 ? 0 : parsed;
      return newQty;
    },
  },
}));

import Home from '../../app/page.jsx';

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state to defaults
    mockState.items = () => mockItems.map((it) => ({ ...it }));
    mockState.inventory = () => ({ ...mockInventory });
    mockState.todos = () => mockTodos.map((t) => ({ ...t }));
    mockState.trackedMods = () => [];
  });

  it('shows loading skeleton initially', () => {
    const { container } = render(React.createElement(Home));
    expect(container.querySelector('.skeleton')).toBeInTheDocument();
  });

  it('renders tracked items count after loading', async () => {
    render(React.createElement(Home));
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('renders todo counts after loading', async () => {
    render(React.createElement(Home));
    // Both in-progress and pending are 1 — use getAllByText
    await waitFor(() => {
      expect(screen.getByText('in progress')).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });
  });

  it('shows materials section with deficit values instead of raw totals', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Circuits')).toBeInTheDocument();
    });

    // Alloy Plate: needed=2000 (1200+800), owned=2000, deficit=0 → done, hidden entirely
    expect(screen.queryByText('Alloy Plate')).not.toBeInTheDocument();

    // Circuits: needed=900 (600+300), owned=500, deficit=400
    const circuitsCard = screen.getByText('Circuits').closest('.card');
    expect(circuitsCard).toBeInTheDocument();
    expect(circuitsCard.textContent).toMatch(/needs.*400/);

    // Polymer Bundle: needed=200, owned=0, deficit=200
    const polymerCard = screen.getByText('Polymer Bundle').closest('.card');
    expect(polymerCard).toBeInTheDocument();
    expect(polymerCard.textContent).toMatch(/needs.*200/);
  });

  it('shows owned quantity alongside material name', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Circuits')).toBeInTheDocument();
    });

    // Circuits: owned 500, should be visible
    const circuitsCard = screen.getByText('Circuits').closest('.card');
    expect(circuitsCard.textContent).toContain('500');
  });

  it('hides fully-owned materials (deficit <= 0) from the dashboard', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Circuits')).toBeInTheDocument();
    });

    // Alloy Plate: owned=2000, needed=2000, deficit=0 → done, hidden
    expect(screen.queryByText('Alloy Plate')).not.toBeInTheDocument();

    // Circuits: owned=500, needed=900, deficit=400 → not done, shown
    expect(screen.getByText('Circuits')).toBeInTheDocument();

    // Polymer Bundle: owned=0, needed=200, deficit=200 → not done, shown
    expect(screen.getByText('Polymer Bundle')).toBeInTheDocument();
  });

  it('shows an "all owned" message when every material is fully owned', async () => {
    // Override via shared mock state (no module cache mutation)
    mockState.inventory = () => ({
      'Alloy Plate': 5000,
      'Circuits': 5000,
      'Polymer Bundle': 5000,
      'Nano Spores': 5000,
      'Orokin Cell': 1,
    });

    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText(/Materials Needed/i)).toBeInTheDocument();
    });

    ['Alloy Plate', 'Circuits', 'Polymer Bundle', 'Nano Spores', 'Orokin Cell'].forEach((name) => {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/already owned/i)).toBeInTheDocument();
  });

  it('shows no materials section when no items are tracked', async () => {
    mockState.items = () => [];

    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText(/start by tracking items/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Materials Needed/i)).not.toBeInTheDocument();
  });

  it('adds data-testid attributes to material cards', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Circuits')).toBeInTheDocument();
    });

    const circuitsCard = screen.getByText('Circuits').closest('[data-testid]');
    expect(circuitsCard).toBeInTheDocument();
    expect(circuitsCard.getAttribute('data-testid')).toBe('material-card-circuits');
  });

  it('lets the owned quantity be edited from the dashboard card', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Circuits')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Owned quantity for Circuits');
    expect(input.value).toBe('500');

    fireEvent.change(input, { target: { value: '900' } });

    // Circuits: needed=900, owned now 900, deficit=0 -> done -> hidden per #2
    await waitFor(() => {
      expect(screen.queryByText('Circuits')).not.toBeInTheDocument();
    });
  });

  it('shows a checkbox (not a number input) for a material needing only 1', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Orokin Cell')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Owned quantity for Orokin Cell');
    expect(input.type).toBe('checkbox');
    expect(input.checked).toBe(false);

    fireEvent.click(input);

    // Orokin Cell: needed=1, owned now 1, deficit=0 -> done -> hidden per #2
    await waitFor(() => {
      expect(screen.queryByText('Orokin Cell')).not.toBeInTheDocument();
    });
  });

  it('still shows a number input for materials needing more than 1', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Circuits')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Owned quantity for Circuits');
    expect(input.type).toBe('number');
  });

  it('shows the items using each material in the card', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Circuits')).toBeInTheDocument();
    });

    const circuitsCard = screen.getByText('Circuits').closest('.card');
    expect(circuitsCard.textContent).toContain('Excalibur');
    expect(circuitsCard.textContent).toContain('Mesa');
  });

  it('links each item name in Materials Needed to its item page', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Circuits')).toBeInTheDocument();
    });

    const circuitsCard = screen.getByText('Circuits').closest('.card');
    const excaliburLink = within(circuitsCard).getByText('Excalibur');
    expect(excaliburLink.tagName).toBe('A');
    expect(excaliburLink.getAttribute('href')).toBe('/items/item-1');

    const mesaLink = within(circuitsCard).getByText('Mesa');
    expect(mesaLink.tagName).toBe('A');
    expect(mesaLink.getAttribute('href')).toBe('/items/item-2');
  });

  // ── Conditional rendering tests ────────────────────────────────

  it('hides todos card when there are no todos', async () => {
    mockState.todos = () => [];

    render(React.createElement(Home));

    await waitFor(() => {
      // The tracked items card should still render
      expect(screen.getByText('Tracked Items')).toBeInTheDocument();
    });

    // Todos card should not be visible
    expect(screen.queryByTestId('todos-card')).not.toBeInTheDocument();
    // The "in progress" and "pending" badges should also be absent
    expect(screen.queryByText('in progress')).not.toBeInTheDocument();
    expect(screen.queryByText('pending')).not.toBeInTheDocument();
  });

  it('shows todos card when todos exist', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByTestId('todos-card')).toBeInTheDocument();
    });

    expect(screen.getByText('in progress')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('hides mods card when no mods are tracked', async () => {
    mockState.trackedMods = () => [];

    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Tracked Items')).toBeInTheDocument();
    });

    // Mods card should not be visible when no mods
    expect(screen.queryByTestId('mods-to-acquire-card')).not.toBeInTheDocument();
  });

  it('shows mods card when mods are tracked', async () => {
    mockState.trackedMods = () => [
      { id: 'mod-1', name: 'Serration', rarity: 'Common', mod_type: 'Rifle' },
      { id: 'mod-2', name: 'Split Chamber', rarity: 'Rare', mod_type: 'Rifle' },
    ];

    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByTestId('mods-to-acquire-card')).toBeInTheDocument();
    });

    const modsCard = screen.getByTestId('mods-to-acquire-card');
    expect(within(modsCard).getByText('Serration')).toBeInTheDocument();
    expect(within(modsCard).getByText('Split Chamber')).toBeInTheDocument();
    expect(within(modsCard).getByText('2')).toBeInTheDocument();
  });

  it('shows mod count and "View all mods" link when mods are tracked', async () => {
    mockState.trackedMods = () => [
      { id: 'mod-1', name: 'Serration', rarity: 'Common', mod_type: 'Rifle' },
    ];

    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByTestId('mods-to-acquire-card')).toBeInTheDocument();
    });

    expect(screen.getByText('View all mods →')).toBeInTheDocument();
    // The empty-state "Browse mods" text should NOT be present
    expect(screen.queryByText('Browse mods to start tracking.')).not.toBeInTheDocument();
  });
});
