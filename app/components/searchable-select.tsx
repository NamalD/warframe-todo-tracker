// @ts-nocheck
'use client';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

/**
 * A searchable autocomplete select component.
 *
 * States:
 * - Default: Input with dropdown arrow, dropdown opens on focus/click
 * - Filtered: Dropdown shows matching options only
 * - Selection: Picking an option sets the value
 * - No matches: Dropdown shows "No matching options"
 * - Empty options: If options array is empty, shows a disabled input
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  emptyLabel = 'No matching options',
  disabled = false,
  style,
  'data-testid': dataTestId,
  /** If true, the user can type free text not in the options list */
  allowCustom = false,
  onCustomChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const blurTimeoutRef = useRef(null);
  const justSelectedRef = useRef(false);

  // Resolve display label from current value
  const selectedOption = useMemo(
    () => options.find((opt) => (opt.value ?? opt.id) === value),
    [options, value]
  );

  // Sync filter text with value label when value changes externally
  useEffect(() => {
    if (!isOpen && selectedOption) {
      setFilterText(selectedOption.label ?? selectedOption.name ?? '');
    }
  }, [value, selectedOption, isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clean up blur timeout
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    if (!filterText) return options;
    const lower = filterText.toLowerCase();
    return options.filter((opt) => {
      const label = (opt.label ?? opt.name ?? '').toLowerCase();
      return label.includes(lower);
    });
  }, [options, filterText]);

  const getOptionLabel = (opt) => opt.label ?? opt.name ?? '';
  const getOptionValue = (opt) => opt.value ?? opt.id ?? '';

  const handleInputChange = useCallback((e) => {
    const text = e.target.value;
    setFilterText(text);
    if (allowCustom) {
      onCustomChange?.(text);
      onChange?.('');
    }
    if (!isOpen && options.length > 0) {
      setIsOpen(true);
    }
  }, [allowCustom, onChange, onCustomChange, options.length, isOpen]);

  const handleSelect = useCallback((opt) => {
    const optValue = getOptionValue(opt);
    const optLabel = getOptionLabel(opt);
    setFilterText(optLabel);
    onChange?.(optValue);
    setIsOpen(false);
    justSelectedRef.current = true;
    inputRef.current?.focus();
  }, [onChange]);

  const handleFocus = useCallback(() => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (options.length > 0) {
      setIsOpen(true);
    }
  }, [options.length]);

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      // Snap filter text back to selected value label on blur
      if (selectedOption) {
        setFilterText(getOptionLabel(selectedOption));
      } else if (!allowCustom) {
        setFilterText('');
      }
    }, 150);
  }, [selectedOption, allowCustom]);

  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    if (isOpen) {
      setIsOpen(false);
    } else {
      setIsOpen(true);
      inputRef.current?.focus();
    }
  }, [isOpen, disabled]);

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', display: 'inline-block', ...style }}
      data-testid={dataTestId}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={filterText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          style={{
            minWidth: 160,
            padding: '6px 10px',
            border: '1px solid #3a3f5c',
            borderRadius: '4px 0 0 4px',
            background: disabled ? '#111' : '#0d0f17',
            color: '#d0d4e8',
            fontSize: 14,
            outline: 'none',
            flex: 1,
          }}
        />
        <button
          type="button"
          aria-label="Toggle options"
          onClick={toggleDropdown}
          onMouseDown={(e) => e.preventDefault()}
          disabled={disabled}
          style={{
            background: 'none',
            border: '1px solid #3a3f5c',
            borderLeft: 'none',
            borderRadius: '0 4px 4px 0',
            cursor: disabled ? 'default' : 'pointer',
            padding: '6px 8px',
            fontSize: 11,
            color: disabled ? '#4a4e66' : '#9a9eb8',
            lineHeight: 1,
          }}
        >
          ▼
        </button>
      </div>

      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            background: '#1a1d2e',
            border: '1px solid #3a3f5c',
            borderTop: 'none',
            maxHeight: 220,
            overflowY: 'auto',
            minWidth: 200,
          }}
        >
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '8px 10px', color: '#6a6e88', fontSize: 13, fontStyle: 'italic' }}>
              {emptyLabel}
            </div>
          ) : (
            filteredOptions.map((opt, idx) => (
              <div
                key={getOptionValue(opt) || idx}
                onClick={() => handleSelect(opt)}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  color: '#d0d4e8',
                  fontSize: 13,
                  borderBottom: '1px solid #25283a',
                }}
                onMouseEnter={(e) => { e.target.style.background = '#25283a'; }}
                onMouseLeave={(e) => { e.target.style.background = 'transparent'; }}
              >
                {getOptionLabel(opt)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
