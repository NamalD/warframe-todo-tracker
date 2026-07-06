import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
}));

import NotFound from '../../app/not-found.jsx';

describe('NotFound', () => {
  it('renders the not found heading', () => {
    render(React.createElement(NotFound));
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('renders the not found description', () => {
    render(React.createElement(NotFound));
    expect(screen.getByText('The page you are looking for does not exist.')).toBeInTheDocument();
  });

  it('renders the empty icon', () => {
    render(React.createElement(NotFound));
    expect(screen.getByText('🔍')).toBeInTheDocument();
  });

  it('renders a link to go home', () => {
    render(React.createElement(NotFound));
    const link = screen.getByText('Go Home');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/');
  });

  it('has the empty-state class', () => {
    const { container } = render(React.createElement(NotFound));
    expect(container.querySelector('.empty-state')).toBeInTheDocument();
  });
});
