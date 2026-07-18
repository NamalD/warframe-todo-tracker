import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

import ToastViewport from '../../app/components/ToastViewport';
import { toast } from '../../src/toast/toast-bus.ts';

describe('ToastViewport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders nothing when there are no toasts', () => {
    const { container } = render(React.createElement(ToastViewport));
    expect(container.querySelector('.toast-viewport')).toBeNull();
  });

  it('shows a toast emitted on the bus', () => {
    render(React.createElement(ToastViewport));
    act(() => { toast.success('Loadout created'); });
    const el = screen.getByTestId('toast');
    expect(el).toHaveTextContent('Loadout created');
    expect(el).toHaveAttribute('data-toast-type', 'success');
  });

  it('auto-dismisses after the duration elapses', () => {
    render(React.createElement(ToastViewport));
    act(() => { toast.info('hi', { duration: 4000 }); });
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('stays visible when duration is 0 (sticky)', () => {
    render(React.createElement(ToastViewport));
    act(() => { toast.error('stuck', { duration: 0 }); });
    act(() => { vi.advanceTimersByTime(60000); });
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });

  it('dismisses when the dismiss button is clicked', () => {
    render(React.createElement(ToastViewport));
    act(() => { toast.error('oops', { duration: 0 }); });
    fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i }));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('coalesces repeated identical messages into one toast', () => {
    render(React.createElement(ToastViewport));
    act(() => {
      toast.error('Could not save', { duration: 4000 });
      toast.error('Could not save', { duration: 4000 });
      toast.error('Could not save', { duration: 4000 });
    });
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
  });

  it('shows distinct toasts for different messages', () => {
    render(React.createElement(ToastViewport));
    act(() => {
      toast.error('A', { duration: 0 });
      toast.success('B', { duration: 0 });
    });
    expect(screen.getAllByTestId('toast')).toHaveLength(2);
  });

  it('exposes a polite live region for screen readers', () => {
    render(React.createElement(ToastViewport));
    act(() => { toast.info('heads up', { duration: 0 }); });
    const region = document.querySelector('.toast-viewport');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-live', 'polite');
  });
});
