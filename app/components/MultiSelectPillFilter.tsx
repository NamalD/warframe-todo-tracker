// @ts-nocheck
'use client';
import React from 'react';

const PILL_STYLE = {
  padding: '4px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  marginRight: 6,
};

const PILL_SELECTED_STYLE = {
  ...PILL_STYLE,
  border: '1px solid #7cc4ff',
  background: '#1a2540',
  color: '#7cc4ff',
};

const PILL_UNSELECTED_STYLE = {
  ...PILL_STYLE,
  border: '1px solid #2a2f3f',
  background: '#181c26',
  color: '#b6bcc7',
};

const UTILITY_BUTTON_STYLE = {
  fontSize: 12,
  color: '#7a8194',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  marginLeft: 4,
  padding: '4px 6px',
};

/**
 * Shared multi-select pill filter component.
 *
 * @param {Object} props
 * @param {string[]} props.items - Values to display as pills
 * @param {string[]} props.selected - Currently selected values
 * @param {(item: string) => void} props.onToggle - Called when a pill is toggled
 * @param {(item: string) => string} [props.getLabel] - Optional label function (default: item itself)
 * @param {boolean} [props.showUtilityButtons=true] - Show Select All / Clear All buttons
 * @param {string} [props.testIdPrefix] - Prefix for data-testid attributes (e.g., "category" → "category-btn-Warframe")
 */
export default function MultiSelectPillFilter({
  items,
  selected,
  onToggle,
  getLabel,
  showUtilityButtons = true,
  testIdPrefix = 'pill',
}) {
  const label = getLabel || ((v) => v);

  return (
    <>
      {items.map((item) => (
        <button
          key={item}
          data-testid={`${testIdPrefix}-btn-${item}`}
          onClick={() => onToggle(item)}
          style={selected.includes(item) ? PILL_SELECTED_STYLE : PILL_UNSELECTED_STYLE}
        >
          {label(item)}
        </button>
      ))}
      {showUtilityButtons && (
        <>
          <button
            data-testid={`${testIdPrefix}-select-all`}
            onClick={() => items.forEach((item) => {
              if (!selected.includes(item)) onToggle(item);
            })}
            style={UTILITY_BUTTON_STYLE}
          >
            All
          </button>
          <button
            data-testid={`${testIdPrefix}-clear-all`}
            onClick={() => selected.forEach((item) => onToggle(item))}
            style={UTILITY_BUTTON_STYLE}
          >
            None
          </button>
        </>
      )}
    </>
  );
}
