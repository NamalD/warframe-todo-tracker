import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
}));

import NavBar from '../../app/components/NavBar.jsx';

describe('NavBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the brand name', () => {
    render(React.createElement(NavBar));
    expect(screen.getByText('Warframe Tracker')).toBeInTheDocument();
  });

  it('renders all navigation links (desktop)', () => {
    render(React.createElement(NavBar));
    const links = ['Home', 'Items', 'Sources', 'Todos', 'Loadouts', 'Mods', 'Shopping List'];
    links.forEach((label) => {
      const matches = screen.getAllByText(label);
      // At least one occurrence (desktop links)
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('desktop links have correct hrefs', () => {
    render(React.createElement(NavBar));
    const homeLink = screen.getAllByText('Home')[0];
    expect(homeLink.closest('a')).toHaveAttribute('href', '/');

    const itemsLink = screen.getAllByText('Items')[0];
    expect(itemsLink.closest('a')).toHaveAttribute('href', '/items');
  });

  it('renders hamburger button', () => {
    render(React.createElement(NavBar));
    const hamburger = screen.getByRole('button', { name: /open menu/i });
    expect(hamburger).toBeInTheDocument();
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles hamburger menu on click', () => {
    render(React.createElement(NavBar));
    const hamburger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');
    expect(hamburger).toHaveAttribute('aria-label', 'Close menu');
  });

  it('shows mobile menu when open', () => {
    render(React.createElement(NavBar));
    const hamburger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(hamburger);

    const mobileMenu = document.querySelector('.mobile-menu');
    expect(mobileMenu).toBeInTheDocument();
    expect(mobileMenu.className).toContain('open');
  });

  it('closes hamburger menu on second click', () => {
    render(React.createElement(NavBar));
    const hamburger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(hamburger);
    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  it('brand link wraps the Warframe Tracker text', () => {
    render(React.createElement(NavBar));
    const brandLink = screen.getByTestId('brand-link');
    expect(brandLink).toHaveTextContent('Warframe Tracker');
  });

  it('brand link has brand-link className to remove default underline', () => {
    render(React.createElement(NavBar));
    const brandLink = screen.getByTestId('brand-link');
    expect(brandLink).toHaveClass('brand-link');
  });

  it('brand link preserves the brand styling', () => {
    render(React.createElement(NavBar));
    const brandLink = screen.getByTestId('brand-link');
    const strong = brandLink.querySelector('strong.brand');
    expect(strong).toBeTruthy();
  });

  it('mobile menu contains all navigation links', () => {
    render(React.createElement(NavBar));
    const hamburger = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(hamburger);

    // Links appear twice (desktop + mobile) when menu is open
    expect(screen.getAllByText('Home').length).toBe(2);
    expect(screen.getAllByText('Todos').length).toBe(2);
  });
});
