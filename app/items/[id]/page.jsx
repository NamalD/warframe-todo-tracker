'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import repo from '../../../src/data/store.js';

function ItemDetail({ params }) {
  const routeParams = useParams();
  const id = params?.id || routeParams?.id;
  const [item, setItem] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [tree, setTree] = useState({ children: [], parents: [] });
  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState({});

  useEffect(() => {
    setLoading(true);
    async function load() {
      const data = await repo.getItemById(id);
      setItem(data);
      const mats = await repo.getMaterialsForItem(id);
      setMaterials(mats);
      const treeData = await repo.getTreeForItem(id);
      setTree(treeData);

      // Load owned quantities for all materials of this item
      const inv = repo.getMaterialInventory();
      setOwned(inv);
      setLoading(false);
    }
    load();
  }, [id]);

  const handleOwnedChange = useCallback((materialName, value) => {
    const newQty = repo.setOwnedQuantity(materialName, value);
    setOwned((prev) => ({ ...prev, [materialName]: newQty }));
  }, []);

  if (loading || !id) {
    return (
      <div className="detail">
        <div className="skeleton" style={{ height: 28, width: 320, margin: '0 0 14px' }} />
        <div className="skeleton" style={{ height: 18, width: 180, margin: '0 0 14px' }} />
        <div className="card">
          <div className="skeleton" style={{ height: 16, width: 160, margin: '0 0 10px' }} />
          <div className="skeleton" style={{ height: 16, width: 240 }} />
        </div>
      </div>
    );
  }

  if (!item) {
    return <p className="muted">Item not found.</p>;
  }

  const trackToggle = async () => {
    await repo.updateItem(id, { is_user_tracked: !item.is_user_tracked });
    const updated = await repo.getItemById(id);
    setItem(updated);
  };

  return (
    <div className="detail">
      <div className="detail-header">
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, color: '#ffcf6a' }}>{item.name}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`badge ${item.item_type}`}>{item.item_type}</span>
            {item.is_user_tracked && <span className="badge">tracked</span>}
            {item.blueprint_source && <span className="badge">Blueprint: {item.blueprint_source}</span>}
          </div>
        </div>
        <div>
          <button className="btn primary" onClick={trackToggle}>
            {item.is_user_tracked ? 'Untrack' : 'Track'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Details</h2>
        <p>Mastery Rank: {item.mastery_rank_required}</p>
        <p>
          Wiki:{' '}
          <a href={item.wiki_url} target="_blank" rel="noreferrer">
            {item.wiki_url}
          </a>
        </p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Required Materials</h2>
        {materials.length === 0 && <p className="muted">No materials on record.</p>}
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Needed</th>
              <th>Owned</th>
              <th>Progress</th>
              <th>Sources</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const ownedQty = owned[m.material_name] ?? 0;
              const needed = m.quantity_required;
              const pct = Math.min(100, Math.round((ownedQty / needed) * 100));
              const done = ownedQty >= needed;
              return (
                <tr key={m.id}>
                  <td>
                    <a href={m.wiki_url} target="_blank" rel="noreferrer">
                      {m.material_name}
                    </a>
                  </td>
                  <td>{needed}</td>
                  <td>
                    <input
                      className="owned-input"
                      type="number"
                      min="0"
                      value={ownedQty}
                      onChange={(e) => handleOwnedChange(m.material_name, e.target.value)}
                      aria-label={`Owned quantity for ${m.material_name}`}
                    />
                  </td>
                  <td>
                    <div className="progress-cell">
                      <div className="progress-bar">
                        <div
                          className={`progress-fill${done ? ' done' : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`progress-label${done ? ' done' : ''}`}>
                        {ownedQty}/{needed}
                        {done && ' ✓'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <Link href={`/sources?material=${encodeURIComponent(m.material_name)}`}>
                      View sources
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Crafting Tree</h2>
        {tree.children.length === 0 && tree.parents.length === 0 && (
          <p className="muted">No tree relationships.</p>
        )}
        {tree.parents.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Requires:</div>
            {tree.parents.map((rel) => (
              <div key={rel.id} className="tree-row">
                <Link href={`/items/${rel.parent?.id}`}>{rel.parent?.name || 'Unknown'}</Link>{' '}
                <span className="muted">x{rel.quantity_required}</span>
              </div>
            ))}
          </div>
        )}
        {tree.children.length > 0 && (
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Used in:</div>
            {tree.children.map((rel) => (
              <div key={rel.id} className="tree-row">
                <Link href={`/items/${rel.child?.id}`}>{rel.child?.name || 'Unknown'}</Link>{' '}
                <span className="muted">x{rel.quantity_required}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ItemDetail;
