'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import repo from '../../src/data/store.js';

function ItemsList() {
  const [showTrackedOnly, setShowTrackedOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
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

  let filtered = showTrackedOnly
    ? items.filter((it) => it.is_user_tracked)
    : items;

  if (searchText.trim()) {
    const query = searchText.toLowerCase();
    filtered = filtered.filter((it) =>
      it.name.toLowerCase().includes(query)
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
        <label>
          <input
            type="checkbox"
            checked={showTrackedOnly}
            onChange={(e) => setShowTrackedOnly(e.target.checked)}
          />
          &nbsp;Show tracked items only
        </label>
      </div>
      {filtered.length === 0 && showTrackedOnly && !searchText.trim() && (
        <p className="muted">
          No tracked items yet — showing 0 of {items.length} items. Uncheck &quot;Show tracked items only&quot; to browse everything.
        </p>
      )}
      {filtered.length === 0 && (!showTrackedOnly || searchText.trim()) && (
        <p className="muted">No items match this filter.</p>
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
