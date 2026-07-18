// @ts-nocheck
'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * A combobox input that shows a filtered dropdown of predefined options.
 *
 * States:
 * - Default: Input with dropdown arrow, dropdown opens on focus
 * - Filtered: Dropdown shows matching options only
 * - Selection: Picking an option fills name + URL
 * - No matches: Dropdown shows "No matching options" — user can still type free-text
 * - Fallback: If options module fails to load, plain free-text input only
 */
export default function RequirementCombobox({
  options,
  value,
  onChange,
  disabledNames = [],
  slotId,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState(value || '');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const blurTimeoutRef = useRef(null);
  const justSelectedRef = useRef(false);

  // Sync filter text with controlled value
  useEffect(() => {
    setFilterText(value || '');
  }, [value]);

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

  // Clean up blur timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const filteredOptions = (options || []).filter((opt) => {
    if (!filterText) return true;
    return opt.name.toLowerCase().includes(filterText.toLowerCase());
  });

  const handleInputChange = useCallback((e) => {
    const newValue = e.target.value;
    setFilterText(newValue);
    onChange({ name: newValue, wiki_url: '' });
  }, [onChange]);

  const handleSelect = useCallback((opt) => {
    setFilterText(opt.name);
    onChange({ name: opt.name, wiki_url: opt.wiki_url || '' });
    setIsOpen(false);
    justSelectedRef.current = true;
    if (inputRef.current) inputRef.current.focus();
  }, [onChange]);

  const handleFocus = useCallback(() => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return; // Don't re-open dropdown on programmatic focus after selection
    }
    // Only open if we have options
    if (options && options.length > 0) {
      setIsOpen(true);
    }
  }, [options]);

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  const toggleDropdown = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
    } else {
      if (options && options.length > 0) {
        setIsOpen(true);
        if (inputRef.current) inputRef.current.focus();
      }
    }
  }, [isOpen, options]);

  // ── Fallback: no options provided ──
  if (!options) {
    return (
      <input
        data-testid="req-free-text"
        type="text"
        placeholder="Name (required)"
        value={value}
        onChange={(e) => onChange({ name: e.target.value, wiki_url: '' })}
        style={{ minWidth: 160 }}
      />
    );
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          data-testid="req-name-input"
          type="text"
          placeholder="Name (required)"
          value={filterText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{ minWidth: 160 }}
        />
        <button
          type="button"
          aria-label="Toggle options"
          onClick={toggleDropdown}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            background: 'none',
            border: '1px solid #3a3f5c',
            borderLeft: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
            fontSize: 11,
            color: '#9a9eb8',
            lineHeight: 1,
          }}
        >
          ▼
        </button>
      </div>

      {isOpen && (
        <div
          data-testid="req-options-list"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            background: '#1a1d2e',
            border: '1px solid #3a3f5c',
            borderTop: 'none',
            maxHeight: 200,
            overflowY: 'auto',
            minWidth: 200,
          }}
        >
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '8px 10px', color: '#6a6e88', fontSize: 13, fontStyle: 'italic' }}>
              No matching options
            </div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isDisabled = disabledNames.includes(opt.name);
              return (
                <div
                  key={idx}
                  data-disabled={isDisabled ? 'true' : 'false'}
                  onClick={() => {
                    if (!isDisabled) handleSelect(opt);
                  }}
                  onMouseDown={(e) => {
                    // Prevent blur before click registers
                    if (!isDisabled) e.preventDefault();
                  }}
                  style={{
                    padding: '6px 10px',
                    cursor: isDisabled ? 'default' : 'pointer',
                    color: isDisabled ? '#4a4e66' : '#d0d4e8',
                    background: isDisabled ? 'transparent' : 'transparent',
                    fontSize: 13,
                    borderBottom: '1px solid #25283a',
                    opacity: isDisabled ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isDisabled) e.target.style.background = '#25283a';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'transparent';
                  }}
                >
                  {opt.name}
                  {opt.wiki_url && (
                    <span style={{ fontSize: 10, color: '#6a6e88', marginLeft: 6 }}>
                      {opt.wiki_url.replace(/https?:\/\/[^/]+/, '')}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
