import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) =>
    React.createElement('a', { href, ...props }, children),
}));

let mockLoadouts;

function MockLR() {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    syncFromServer: vi.fn().mockResolvedValue(undefined),
    getLoadouts: vi.fn(() => mockLoadouts.map((l) => ({
      ...l,
      slots: (l.slots || []).map((s) => ({
        ...s,
        requirements: (s.requirements || []).map((r) => ({ ...r })),
      })),
    }))),
    createLoadout: vi.fn(({ name }) => {
      const id = 'new-loadout-' + Date.now();
      const newLoadout = {
        id,
        name: name.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        slots: [],
      };
      mockLoadouts.push(newLoadout);
      return { ...newLoadout, slots: [] };
    }),
    deleteLoadout: vi.fn((id) => {
      const idx = mockLoadouts.findIndex((l) => l.id === id);
      if (idx !== -1) {
        mockLoadouts.splice(idx, 1);
        return true;
      }
      return false;
    }),
    getLoadoutById: vi.fn((id) => {
      const l = mockLoadouts.find((loadout) => loadout.id === id);
      return l ? { ...l, slots: (l.slots || []).map((s) => ({ ...s, requirements: (s.requirements || []).map((r) => ({ ...r })) })) } : null;
    }),
  };
}

vi.mock('../../src/data/loadout-repository.ts', () => ({
  default: MockLR,
}));

// Dynamic mock state for search params
let currentFilter = 'all';
let setSearchParamsCallback = null;

const mockReplace = vi.fn((url) => {
  // Parse the URL to extract the status param
  if (url.includes('status=')) {
    currentFilter = url.split('status=')[1].split('&')[0];
  } else if (url === window.location.pathname || url === '/') {
    currentFilter = 'all';
  }
  // Trigger a re-render by calling the setSearchParams callback if available
  if (setSearchParamsCallback) {
    setSearchParamsCallback(currentFilter);
  }
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => {
    // Use a React state hook-like pattern to trigger re-renders
    const [, forceUpdate] = React.useState(0);
    React.useEffect(() => {
      setSearchParamsCallback = (newFilter) => {
        currentFilter = newFilter;
        forceUpdate((n) => n + 1);
      };
      return () => { setSearchParamsCallback = null; };
    }, []);

    return {
      get: (key) => {
        if (key === 'status') return currentFilter === 'all' ? null : currentFilter;
        return null;
      },
      toString: () => currentFilter !== 'all' ? `status=${currentFilter}` : '',
    };
  },
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

import LoadoutsPage from '../../app/loadouts/page';

describe('LoadoutsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentFilter = 'all';
    setSearchParamsCallback = null;
    mockReplace.mockClear();

    mockLoadouts = [
      {
        id: 'loadout-1',
        name: 'Saryn Loadout',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        slots: [
          { id: 'slot-1', loadout_id: 'loadout-1', slot_type: 'warframe', item_id: 'item-1', custom_item_name: null, acquired: true, notes: '', display_order: 0, requirements: [] },
          { id: 'slot-2', loadout_id: 'loadout-1', slot_type: 'primary', item_id: 'item-4', custom_item_name: null, acquired: false, notes: '', display_order: 1, requirements: [] },
          { id: 'slot-3', loadout_id: 'loadout-1', slot_type: 'secondary', item_id: null, custom_item_name: null, acquired: false, notes: '', display_order: 2, requirements: [] },
        ],
      },
      {
        id: 'loadout-2',
        name: 'Fully Complete',
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        slots: [
          { id: 'slot-4', loadout_id: 'loadout-2', slot_type: 'warframe', item_id: 'item-2', custom_item_name: null, acquired: true, notes: '', display_order: 0, requirements: [] },
        ],
      },
    ];
  });

  it('renders the page heading', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('Loadouts')).toBeInTheDocument();
    });
  });

  it('renders the loading state initially', () => {
    const { container } = render(React.createElement(LoadoutsPage));
    expect(container.querySelector('.skeleton-card')).toBeInTheDocument();
  });

  it('renders loadout names after loading', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('Saryn Loadout')).toBeInTheDocument();
    });
    expect(screen.getByText('Fully Complete')).toBeInTheDocument();
  });

  it('renders "+ New Loadout" button', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('+ New Loadout')).toBeInTheDocument();
    });
  });

  it('clicking "+ New Loadout" shows the create form', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('+ New Loadout')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ New Loadout'));

    await waitFor(() => {
      expect(screen.getByText('New Loadout')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Loadout name (e.g., Saryn Loadout)')).toBeInTheDocument();
      expect(screen.getByText('Create')).toBeInTheDocument();
    });
  });

  it('clicking "+ New Loadout" again cancels the form', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('+ New Loadout')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ New Loadout'));
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.getByText('+ New Loadout')).toBeInTheDocument();
    });
  });

  it('creates a new loadout', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('+ New Loadout')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ New Loadout'));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Loadout name (e.g., Saryn Loadout)')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Loadout name (e.g., Saryn Loadout)'), {
      target: { value: 'Nova Loadout' },
    });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(screen.getByText('Nova Loadout')).toBeInTheDocument();
    });
  });

  it('renders filter buttons', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
    });
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    // "Complete" appears both as a filter button and a badge
    const completeElements = screen.getAllByText('Complete');
    expect(completeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('filters to show in-progress loadouts', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('Saryn Loadout')).toBeInTheDocument();
      expect(screen.getByText('Fully Complete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('In Progress'));

    await waitFor(() => {
      // Saryn Loadout has unacquired slots, so should show
      expect(screen.getByText('Saryn Loadout')).toBeInTheDocument();
      // Fully Complete should not show
      expect(screen.queryByText('Fully Complete')).toBeNull();
    }, { timeout: 5000 });
  });

  it('filters to show complete loadouts', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('Saryn Loadout')).toBeInTheDocument();
      expect(screen.getByText('Fully Complete')).toBeInTheDocument();
    });

    // Use getAllByText since "Complete" appears both as button and badge
    const completeElements = screen.getAllByText('Complete');
    // Find the filter button (not the badge)
    const completeButton = completeElements.find((el) => el.tagName === 'BUTTON');
    fireEvent.click(completeButton);

    await waitFor(() => {
      // Fully Complete has all slots acquired
      expect(screen.getByText('Fully Complete')).toBeInTheDocument();
      // Saryn Loadout is not complete
      expect(screen.queryByText('Saryn Loadout')).toBeNull();
    }, { timeout: 5000 });
  });

  it('shows "Open" and "Delete" buttons per loadout', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('Saryn Loadout')).toBeInTheDocument();
    });

    const openButtons = screen.getAllByText('Open');
    expect(openButtons.length).toBeGreaterThanOrEqual(1);

    const deleteButtons = screen.getAllByText('Delete');
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a loadout when Delete is clicked', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('Saryn Loadout')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('Saryn Loadout')).toBeNull();
    });
  });

  it('shows empty state when no loadouts exist', async () => {
    mockLoadouts = [];
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('No loadouts yet')).toBeInTheDocument();
    });
  });

  it('shows complete badge on fully complete loadouts', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('Fully Complete')).toBeInTheDocument();
    });

    // "Complete" appears as a filter button AND a badge
    const completeElements = screen.getAllByText('Complete');
    expect(completeElements.length).toBeGreaterThanOrEqual(2);
  });

  it('shows acquired count per loadout', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('Saryn Loadout')).toBeInTheDocument();
    });

    // Saryn Loadout has 2 populated slots (warframe + primary), 1 acquired
    expect(screen.getByText(/2 items • 1 \/ 2 acquired/)).toBeInTheDocument();
  });

  it('loadout name links to detail page', async () => {
    render(React.createElement(LoadoutsPage));
    await waitFor(() => {
      expect(screen.getByText('Saryn Loadout')).toBeInTheDocument();
    });

    const link = screen.getByText('Saryn Loadout').closest('a');
    expect(link).toHaveAttribute('href', '/loadouts/loadout-1');
  });
});
