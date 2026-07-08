'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import repo from '../../src/data/store.js';

function ItemsList() {
  const [showTrackedOnly, setShowTrackedOnly] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    repo.getAllItems().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

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

  let filtered = showTrackedOnly
    ? items.filter((it) => it.is_user_tracked)
    : items;

  if (searchText.trim()) {
    const query = searchText.toLowerCase();
    filtered = filtered.filter((it) =>
      it.name.toLowerCase().includes(query)
    );
  }

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
      {filtered.length === 0 && (
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
