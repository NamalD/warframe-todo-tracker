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

vi.mock('../../src/data/store.ts', () => ({
  default: {
    getAllItems: () => Promise.resolve(mockItems.map((it) => ({ ...it }))),
  },
}));

import ItemsList from '../../app/items/page';

describe('ItemsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders only tracked items by default', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
      expect(screen.getByText('Rubico Prime')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mesa')).not.toBeInTheDocument();
    expect(screen.queryByText('Kronen Prime')).not.toBeInTheDocument();
    expect(screen.queryByText('Akks Prime')).not.toBeInTheDocument();
  });

  it('shows all items when the tracked-only checkbox is unchecked', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox'));

    mockItems.forEach((item) => {
      expect(screen.getByText(item.name)).toBeInTheDocument();
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

  it('re-checking tracked only after unchecking filters back down', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox); // uncheck -> show all
    expect(screen.getByText('Mesa')).toBeInTheDocument();

    fireEvent.click(checkbox); // re-check -> tracked only
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

    expect(screen.getByText('No items match this filter or search.')).toBeInTheDocument();
  });

  it('renders item type badges', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox')); // show all items

    const warframeBadges = screen.getAllByText('warframe');
    expect(warframeBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('melee')).toBeInTheDocument();
    expect(screen.getByText('primary')).toBeInTheDocument();
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
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox')); // show all items

    expect(screen.getByText('MR 0')).toBeInTheDocument();
    expect(screen.getByText('MR 4')).toBeInTheDocument();
    expect(screen.getByText('MR 14')).toBeInTheDocument();
  });

  it('renders blueprint source', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Blueprint: quest')).toBeInTheDocument();
      const dropSources = screen.getAllByText('Blueprint: drop');
      expect(dropSources.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('combined filter: search + tracked only (default)', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Search items by name...');
    fireEvent.change(input, { target: { value: 'rubico' } });

    expect(screen.getByText('Rubico Prime')).toBeInTheDocument();
    expect(screen.queryByText('Excalibur')).not.toBeInTheDocument();
  });

  // Category filter tests
  it('renders category pill buttons for all distinct item types', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });

    expect(screen.getByTestId('category-btn-warframe')).toBeInTheDocument();
    expect(screen.getByTestId('category-btn-melee')).toBeInTheDocument();
    expect(screen.getByTestId('category-btn-primary')).toBeInTheDocument();
    expect(screen.getByTestId('category-btn-companion')).toBeInTheDocument();
  });

  it('filters items by a single category', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });

    // Uncheck tracked-only so we see all items first
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Mesa')).toBeInTheDocument();
    expect(screen.getByText('Kronen Prime')).toBeInTheDocument();

    // Click the Warframe pill
    fireEvent.click(screen.getByTestId('category-btn-warframe'));

    // Only warframes should be visible
    expect(screen.getByText('Excalibur')).toBeInTheDocument();
    expect(screen.getByText('Mesa')).toBeInTheDocument();
    expect(screen.queryByText('Kronen Prime')).not.toBeInTheDocument();
    expect(screen.queryByText('Rubico Prime')).not.toBeInTheDocument();
  });

  it('supports multi-select: selecting two categories', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox')); // show all

    fireEvent.click(screen.getByTestId('category-btn-warframe'));
    fireEvent.click(screen.getByTestId('category-btn-primary'));

    expect(screen.getByText('Excalibur')).toBeInTheDocument();
    expect(screen.getByText('Mesa')).toBeInTheDocument();
    expect(screen.getByText('Rubico Prime')).toBeInTheDocument();
    expect(screen.queryByText('Kronen Prime')).not.toBeInTheDocument();
  });

  it('deselects a category on second click', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox'));

    // Select warframe, then deselect
    fireEvent.click(screen.getByTestId('category-btn-warframe'));
    expect(screen.queryByText('Kronen Prime')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('category-btn-warframe'));
    // All items should be back
    expect(screen.getByText('Kronen Prime')).toBeInTheDocument();
  });

  it('combines category filter with search text', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox'));

    // Select warframe category
    fireEvent.click(screen.getByTestId('category-btn-warframe'));
    // Then search for "mesa"
    const input = screen.getByPlaceholderText('Search items by name...');
    fireEvent.change(input, { target: { value: 'mesa' } });

    expect(screen.getByText('Mesa')).toBeInTheDocument();
    expect(screen.queryByText('Excalibur')).not.toBeInTheDocument();
  });

  it('combines category filter with tracked-only toggle', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    // Default is tracked-only, now filter to warframe
    fireEvent.click(screen.getByTestId('category-btn-warframe'));

    // Excalibur is warframe + tracked → visible
    expect(screen.getByText('Excalibur')).toBeInTheDocument();
    // Mesa is warframe but NOT tracked → hidden
    expect(screen.queryByText('Mesa')).not.toBeInTheDocument();
    // Rubico Prime is tracked but primary → hidden (category filter)
    expect(screen.queryByText('Rubico Prime')).not.toBeInTheDocument();
  });

  it('Select All button selects all categories', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByTestId('category-select-all'));

    // All items should be visible
    expect(screen.getByText('Excalibur')).toBeInTheDocument();
    expect(screen.getByText('Mesa')).toBeInTheDocument();
    expect(screen.getByText('Kronen Prime')).toBeInTheDocument();
    expect(screen.getByText('Rubico Prime')).toBeInTheDocument();
    expect(screen.getByText('Akks Prime')).toBeInTheDocument();
  });

  it('Clear All button deselects all categories', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox'));

    // Select a category first
    fireEvent.click(screen.getByTestId('category-btn-warframe'));
    expect(screen.queryByText('Kronen Prime')).not.toBeInTheDocument();

    // Clear all
    fireEvent.click(screen.getByTestId('category-clear-all'));

    // All items should be back
    expect(screen.getByText('Kronen Prime')).toBeInTheDocument();
  });

  // Edge-case tests

  it('handles single item list with one pill button', async () => {
    const singleRepo = {
      getAllItems: () => Promise.resolve([
        { id: 'item-1', name: 'Excalibur', item_type: 'warframe', mastery_rank_required: 0, is_user_tracked: false, blueprint_source: 'quest' },
      ]),
    };
    vi.doMock('../../src/data/store.ts', () => ({ default: singleRepo }));
    const { default: ItemsListSingle } = await import('../../app/items/page');
    render(React.createElement(ItemsListSingle));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    // Only one pill renders and select/deselect is a no-op
    expect(screen.getByTestId('category-btn-warframe')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('category-btn-warframe'));
    expect(screen.getByText('Excalibur')).toBeInTheDocument();
  });

  it('renders companion label correctly', async () => {
    render(React.createElement(ItemsList));
    await waitFor(() => {
      expect(screen.getByText('Excalibur')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('checkbox')); // show all
    const companionBtn = screen.getByTestId('category-btn-companion');
    expect(companionBtn).toHaveTextContent('Companion');
  });
});
