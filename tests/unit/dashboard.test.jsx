import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const mockTrackedMods = [];

// ── Hoisted mock state (shared mutable references) ────────────

const mockState = vi.hoisted(() => ({
  items: () => mockItems.map((it) => ({ ...it })),
  todos: () => mockTodos.map((t) => ({ ...t })),
  inventory: () => ({ ...mockInventory }),
  materials: (id) => (mockMaterials[id] || []).map((m) => ({ ...m })),
}));

vi.mock('../../src/data/mod-store.js', () => ({
  default: {
    getTrackedMods: () => Promise.resolve(mockTrackedMods),
  },
}));

vi.mock('../../src/data/store.js', () => ({
  default: {
    getAllItems: () => Promise.resolve(mockState.items()),
    getTodos: () => mockState.todos(),
    getMaterialInventory: () => mockState.inventory(),
    getMaterialsForItem: (id) => Promise.resolve(mockState.materials(id)),
  },
}));

import Home from '../../app/page.jsx';

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state to defaults
    mockState.items = () => mockItems.map((it) => ({ ...it }));
    mockState.inventory = () => ({ ...mockInventory });
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
      expect(screen.getByText('Alloy Plate')).toBeInTheDocument();
    });

    // Alloy Plate: needed=2000 (1200+800), owned=2000, deficit=0 → done
    const alloyCard = screen.getByText('Alloy Plate').closest('.card');
    expect(alloyCard).toBeInTheDocument();
    expect(alloyCard.textContent).toContain('done');

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
      expect(screen.getByText('Alloy Plate')).toBeInTheDocument();
    });

    // Circuits: owned 500, should be visible
    const circuitsCard = screen.getByText('Circuits').closest('.card');
    expect(circuitsCard.textContent).toContain('500');
  });

  it('dims cards for fully-owned materials (deficit <= 0)', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Alloy Plate')).toBeInTheDocument();
    });

    // Alloy Plate: owned=2000, needed=2000, deficit=0 → done
    const alloyCard = screen.getByText('Alloy Plate').closest('.card');
    expect(alloyCard.style.opacity).toBe('0.65');

    // Circuits: owned=500, needed=900, deficit=400 → not done
    const circuitsCard = screen.getByText('Circuits').closest('.card');
    expect(circuitsCard.style.opacity).toBe('');

    // Polymer Bundle: owned=0, needed=200, deficit=200 → not done
    const polymerCard = screen.getByText('Polymer Bundle').closest('.card');
    expect(polymerCard.style.opacity).toBe('');
  });

  it('shows all materials cards dimmed when everything is owned', async () => {
    // Override via shared mock state (no module cache mutation)
    mockState.inventory = () => ({
      'Alloy Plate': 5000,
      'Circuits': 5000,
      'Polymer Bundle': 5000,
      'Nano Spores': 5000,
    });

    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Alloy Plate')).toBeInTheDocument();
    });

    ['Alloy Plate', 'Circuits', 'Polymer Bundle', 'Nano Spores'].forEach((name) => {
      const card = screen.getByText(name).closest('.card');
      expect(card.style.opacity).toBe('0.65');
    });
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
      expect(screen.getByText('Alloy Plate')).toBeInTheDocument();
    });

    const alloyCard = screen.getByText('Alloy Plate').closest('[data-testid]');
    expect(alloyCard).toBeInTheDocument();
    expect(alloyCard.getAttribute('data-testid')).toBe('material-card-alloy-plate');
  });

  it('shows the items using each material in the card', async () => {
    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByText('Alloy Plate')).toBeInTheDocument();
    });

    const alloyCard = screen.getByText('Alloy Plate').closest('.card');
    expect(alloyCard.textContent).toContain('Excalibur');
    expect(alloyCard.textContent).toContain('Mesa');
  });
});
