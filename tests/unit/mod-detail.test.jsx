import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useParams } from 'next/navigation';
import React from 'react';

// ── Sample mod data ──────────────────────────────────────────────

const RANKABLE_MOD = {
  id: 'mod-detail-1',
  name: 'Abating Link',
  mod_type: 'Warframe Mod',
  polarity: 'zenurik',
  rarity: 'Rare',
  base_drain: 6,
  fusion_limit: 3,
  is_prime: false,
  is_augment: true,
  is_umbral: false,
  compat_name: 'Trinity',
  wiki_url: 'https://wiki.warframe.com/w/Abating_Link',
  owned: false,
  rank: 0,
};

const PRIMED_MOD = {
  id: 'mod-detail-2',
  name: 'Primed Continuity',
  mod_type: 'Warframe Mod',
  polarity: 'naramon',
  rarity: 'Legendary',
  base_drain: 10,
  fusion_limit: 10,
  is_prime: true,
  is_augment: false,
  is_umbral: false,
  compat_name: null,
  wiki_url: 'https://wiki.warframe.com/w/Primed_Continuity',
  owned: true,
  rank: 5,
};

const UMBRAL_MOD = {
  id: 'mod-detail-3',
  name: 'Umbral Intensify',
  mod_type: 'Warframe Mod',
  polarity: 'umbral',
  rarity: 'Rare',
  base_drain: 8,
  fusion_limit: 3,
  is_prime: false,
  is_augment: false,
  is_umbral: true,
  compat_name: null,
  wiki_url: 'https://wiki.warframe.com/w/Umbral_Intensify',
  owned: false,
  rank: 0,
};

const UNRANKABLE_MOD = {
  id: 'mod-detail-4',
  name: 'Unrankable Mod',
  mod_type: 'Warframe Mod',
  polarity: 'vazarin',
  rarity: 'Common',
  base_drain: 2,
  fusion_limit: 0,
  is_prime: false,
  is_augment: false,
  is_umbral: false,
  compat_name: 'All weapons',
  wiki_url: 'https://wiki.warframe.com/w/Unrankable_Mod',
  owned: true,
  rank: 0,
};

// ── Mock params (hoisted for use in vi.mock factory) ─────────────

const { mockParams } = vi.hoisted(() => ({
  mockParams: { id: 'mod-detail-1' },
}));

// ── Mock repo (hoisted) ─────────────────────────────────────────

const { mockModRepo } = vi.hoisted(() => ({
  mockModRepo: {
    _mods: {},
    getModById(id) {
      const mod = this._mods[id];
      return mod ? { ...mod } : null;
    },
    async setModOwned(id, owned) {
      if (this._mods[id]) {
        this._mods[id] = { ...this._mods[id], owned: !!owned };
      }
    },
    async setModRank(id, rank) {
      if (this._mods[id]) {
        const clamped = Math.max(0, Math.min(rank, this._mods[id].fusion_limit));
        this._mods[id] = { ...this._mods[id], rank: clamped };
      }
    },
    setModData(id, data) {
      this._mods[id] = { ...data };
    },
    reset() {
      this._mods = {};
    },
  },
}));

// ── Module mocks (hoisted by vitest) ─────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }) =>
    React.createElement('a', { href, className, ...props }, children),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ ...mockParams }),
}));

vi.mock('../../src/data/mod-store.js', () => ({
  default: mockModRepo,
}));

import ModDetailPage from '../../app/mods/[id]/page.jsx';

describe('ModDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModRepo.reset();
    mockParams.id = 'mod-detail-1';
  });

  // ── Loading state ─────────────────────────────────────────

  it('renders loading skeleton on mount', () => {
    render(React.createElement(ModDetailPage));
    expect(screen.getByTestId('mod-detail-loading')).toBeInTheDocument();
  });

  // ── Not found ────────────────────────────────────────────

  it('renders "Mod not found." for invalid IDs', async () => {
    mockParams.id = 'nonexistent';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-not-found')).toBeInTheDocument();
    });
    expect(screen.getByText('Mod not found.')).toBeInTheDocument();
    expect(screen.getByText('← Back to Mods')).toBeInTheDocument();
  });

  it('not found includes a back link to /mods', async () => {
    mockParams.id = 'nonexistent';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const backLink = screen.getByText('← Back to Mods');
      expect(backLink.closest('a')).toHaveAttribute('href', '/mods');
    });
  });

  // ── Mod name and badges ───────────────────────────────────

  it('renders mod name in header', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-name')).toHaveTextContent('Abating Link');
    });
  });

  it('renders type badge', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-type-badge')).toHaveTextContent('Warframe Mod');
    });
  });

  it('renders rarity badge', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-rarity-badge')).toHaveTextContent('Rare');
    });
  });

  it('renders polarity badge', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const polarityBadge = screen.getByTestId('mod-detail-polarity-badge');
      expect(polarityBadge).toHaveTextContent(/zenurik/i);
    });
  });

  // ── Special badges (prime, augment, umbral) ──────────────

  it('shows Augment badge for augment mods', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByText('Augment')).toBeInTheDocument();
    });
  });

  it('shows Prime badge for prime mods', async () => {
    mockModRepo.setModData('mod-detail-2', PRIMED_MOD);
    mockParams.id = 'mod-detail-2';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByText('Prime')).toBeInTheDocument();
    });
  });

  it('shows Umbral badge for umbral mods', async () => {
    mockModRepo.setModData('mod-detail-3', UMBRAL_MOD);
    mockParams.id = 'mod-detail-3';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByText('Umbral')).toBeInTheDocument();
    });
  });

  it('does not show special badges when not applicable', async () => {
    mockModRepo.setModData('mod-detail-4', UNRANKABLE_MOD);
    mockParams.id = 'mod-detail-4';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-name')).toHaveTextContent('Unrankable Mod');
    });
    expect(screen.queryByText('Prime')).not.toBeInTheDocument();
    expect(screen.queryByText('Augment')).not.toBeInTheDocument();
    expect(screen.queryByText('Umbral')).not.toBeInTheDocument();
  });

  // ── Stats card ───────────────────────────────────────────

  it('renders stats card with base drain', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const stats = screen.getByTestId('mod-detail-stats');
      expect(stats).toHaveTextContent('Base Drain:');
      expect(stats).toHaveTextContent('6');
    });
  });

  it('renders stats card with max rank (fusion_limit)', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const stats = screen.getByTestId('mod-detail-stats');
      expect(stats).toHaveTextContent('Max Rank:');
      expect(stats).toHaveTextContent('3');
    });
  });

  it('renders compatible with name', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const stats = screen.getByTestId('mod-detail-stats');
      expect(stats).toHaveTextContent('Compatible with:');
      expect(stats).toHaveTextContent('Trinity');
    });
  });

  it('shows "All compatible weapons" when compat_name is null', async () => {
    mockModRepo.setModData('mod-detail-2', PRIMED_MOD);
    mockParams.id = 'mod-detail-2';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const stats = screen.getByTestId('mod-detail-stats');
      expect(stats).toHaveTextContent('All compatible weapons');
    });
  });

  // ── Back link ────────────────────────────────────────────

  it('renders "← Back to Mods" link', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByText('← Back to Mods')).toBeInTheDocument();
    });
  });

  it('back link points to /mods', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const link = screen.getByText('← Back to Mods');
      expect(link.closest('a')).toHaveAttribute('href', '/mods');
    });
  });

  // ── Owned toggle ─────────────────────────────────────────

  it('renders owned toggle', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-owned-toggle')).toBeInTheDocument();
    });
  });

  it('owned toggle has label "Owned"', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const toggle = screen.getByTestId('mod-detail-owned-toggle');
      expect(toggle).toHaveTextContent('Owned');
    });
  });

  it('owned toggle checkbox is unchecked when mod is not owned', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const checkbox = screen.getByTestId('mod-detail-owned-toggle').querySelector('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
      expect(checkbox.checked).toBe(false);
    });
  });

  it('owned toggle checkbox is checked when mod is owned', async () => {
    mockModRepo.setModData('mod-detail-2', PRIMED_MOD);
    mockParams.id = 'mod-detail-2';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const checkbox = screen.getByTestId('mod-detail-owned-toggle').querySelector('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
      expect(checkbox.checked).toBe(true);
    });
  });

  it('clicking owned toggle updates ownership', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-name')).toHaveTextContent('Abating Link');
    });

    const checkbox = screen.getByTestId('mod-detail-owned-toggle').querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(checkbox.checked).toBe(true);
    });
  });

  // ── Rank slider ──────────────────────────────────────────

  it('shows "Not owned" text when mod is not owned', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByText('Not owned')).toBeInTheDocument();
    });
  });

  it('hides rank slider when mod is not owned', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByText('Not owned')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mod-detail-rank-slider')).not.toBeInTheDocument();
  });

  it('shows rank slider when mod is owned', async () => {
    mockModRepo.setModData('mod-detail-2', PRIMED_MOD);
    mockParams.id = 'mod-detail-2';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-rank-slider')).toBeInTheDocument();
    });
  });

  it('rank slider shows correct rank value', async () => {
    mockModRepo.setModData('mod-detail-2', PRIMED_MOD);
    mockParams.id = 'mod-detail-2';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const rankValue = screen.getByTestId('mod-detail-rank-value');
      expect(rankValue).toHaveTextContent('Rank 5 / 10');
    });
  });

  it('rank slider updates rank value on change', async () => {
    mockModRepo.setModData('mod-detail-2', PRIMED_MOD);
    mockParams.id = 'mod-detail-2';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-rank-slider')).toBeInTheDocument();
    });

    const slider = screen.getByTestId('mod-detail-rank-slider');
    fireEvent.change(slider, { target: { value: '8' } });

    await waitFor(() => {
      const rankValue = screen.getByTestId('mod-detail-rank-value');
      expect(rankValue).toHaveTextContent('Rank 8 / 10');
    });
  });

  // ── Unrankable mod ───────────────────────────────────────

  it('shows "Unrankable" text when fusion_limit is 0', async () => {
    mockModRepo.setModData('mod-detail-4', UNRANKABLE_MOD);
    mockParams.id = 'mod-detail-4';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByText('Unrankable')).toBeInTheDocument();
    });
  });

  it('hides rank slider when fusion_limit is 0', async () => {
    mockModRepo.setModData('mod-detail-4', { ...UNRANKABLE_MOD, owned: true });
    mockParams.id = 'mod-detail-4';
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByText('Unrankable')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mod-detail-rank-slider')).not.toBeInTheDocument();
  });

  // ── Wiki link ────────────────────────────────────────────

  it('renders wiki link with correct href', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const wikiLink = screen.getByTestId('mod-detail-wiki-link');
      expect(wikiLink).toHaveAttribute('href', 'https://wiki.warframe.com/w/Abating_Link');
    });
  });

  it('wiki link opens in new tab', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      const wikiLink = screen.getByTestId('mod-detail-wiki-link');
      expect(wikiLink).toHaveAttribute('target', '_blank');
      expect(wikiLink).toHaveAttribute('rel', 'noreferrer');
    });
  });

  // ── data-testid attributes ───────────────────────────────

  it('has mod-detail-page data-testid on root container', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-page')).toBeInTheDocument();
    });
  });

  it('has mod-detail-name data-testid', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-name')).toBeInTheDocument();
    });
  });

  it('has mod-detail-type-badge data-testid', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-type-badge')).toBeInTheDocument();
    });
  });

  it('has mod-detail-rarity-badge data-testid', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-rarity-badge')).toBeInTheDocument();
    });
  });

  it('has mod-detail-polarity-badge data-testid', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-polarity-badge')).toBeInTheDocument();
    });
  });

  it('has mod-detail-stats data-testid', async () => {
    mockModRepo.setModData('mod-detail-1', RANKABLE_MOD);
    render(React.createElement(ModDetailPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-detail-stats')).toBeInTheDocument();
    });
  });
});
