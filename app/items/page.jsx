'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import repo from '../../src/data/store.ts';
import MultiSelectPillFilter from '../components/MultiSelectPillFilter.jsx';
import { CATEGORY_LABELS } from '../../src/data/categories.mjs';

function ItemsList() {
  const [showTrackedOnly, setShowTrackedOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    repo.getAllItems().then((data) => {
      setItems(data);
      // Only auto-enable tracked-only view if the user actually has
      // tracked items — avoids showing "0 of N items" on first visit.
      const hasTracked = data.some((it) => it.is_user_tracked);
      setShowTrackedOnly(hasTracked);
      setInitialized(true);
      setLoading(false);
    });
  }, []);

  const distinctCategories = useMemo(
    () => [...new Set(items.map((it) => it.item_type))].sort(),
    [items]
  );

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat)
        ? prev.filter((c) => c !== cat)
        : [...prev, cat]
    );
  };

  const searchActive = searchText.trim().length > 0;

  let filtered = showTrackedOnly && !searchActive
    ? items.filter((it) => it.is_user_tracked)
    : items;

  if (searchText.trim()) {
    const query = searchText.toLowerCase();
    filtered = filtered.filter((it) =>
      it.name.toLowerCase().includes(query)
    );
  }

  if (selectedCategories.length > 0) {
    filtered = filtered.filter((it) =>
      selectedCategories.includes(it.item_type)
    );
  }

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ height: 28, width: 320, margin: '0 0 14px' }} />
        <div className="card">
          <div className="skeleton" style={{ height: 16, width: 180, margin: '0 0 10px' }} />
          <div className="skeleton" style={{ height: 16, width: 240 }} />
        </div>
      </div>
    );
  }

  // Don't render main content until after the initial tracked-check runs,
  // to avoid flashing all items then switching to tracked-only.
  if (!initialized) return null;

  return (
    <div>
      <div className="filters">
        <input
          type="text"
          placeholder="Search items by name..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="search-input"
        />
      </div>
      <div className="filters">
        <div data-testid="category-filter">
          <MultiSelectPillFilter
            items={distinctCategories}
            selected={selectedCategories}
            onToggle={toggleCategory}
            getLabel={(cat) => CATEGORY_LABELS[cat] || cat}
            testIdPrefix="category"
          />
        </div>
      </div>
      <div className="filters">
        <label>
          <input
            type="checkbox"
            checked={showTrackedOnly}
            onChange={(e) => setShowTrackedOnly(e.target.checked)}
            disabled={searchActive}
          />
          &nbsp;Show tracked items only
        </label>
      </div>
      {filtered.length === 0 && showTrackedOnly && !searchText.trim() && selectedCategories.length === 0 && (
        <p className="muted">
          No tracked items yet — you have no tracked items right now. Uncheck "Show tracked items only" to browse everything, or try searching.
        </p>
      )}
      {filtered.length === 0 && (!showTrackedOnly || selectedCategories.length > 0 || searchText.trim()) && (
        <p className="muted">No items match this filter or search.</p>
      )}
      <div className="list">
        {filtered.map((it) => (
          <div className="card" key={it.id}>
            <div className="list-header">
              <div>
                <Link href={`/items/${it.id}`} className="link-title">
                  {it.name}
                </Link>
                <span className={`badge ${it.item_type}`}>{it.item_type}</span>
                {it.is_user_tracked && (
                  <span className="badge">tracked</span>
                )}
                {it.track_incarnon_install && (
                  <span className="badge">Incarnon tracked</span>
                )}
              </div>
              <div className="muted">MR {it.mastery_rank_required}</div>
            </div>
            <div className="muted">Blueprint: {it.blueprint_source}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ItemsList;
