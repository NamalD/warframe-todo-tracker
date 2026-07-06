import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import repo from '../data/store.js';

function ItemsList() {
  const [showTrackedOnly, setShowTrackedOnly] = useState(false);
  const items = repo.getAllItems();
  const filtered = showTrackedOnly
    ? items.filter((it) => it.is_user_tracked)
    : items;

  return (
    <div>
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
                <Link to={`/items/${it.id}`} className="link-title">
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
