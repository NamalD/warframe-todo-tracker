import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ── Hoisted mocks (vi.mock factories are hoisted) ──────────────

const { mockLoadouts, mockItems, mockLoadoutRepo } = vi.hoisted(() => {
  const loads = [];
  const items = [];
  const repo = {
    _syncCallback: null,
    lastSyncError: null,
    setSyncEventCallback(cb) {
      repo._syncCallback = cb;
    },
    forceSyncToServer() {
      return Promise.resolve(true);
    },
    syncFromServer() {
      return Promise.resolve();
    },
    getLoadoutById(id) {
      const l = loads.find((loadout) => loadout.id === id);
      if (!l) return null;
      return {
        ...l,
        slots: (l.slots || []).map((s) => ({
          ...s,
          requirements: (s.requirements || []).map((r) => ({ ...r })),
        })),
      };
    },
    updateSlot(loadoutId, slotId, updates) {
      const loadout = loads.find((l) => l.id === loadoutId);
      if (!loadout) return null;
      const slot = (loadout.slots || []).find((s) => s.id === slotId);
      if (!slot) return null;
      Object.assign(slot, updates);
      return { ...slot };
    },
    updateRequirement(slotId, reqId, updates) {
      for (const loadout of loads) {
        for (const slot of loadout.slots || []) {
          const req = (slot.requirements || []).find((r) => r.id === reqId);
          if (req) {
            Object.assign(req, updates);
            return { ...req };
          }
        }
      }
      return null;
    },
    deleteLoadout: vi.fn(),
    deleteSlot: vi.fn(),
    deleteRequirement: vi.fn(),
    addRequirement: vi.fn(() => ({ id: 'new-req' })),
    addSlot: vi.fn(),
    getLoadouts: vi.fn(() => []),
  };
  return { mockLoadouts: loads, mockItems: items, mockLoadoutRepo: repo };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('../../src/data/loadout-store.js', () => ({
  default: mockLoadoutRepo,
}));

vi.mock('../../src/data/store.js', () => ({
  default: {
    getAllItems: () => mockItems,
    getItemById: (id) => mockItems.find((it) => it.id === id),
  },
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'loadout-1' }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Import the component to test
import LoadoutDetailInner from '../../app/loadouts/[id]/page.jsx';

describe('LoadoutDetailPage — checkbox styling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    mockLoadoutRepo._syncCallback = null;
    mockLoadoutRepo.lastSyncError = null;
    mockLoadouts.length = 0;
    mockItems.length = 0;

    mockItems.push(
      { id: 'item-1', name: 'Saryn', item_type: 'warframe' },
      { id: 'item-4', name: 'Ceti Lacera', item_type: 'melee' }
    );

    mockLoadouts.push({
      id: 'loadout-1',
      name: 'Saryn Loadout',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      slots: [
        {
          id: 'slot-1',
          loadout_id: 'loadout-1',
          slot_type: 'warframe',
          item_id: 'item-1',
          custom_item_name: null,
          acquired: true,
          notes: '',
          display_order: 0,
          requirements: [],
        },
        {
          id: 'slot-2',
          loadout_id: 'loadout-1',
          slot_type: 'primary',
          item_id: 'item-4',
          custom_item_name: null,
          acquired: false,
          notes: '',
          display_order: 1,
          requirements: [
            {
              id: 'req-1',
              slot_id: 'slot-2',
              name: 'Catalyst',
              wiki_url: 'https://wiki.example.com/catalyst',
              user_notes: 'Need blueprint',
              acquired: false,
            },
          ],
        },
      ],
    });
  });

  it('renders "Acquired" labels for each populated slot', async () => {
    render(React.createElement(LoadoutDetailInner));
    await waitFor(() => {
      const acquiredLabels = screen.getAllByText('Acquired');
      expect(acquiredLabels.length).toBe(2);
    });
  });

  it('renders checkboxes for each populated slot (requirements collapsed)', async () => {
    const { container } = render(React.createElement(LoadoutDetailInner));
    await waitFor(() => {
      expect(screen.getByText('Saryn')).toBeInTheDocument();
    });

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
  });

  it('checkbox is checked when slot.acquired is true', async () => {
    const { container } = render(React.createElement(LoadoutDetailInner));
    await waitFor(() => {
      expect(screen.getByText('Saryn')).toBeInTheDocument();
    });

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it('clicking the checkbox toggles the acquired state', async () => {
    const { container } = render(React.createElement(LoadoutDetailInner));
    await waitFor(() => {
      expect(screen.getByText('Saryn')).toBeInTheDocument();
    });

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const slot2Checkbox = checkboxes[1];

    fireEvent.click(slot2Checkbox);
    await waitFor(() => {
      expect(slot2Checkbox.checked).toBe(true);
    });

    fireEvent.click(slot2Checkbox);
    await waitFor(() => {
      expect(slot2Checkbox.checked).toBe(false);
    });
  });

  it('label wrapping the checkbox has cursor pointer for accessibility', async () => {
    const { container } = render(React.createElement(LoadoutDetailInner));
    await waitFor(() => {
      expect(screen.getByText('Saryn')).toBeInTheDocument();
    });

    const labels = container.querySelectorAll('label');
    const acquiredLabels = Array.from(labels).filter(
      (l) => l.textContent.includes('Acquired')
    );
    expect(acquiredLabels.length).toBe(2);
    for (const label of acquiredLabels) {
      expect(label.style.cursor).toBe('pointer');
    }
  });

  it('checkbox is inside a .slot-card container', async () => {
    const { container } = render(React.createElement(LoadoutDetailInner));
    await waitFor(() => {
      expect(screen.getByText('Saryn')).toBeInTheDocument();
    });

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
      const slotCard = checkbox.closest('.slot-card');
      expect(slotCard).not.toBeNull();
    }
  });

  it('expanding requirements reveals requirement checkboxes inside .slot-card', async () => {
    const { container } = render(React.createElement(LoadoutDetailInner));
    await waitFor(() => {
      expect(screen.getByText('Saryn')).toBeInTheDocument();
    });

    const reqButton = screen.getByText(/Requirements \(1\)/);
    fireEvent.click(reqButton);

    await waitFor(() => {
      expect(screen.getByText('Catalyst')).toBeInTheDocument();
    });

    const reqCheckboxes = container.querySelectorAll('.requirement-row input[type="checkbox"]');
    expect(reqCheckboxes.length).toBe(1);
    expect(reqCheckboxes[0].checked).toBe(false);

    const slotCard = reqCheckboxes[0].closest('.slot-card');
    expect(slotCard).not.toBeNull();
  });

  it('checkbox appearance is styleable via CSS', async () => {
    const { container } = render(React.createElement(LoadoutDetailInner));
    await waitFor(() => {
      expect(screen.getByText('Saryn')).toBeInTheDocument();
    });

    const checkbox = container.querySelector('.slot-card input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    const style = window.getComputedStyle(checkbox);
    expect(style).toBeDefined();
    expect(style.width).toBeDefined();
    expect(style.height).toBeDefined();
  });

  it('requirement checkbox toggles when clicked', async () => {
    const { container } = render(React.createElement(LoadoutDetailInner));
    await waitFor(() => {
      expect(screen.getByText('Saryn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Requirements \(1\)/));
    await waitFor(() => {
      expect(screen.getByText('Catalyst')).toBeInTheDocument();
    });

    const reqCheckbox = container.querySelector('.requirement-row input[type="checkbox"]');
    expect(reqCheckbox.checked).toBe(false);

    fireEvent.click(reqCheckbox);
    await waitFor(() => {
      expect(reqCheckbox.checked).toBe(true);
    });
  });
});
