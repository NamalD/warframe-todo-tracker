import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ── Hoisted mock repo ──────────────────────────────────────────

const { mockModRepo } = vi.hoisted(() => ({
  mockModRepo: {
    _total: 0,
    _owned: 0,
    _shouldFail: false,
    _resolveDelay: 0,

    async getMods() {
      if (this._shouldFail) throw new Error('Failed to load');
      if (this._resolveDelay > 0) {
        await new Promise((r) => setTimeout(r, this._resolveDelay));
      }
      return [];
    },

    getStats() {
      return { total: this._total, owned: this._owned, unowned: this._total - this._owned };
    },

    reset() {
      this._total = 0;
      this._owned = 0;
      this._shouldFail = false;
      this._resolveDelay = 0;
    },
  },
}));

// ── Mocks ──────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('../../src/data/mod-store.js', () => ({
  default: mockModRepo,
}));

import ModDashboardSection from '../../src/components/mod-dashboard-section.jsx';

describe('ModDashboardSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModRepo.reset();
  });

  // ── Loading state ─────────────────────────────────────────

  it('renders loading skeleton on mount', () => {
    mockModRepo._resolveDelay = 1000; // keep loading
    render(React.createElement(ModDashboardSection));
    expect(screen.getByTestId('mod-dashboard-section')).toBeInTheDocument();
    const skeletons = document.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  // ── Error / not loaded ────────────────────────────────────

  it('renders nothing when mods fail to load', async () => {
    mockModRepo._shouldFail = true;
    const { container } = render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      expect(container.innerHTML).toBe('');
    });
  });

  // ── Empty state ───────────────────────────────────────────

  it('renders empty state when no mods are loaded', async () => {
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      expect(screen.getByTestId('mod-dashboard-section')).toBeInTheDocument();
    });
    expect(screen.getByText(/Your mod collection is empty/i)).toBeInTheDocument();
  });

  it('empty state has a link to /mods', async () => {
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      const link = screen.getByText(/Start tracking/i).closest('a');
      expect(link).toHaveAttribute('href', '/mods');
    });
  });

  // ── Normal state ──────────────────────────────────────────

  it('renders section title "Mod Collection"', async () => {
    mockModRepo._total = 1803;
    mockModRepo._owned = 45;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      expect(screen.getByText('Mod Collection')).toBeInTheDocument();
    });
  });

  it('renders "X / Y owned" stats', async () => {
    mockModRepo._total = 1803;
    mockModRepo._owned = 45;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      expect(screen.getByTestId('mod-dashboard-stats')).toHaveTextContent('45 / 1,803 owned');
    });
  });

  it('renders progress bar with correct width', async () => {
    mockModRepo._total = 100;
    mockModRepo._owned = 25;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      const section = screen.getByTestId('mod-dashboard-section');
      const fill = section.querySelector('.progress-fill');
      expect(fill).toBeInTheDocument();
      expect(fill).toHaveStyle({ width: '25%' });
    });
  });

  it('renders "Browse all mods →" link', async () => {
    mockModRepo._total = 1803;
    mockModRepo._owned = 45;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      expect(screen.getByText(/Browse all mods/i)).toBeInTheDocument();
    });
  });

  it('browse link points to /mods', async () => {
    mockModRepo._total = 1803;
    mockModRepo._owned = 45;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      const link = screen.getByTestId('mod-dashboard-link');
      expect(link).toHaveAttribute('href', '/mods');
    });
  });

  // ── data-testid attributes ────────────────────────────────

  it('has mod-dashboard-section data-testid', async () => {
    mockModRepo._total = 1803;
    mockModRepo._owned = 45;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      expect(screen.getByTestId('mod-dashboard-section')).toBeInTheDocument();
    });
  });

  it('has mod-dashboard-stats data-testid', async () => {
    mockModRepo._total = 1803;
    mockModRepo._owned = 45;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      expect(screen.getByTestId('mod-dashboard-stats')).toBeInTheDocument();
    });
  });

  it('has mod-dashboard-link data-testid', async () => {
    mockModRepo._total = 1803;
    mockModRepo._owned = 45;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      expect(screen.getByTestId('mod-dashboard-link')).toBeInTheDocument();
    });
  });

  // ── Edge cases ────────────────────────────────────────────

  it('shows 0 / 0 when total is 0 (empty)', async () => {
    mockModRepo._total = 0;
    mockModRepo._owned = 0;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      expect(screen.getByText(/empty/i)).toBeInTheDocument();
    });
  });

  it('shows 100% fill when all mods owned', async () => {
    mockModRepo._total = 50;
    mockModRepo._owned = 50;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      const fill = screen.getByTestId('mod-dashboard-section').querySelector('.progress-fill');
      expect(fill).toHaveStyle({ width: '100%' });
    });
  });

  it('shows 0% fill when no mods owned', async () => {
    mockModRepo._total = 50;
    mockModRepo._owned = 0;
    render(React.createElement(ModDashboardSection));
    await waitFor(() => {
      const fill = screen.getByTestId('mod-dashboard-section').querySelector('.progress-fill');
      expect(fill).toHaveStyle({ width: '0%' });
    });
  });
});
