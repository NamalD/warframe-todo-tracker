import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import RequirementCombobox from '../../app/loadouts/[id]/requirement-combobox.jsx';

const MOCK_OPTIONS = [
  { name: 'Orokin Reactor', wiki_url: 'https://wiki.example.com/reactor' },
  { name: 'Forma', wiki_url: 'https://wiki.example.com/forma' },
  { name: 'Exilus Adapter', wiki_url: 'https://wiki.example.com/exilus' },
  { name: 'Aura Forma', wiki_url: '' },
];

describe('RequirementCombobox', () => {
  const defaultProps = {
    options: MOCK_OPTIONS,
    value: '',
    onChange: vi.fn(),
    disabledNames: [],
    slotId: 'slot-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Default state ──

  it('renders an input with data-testid="req-name-input"', () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    const input = screen.getByTestId('req-name-input');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('shows placeholder text', () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    expect(screen.getByPlaceholderText('Name (required)')).toBeInTheDocument();
  });

  it('reflects the value prop in the input', () => {
    render(React.createElement(RequirementCombobox, {
      ...defaultProps,
      value: 'Forma',
    }));
    expect(screen.getByTestId('req-name-input').value).toBe('Forma');
  });

  // ── Dropdown open/close ──

  it('shows dropdown on input focus', async () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    const input = screen.getByTestId('req-name-input');
    fireEvent.focus(input);
    await waitFor(() => {
      const list = screen.getByTestId('req-options-list');
      expect(list).toBeInTheDocument();
    });
  });

  it('hides dropdown on blur with delay', async () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    const input = screen.getByTestId('req-name-input');
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getByTestId('req-options-list')).toBeInTheDocument();
    });
    fireEvent.blur(input);
    // Dropdown should hide after a short delay
    await waitFor(() => {
      expect(screen.queryByTestId('req-options-list')).not.toBeInTheDocument();
    });
  });

  // ── Filtering ──

  it('shows all options when input is empty and focused', async () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    const input = screen.getByTestId('req-name-input');
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getByText('Orokin Reactor')).toBeInTheDocument();
      expect(screen.getByText('Forma')).toBeInTheDocument();
      expect(screen.getByText('Exilus Adapter')).toBeInTheDocument();
      expect(screen.getByText('Aura Forma')).toBeInTheDocument();
    });
  });

  it('filters options as user types (case-insensitive)', async () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    const input = screen.getByTestId('req-name-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'forma' } });
    await waitFor(() => {
      expect(screen.getByText('Forma')).toBeInTheDocument();
      expect(screen.getByText('Aura Forma')).toBeInTheDocument();
      expect(screen.queryByText('Orokin Reactor')).not.toBeInTheDocument();
      expect(screen.queryByText('Exilus Adapter')).not.toBeInTheDocument();
    });
  });

  it('shows "No matching options" when filter matches nothing', async () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    const input = screen.getByTestId('req-name-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzzznotfound' } });
    await waitFor(() => {
      expect(screen.getByText('No matching options')).toBeInTheDocument();
    });
  });

  // ── Selection ──

  it('calls onChange with name and wiki_url when option is clicked', async () => {
    const onChange = vi.fn();
    render(React.createElement(RequirementCombobox, {
      ...defaultProps,
      onChange,
    }));
    const input = screen.getByTestId('req-name-input');
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getByText('Orokin Reactor')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Orokin Reactor'));
    expect(onChange).toHaveBeenCalledWith({
      name: 'Orokin Reactor',
      wiki_url: 'https://wiki.example.com/reactor',
    });
  });

  it('closes dropdown after selection', async () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    const input = screen.getByTestId('req-name-input');
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getByText('Forma')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Forma'));
    await waitFor(() => {
      expect(screen.queryByTestId('req-options-list')).not.toBeInTheDocument();
    });
  });

  // ── Already-added options ──

  it('dims already-added options in the dropdown', async () => {
    render(React.createElement(RequirementCombobox, {
      ...defaultProps,
      disabledNames: ['Forma', 'Exilus Adapter'],
    }));
    const input = screen.getByTestId('req-name-input');
    fireEvent.focus(input);
    await waitFor(() => {
      const formaItem = screen.getByText('Forma');
      expect(formaItem).toBeInTheDocument();
      const parent = formaItem.closest('[data-disabled]');
      expect(parent).toBeTruthy();
      expect(parent.getAttribute('data-disabled')).toBe('true');
    });
  });

  // ── Free-text support ──

  it('calls onChange with free-text input when typing non-matching text', async () => {
    const onChange = vi.fn();
    render(React.createElement(RequirementCombobox, {
      ...defaultProps,
      onChange,
    }));
    const input = screen.getByTestId('req-name-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Custom Mod' } });
    // onChange should be called with just the name for free-text
    expect(onChange).toHaveBeenCalledWith({
      name: 'Custom Mod',
      wiki_url: '',
    });
  });

  // ── Fallback state ──

  it('renders fallback free-text input when options is null/undefined', () => {
    const onChange = vi.fn();
    render(React.createElement(RequirementCombobox, {
      ...defaultProps,
      options: null,
      onChange,
    }));
    const fallback = screen.getByTestId('req-free-text');
    expect(fallback).toBeInTheDocument();
    expect(fallback.tagName).toBe('INPUT');
  });

  it('fallback input calls onChange on typing', () => {
    const onChange = vi.fn();
    render(React.createElement(RequirementCombobox, {
      ...defaultProps,
      options: null,
      onChange,
    }));
    const fallback = screen.getByTestId('req-free-text');
    fireEvent.change(fallback, { target: { value: 'Something' } });
    expect(onChange).toHaveBeenCalledWith({ name: 'Something', wiki_url: '' });
  });

  // ── Dropdown arrow ──

  it('shows a dropdown arrow button', () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    const arrow = screen.getByLabelText('Toggle options');
    expect(arrow).toBeInTheDocument();
  });

  it('clicking arrow opens dropdown', async () => {
    render(React.createElement(RequirementCombobox, { ...defaultProps }));
    const arrow = screen.getByLabelText('Toggle options');
    fireEvent.click(arrow);
    await waitFor(() => {
      expect(screen.getByTestId('req-options-list')).toBeInTheDocument();
    });
  });
});
