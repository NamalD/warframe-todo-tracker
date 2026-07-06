'use client';
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'next/navigation';
import repo from '../../../src/data/store.js';

function ItemDetail() {
  const params = useParams();
  const id = params.id;
  const [item, setItem] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [tree, setTree] = useState({ children: [], parents: [] });

  useEffect(() => {
    const data = repo.getItemById(id);
    setItem(data);
    setMaterials(repo.getMaterialsForItem(id));
    setTree(repo.getTreeForItem(id));
  }, [id]);

  if (!item) {
    return <p className="muted">Item not found.</p>;
  }

  const trackToggle = () => {
    const all = repo.getAllItems();
    const target = all.find((i) => i.id === id);
    if (!target) return;
    target.is_user_tracked = !target.is_user_tracked;
    setItem({ ...target });
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
              <th>Qty</th>
              <th>Sources</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id}>
                <td>
                  <a href={m.wiki_url} target="_blank" rel="noreferrer">
                    {m.material_name}
                  </a>
                </td>
                <td>{m.quantity_required}</td>
                <td>
                  <Link href={`/sources?material=${encodeURIComponent(m.material_name)}`}>
                    View sources
                  </Link>
                </td>
              </tr>
            ))}
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
