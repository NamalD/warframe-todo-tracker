import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }) =>
    React.createElement('a', { href, className, ...props }, children),
}));

const mockItems = [
  { id: 'item-1', name: 'Excalibur', item_type: 'warframe', mastery_rank_required: 0, is_user_tracked: true, blueprint_source: 'quest' },
  { id: 'item-2', name: 'Mesa', item_type: 'warframe', mastery_rank_required: 4, is_user_tracked: false, blueprint_source: 'research' },
  { id: 'item-3', name: 'Kronen Prime', item_type: 'melee', mastery_rank_required: 14, is_user_tracked: false, blueprint_source: 'drop' },
  { id: 'item-4', name: 'Rubico Prime', item_type: 'primary', mastery_rank_required: 12, is_user_tracked: true, blueprint_source: 'drop' },
  { id: 'item-5', name: 'Akks Prime', item_type: 'companion', mastery_rank_required: 6, is_user_tracked: false, blueprint_source: 'clan' },
];

vi.mock('../../src/data/store.js', () => ({
  default: {
    getAllItems: () => Promise.resolve(mockItems.map((it) => ({ ...it }))),
  },
}));

import ItemsList from '../../app/items/page.jsx';

describe('ItemsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all items by default', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      mockItems.forEach((item) => {
        expect(screen.getByText(item.name)).toBeInTheDocument();
      });
    });
  });

  it('renders the search input', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search items by name...')).toBeInTheDocument();
    });
  });

  it('filters items by search text', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Rubico Prime')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Search items by name...');
    fireEvent.change(input, { target: { value: 'rubico' } });

    expect(screen.getByText('Rubico Prime')).toBeInTheDocument();
    expect(screen.queryByText('Excalibur')).not.toBeInTheDocument();
  });

  it('filters by tracked only checkbox', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Only tracked items should show
    expect(screen.getByText('Excalibur')).toBeInTheDocument();
    expect(screen.getByText('Rubico Prime')).toBeInTheDocument();
    expect(screen.queryByText('Mesa')).not.toBeInTheDocument();
    expect(screen.queryByText('Kronen Prime')).not.toBeInTheDocument();
  });

  it('shows empty state when no items match', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search items by name...')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Search items by name...');
    fireEvent.change(input, { target: { value: 'zzzznotfound' } });

    expect(screen.getByText('No items match this filter.')).toBeInTheDocument();
  });

  it('renders item type badges', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      const warframeBadges = screen.getAllByText('warframe');
      expect(warframeBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('melee')).toBeInTheDocument();
      expect(screen.getByText('primary')).toBeInTheDocument();
    });
  });

  it('renders tracked badge for tracked items', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      const trackedBadges = screen.getAllByText('tracked');
      expect(trackedBadges.length).toBe(2); // Excalibur and Rubico Prime
    });
  });

  it('renders mastery rank requirement', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('MR 0')).toBeInTheDocument();
      expect(screen.getByText('MR 4')).toBeInTheDocument();
      expect(screen.getByText('MR 14')).toBeInTheDocument();
    });
  });

  it('renders blueprint source', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Blueprint: quest')).toBeInTheDocument();
      const dropSources = screen.getAllByText('Blueprint: drop');
      expect(dropSources.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('combined filter: search + tracked only', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const input = screen.getByPlaceholderText('Search items by name...');
    fireEvent.change(input, { target: { value: 'rubico' } });

    expect(screen.getByText('Rubico Prime')).toBeInTheDocument();
    expect(screen.queryByText('Excalibur')).not.toBeInTheDocument();
  });
});
