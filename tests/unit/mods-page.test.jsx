import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, className, ...props }) =>
    React.createElement('a', { href, className, ...props }, children),
}));

const SAMPLE_MODS = vi.hoisted(() => [
  { id:'mod-1', name:'Abating Link', mod_type:'Warframe Mod', polarity:'zenurik', rarity:'Rare', base_drain:6, fusion_limit:3, is_prime:false, is_augment:true, is_umbral:false, compat_name:'Trinity', wiki_url:'https://wiki.warframe.com/w/Abating_Link', owned:false, rank:0 },
  { id:'mod-2', name:'Primed Continuity', mod_type:'Warframe Mod', polarity:'naramon', rarity:'Legendary', base_drain:10, fusion_limit:10, is_prime:true, is_augment:false, is_umbral:false, compat_name:null, wiki_url:'https://wiki.warframe.com/w/Primed_Continuity', owned:true, rank:5 },
  { id:'mod-3', name:'Umbral Intensify', mod_type:'Warframe Mod', polarity:'umbral', rarity:'Rare', base_drain:8, fusion_limit:3, is_prime:false, is_augment:false, is_umbral:true, compat_name:null, wiki_url:'https://wiki.warframe.com/w/Umbral_Intensify', owned:false, rank:0 },
  { id:'mod-4', name:'Point Strike', mod_type:'Rifle Mod', polarity:'madurai', rarity:'Common', base_drain:4, fusion_limit:5, is_prime:false, is_augment:false, is_umbral:false, compat_name:null, wiki_url:'https://wiki.warframe.com/w/Point_Strike', owned:true, rank:5 },
  { id:'mod-5', name:'Vital Sense', mod_type:'Rifle Mod', polarity:'madurai', rarity:'Rare', base_drain:6, fusion_limit:5, is_prime:false, is_augment:false, is_umbral:false, compat_name:null, wiki_url:'https://wiki.warframe.com/w/Vital_Sense', owned:false, rank:0 },
  { id:'mod-6', name:'Streamline', mod_type:'Warframe Mod', polarity:'naramon', rarity:'Uncommon', base_drain:4, fusion_limit:5, is_prime:false, is_augment:false, is_umbral:false, compat_name:null, wiki_url:'https://wiki.warframe.com/w/Streamline', owned:true, rank:5 },
]);

const mockSetModOwned = vi.hoisted(() => vi.fn());

vi.mock('../../src/data/mod-store.js', () => ({
  default: {
    getMods: () => Promise.resolve(SAMPLE_MODS.map(m => ({ ...m }))),
    setModOwned: mockSetModOwned,
  },
}));

import ModsPage from '../../app/mods/page.jsx';

describe('ModsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SAMPLE_MODS[0].owned = false;
    SAMPLE_MODS[1].owned = true;
    SAMPLE_MODS[2].owned = false;
    SAMPLE_MODS[3].owned = true;
    SAMPLE_MODS[4].owned = false;
    SAMPLE_MODS[5].owned = true;
  });

  it('renders page title', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Mods')).toBeInTheDocument());
  });

  it('renders all mods by default', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => {
      SAMPLE_MODS.forEach(mod => expect(screen.getByText(mod.name)).toBeInTheDocument());
    });
  });

  it('renders the search input', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByPlaceholderText('Search mods by name...')).toBeInTheDocument());
    expect(screen.getByTestId('mod-search-input')).toBeInTheDocument();
  });

  it('filters mods by search text (case-insensitive)', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Abating Link')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mod-search-input'), { target:{ value:'primed' } });
    expect(screen.getByText('Primed Continuity')).toBeInTheDocument();
    expect(screen.queryByText('Abating Link')).not.toBeInTheDocument();
  });

  it('search matches substring in any position', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Abating Link')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mod-search-input'), { target:{ value:'strike' } });
    expect(screen.getByText('Point Strike')).toBeInTheDocument();
    expect(screen.queryByText('Abating Link')).not.toBeInTheDocument();
  });

  it('renders type dropdown with all types option', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByTestId('mod-type-filter')).toBeInTheDocument());
    expect(screen.getByText('All Types')).toBeInTheDocument();
  });

  it('type dropdown contains distinct mod types from data', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByTestId('mod-type-filter')).toBeInTheDocument());
    const options = Array.from(screen.getByTestId('mod-type-filter').options).map(o => o.textContent);
    expect(options).toContain('Warframe Mod');
    expect(options).toContain('Rifle Mod');
  });

  it('filters by selected type', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Primed Continuity')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mod-type-filter'), { target:{ value:'Rifle Mod' } });
    expect(screen.getByText('Point Strike')).toBeInTheDocument();
    expect(screen.getByText('Vital Sense')).toBeInTheDocument();
    expect(screen.queryByText('Primed Continuity')).not.toBeInTheDocument();
  });

  it('renders rarity dropdown with all rarities', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByTestId('mod-rarity-filter')).toBeInTheDocument());
    const options = Array.from(screen.getByTestId('mod-rarity-filter').options).map(o => o.textContent);
    expect(options).toEqual(['All Rarities','Common','Uncommon','Rare','Legendary']);
  });

  it('filters by rarity', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Primed Continuity')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mod-rarity-filter'), { target:{ value:'Legendary' } });
    expect(screen.getByText('Primed Continuity')).toBeInTheDocument();
    expect(screen.queryByText('Point Strike')).not.toBeInTheDocument();
  });

  it('filters by common rarity', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Point Strike')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mod-rarity-filter'), { target:{ value:'Common' } });
    expect(screen.getByText('Point Strike')).toBeInTheDocument();
    expect(screen.queryByText('Primed Continuity')).not.toBeInTheDocument();
  });

  it('renders polarity filter buttons', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByTestId('mod-polarity-filter')).toBeInTheDocument());
  });

  it('filters by polarity (single selection)', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Primed Continuity')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('polarity-btn-naramon'));
    expect(screen.getByText('Primed Continuity')).toBeInTheDocument();
    expect(screen.getByText('Streamline')).toBeInTheDocument();
    expect(screen.queryByText('Point Strike')).not.toBeInTheDocument();
  });

  it('allows multi-select polarity: clicking two shows union', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Primed Continuity')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('polarity-btn-naramon'));
    fireEvent.click(screen.getByTestId('polarity-btn-madurai'));
    expect(screen.getByText('Point Strike')).toBeInTheDocument();
    expect(screen.getByText('Vital Sense')).toBeInTheDocument();
    expect(screen.getByText('Primed Continuity')).toBeInTheDocument();
    expect(screen.getByText('Streamline')).toBeInTheDocument();
    expect(screen.queryByText('Abating Link')).not.toBeInTheDocument();
  });

  it('deselecting a polarity removes it from filter', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Primed Continuity')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('polarity-btn-naramon'));
    expect(screen.queryByText('Point Strike')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('polarity-btn-naramon'));
    expect(screen.getByText('Point Strike')).toBeInTheDocument();
  });

  it('renders show owned only checkbox', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByTestId('mod-owned-filter')).toBeInTheDocument());
    expect(screen.getByText('Show owned only')).toBeInTheDocument();
  });

  it('filters to owned mods when Show owned only is checked', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Point Strike')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mod-owned-filter'));
    expect(screen.getByText('Primed Continuity')).toBeInTheDocument();
    expect(screen.getByText('Point Strike')).toBeInTheDocument();
    expect(screen.getByText('Streamline')).toBeInTheDocument();
    expect(screen.queryByText('Abating Link')).not.toBeInTheDocument();
    expect(screen.queryByText('Vital Sense')).not.toBeInTheDocument();
  });

  it('renders mod name as a link to /mods/{id}', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => {
      const link = screen.getByText('Point Strike').closest('a');
      expect(link).toHaveAttribute('href', '/mods/mod-4');
    });
  });

  it('renders type badge on each card', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByTestId('mod-card-mod-4')).toBeInTheDocument());
    const cards = screen.getAllByTestId(/^mod-card-/);
    expect(cards.filter(c => within(c).queryByText('Rifle Mod')).length).toBe(2);
    expect(cards.filter(c => within(c).queryByText('Warframe Mod')).length).toBe(4);
  });

  it('renders rarity indicator text', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByTestId('mod-card-mod-1')).toBeInTheDocument());
    const cards = screen.getAllByTestId(/^mod-card-/);
    const texts = cards.flatMap(c => Array.from(within(c).queryAllByText(/^(Common|Uncommon|Rare|Legendary)$/)))
      .map(el => el.textContent);
    expect(texts).toContain('Common');
    expect(texts).toContain('Uncommon');
    expect(texts.filter(t => t === 'Rare').length).toBeGreaterThanOrEqual(2);
    expect(texts).toContain('Legendary');
  });

  it('renders polarity indicator', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByTestId('mod-card-mod-1')).toBeInTheDocument());
    const cards = screen.getAllByTestId(/^mod-card-/);
    const texts = cards.flatMap(c => Array.from(within(c).queryAllByText(/^(zenurik|naramon|umbral|madurai)$/)))
      .map(el => el.textContent);
    expect(texts).toContain('zenurik');
    expect(texts).toContain('naramon');
    expect(texts).toContain('umbral');
    expect(texts.filter(t => t === 'madurai').length).toBeGreaterThanOrEqual(1);
  });

  it('renders owned checkbox on each card', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => {
      expect(screen.getAllByTestId(/^mod-owned-checkbox-/).length).toBe(6);
    });
  });

  it('renders rank display for owned mods', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByTestId('mod-card-mod-2')).toBeInTheDocument());
    expect(screen.getByText('R5/10')).toBeInTheDocument();
    expect(screen.getAllByText('R5/5').length).toBe(2);
  });

  it('renders "Not owned" for unowned mods', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => {
      expect(screen.getAllByText('Not owned').length).toBe(3);
    });
  });

  it('clicking owned checkbox calls setModOwned and does not navigate', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Abating Link')).toBeInTheDocument());
    const checkbox = screen.getByTestId('mod-owned-checkbox-mod-1');
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    await waitFor(() => expect(mockSetModOwned).toHaveBeenCalledWith('mod-1', true));
    expect(screen.getByText('Mods')).toBeInTheDocument();
  });

  it('combines search + type filter', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Abating Link')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mod-search-input'), { target:{ value:'primed' } });
    fireEvent.change(screen.getByTestId('mod-type-filter'), { target:{ value:'Warframe Mod' } });
    expect(screen.getByText('Primed Continuity')).toBeInTheDocument();
    expect(screen.queryByText('Abating Link')).not.toBeInTheDocument();
  });

  it('combines search + owned only filter', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Point Strike')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mod-search-input'), { target:{ value:'point' } });
    fireEvent.click(screen.getByTestId('mod-owned-filter'));
    expect(screen.getByText('Point Strike')).toBeInTheDocument();
  });

  it('shows loading skeleton on initial render', () => {
    render(React.createElement(ModsPage));
    expect(screen.getByTestId('mod-loading')).toBeInTheDocument();
  });

  it('shows skeleton cards during loading', () => {
    render(React.createElement(ModsPage));
    expect(screen.getByTestId('mod-loading').querySelectorAll('.skeleton-line').length).toBeGreaterThanOrEqual(4);
  });

  it('shows empty state when no mods match filters', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Point Strike')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('mod-search-input'), { target:{ value:'zzzzzznonexistent' } });
    expect(screen.getByTestId('mod-empty')).toBeInTheDocument();
    expect(screen.getByText(/No mods match/)).toBeInTheDocument();
  });

  it('shows congratulations when all owned and show-owned-only is checked', async () => {
    SAMPLE_MODS.forEach(m => { m.owned = true; });
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByText('Point Strike')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mod-owned-filter'));
    await waitFor(() => {
      expect(screen.getByTestId('mod-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/collected every mod/)).toBeInTheDocument();
  });

  it('has mods-page data-testid', () => {
    render(React.createElement(ModsPage));
    expect(screen.getByTestId('mods-page')).toBeInTheDocument();
  });

  it('has data-testid on each mod card', async () => {
    render(React.createElement(ModsPage));
    await waitFor(() => {
      expect(screen.getByTestId('mod-card-mod-1')).toBeInTheDocument();
      expect(screen.getByTestId('mod-card-mod-2')).toBeInTheDocument();
      expect(screen.getByTestId('mod-card-mod-3')).toBeInTheDocument();
    });
  });

  it('shows error state when mod loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const modStore = await import('../../src/data/mod-store.js');
    const orig = modStore.default.getMods;
    modStore.default.getMods = () => Promise.reject(new Error('Network failure'));
    const { unmount } = render(React.createElement(ModsPage));
    unmount();
    render(React.createElement(ModsPage));
    await waitFor(() => expect(screen.getByRole('heading', { name:/Failed to load mod data/ })).toBeInTheDocument());
    modStore.default.getMods = orig;
  });
});