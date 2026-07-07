'use client';

import { useState } from 'react';
import Link from 'next/link';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/items', label: 'Items' },
  { href: '/sources', label: 'Sources' },
  { href: '/todos', label: 'Todos' },
  { href: '/loadouts', label: 'Loadouts' },
  { href: '/shopping-list', label: 'Shopping List' },
];

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="site-nav">
      <div className="nav-inner">
        <Link href="/" className="brand-link" data-testid="brand-link">
          <strong className="brand">Warframe Tracker</strong>
        </Link>

        {/* Desktop links */}
        <div className="nav-links">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </div>

        {/* Hamburger button — visible on mobile */}
        <button
          className="hamburger"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
        </button>
      </div>

      {/* Mobile slide-down menu */}
      <div className={`mobile-menu${open ? ' open' : ''}`}>
        <div className="mobile-menu-inner">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
