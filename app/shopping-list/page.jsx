'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import repo from '../../src/data/store.js';

function ShoppingList() {
  const [materials, setMaterials] = useState([]);
  const [owned, setOwned] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    const items = repo.getAllItems();
    const trackedItems = items.filter((it) => it.is_user_tracked);
    const inv = repo.getMaterialInventory();
    setOwned(inv);

    // Aggregate materials across tracked items
    const materialsMap = {};
    for (const item of trackedItems) {
      const itemMaterials = repo.getMaterialsForItem(item.id);
      for (const m of itemMaterials) {
        const key = m.material_name;
        if (!materialsMap[key]) {
          materialsMap[key] = {
            name: m.material_name,
            needed: 0,
            wiki_url: m.wiki_url,
            items: [],
            itemIds: new Set()
          };
        }
        materialsMap[key].needed += m.quantity_required;
        if (!materialsMap[key].itemIds.has(item.id)) {
          materialsMap[key].itemIds.add(item.id);
          materialsMap[key].items.push({ id: item.id, name: item.name });
        }
      }
    }

    // Convert to array and compute deficit
    const materialsList = Object.values(materialsMap).map((m) => {
      const ownedQty = inv[m.name] ?? 0;
      const deficit = Math.max(0, m.needed - ownedQty);
      return {
        ...m,
        owned: ownedQty,
        deficit,
        done: deficit <= 0,
        pct: Math.min(100, Math.round((ownedQty / m.needed) * 100))
      };
    });

    // Sort: most deficit first, then alphabetically
    materialsList.sort((a, b) => {
      if (b.deficit !== a.deficit) return b.deficit - a.deficit;
      return a.name.localeCompare(b.name);
    });

    setMaterials(materialsList);
    setLoading(false);
  }, []);

  const handleOwnedChange = useCallback((materialName, value) => {
    const newQty = repo.setOwnedQuantity(materialName, value);
    setOwned((prev) => ({ ...prev, [materialName]: newQty }));

    // Recompute this material's row
    setMaterials((prev) =>
      prev.map((m) => {
        if (m.name !== materialName) return m;
        const deficit = Math.max(0, m.needed - newQty);
        return {
          ...m,
          owned: newQty,
          deficit,
          done: deficit <= 0,
          pct: Math.min(100, Math.round((newQty / m.needed) * 100))
        };
      }).sort((a, b) => {
        if (b.deficit !== a.deficit) return b.deficit - a.deficit;
        return a.name.localeCompare(b.name);
      })
    );
  }, []);

  const completedCount = materials.filter((m) => m.done).length;
  const totalCount = materials.length;
  const totalNeeded = materials.reduce((sum, m) => sum + m.needed, 0);
  const totalOwned = materials.reduce((sum, m) => sum + m.owned, 0);
  const totalDeficit = materials.reduce((sum, m) => sum + m.deficit, 0);

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ height: 28, width: 260, margin: '0 0 14px' }} />
        <div className="card">
          <div className="skeleton" style={{ height: 16, width: 180, margin: '0 0 10px' }} />
          <div className="skeleton" style={{ height: 16, width: 240 }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, color: '#ffcf6a' }}>
            Shopping List
          </h1>
          <span className="muted">
            Aggregated materials needed across all tracked items
          </span>
        </div>
      </div>

      {/* Summary cards */}
      {totalCount > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 14,
            marginBottom: 28
          }}
        >
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted">Total Materials</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#7cc4ff', margin: '4px 0' }}>
              {totalCount}
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted">Total Needed</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#f2c94c', margin: '4px 0' }}>
              {totalNeeded.toLocaleString()}
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted">Total Owned</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#6fcf97', margin: '4px 0' }}>
              {totalOwned.toLocaleString()}
            </div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="muted">Still Needed</div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: totalDeficit > 0 ? '#eb5757' : '#6fcf97',
                margin: '4px 0'
              }}
            >
              {totalDeficit.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Progress summary */}
      {totalCount > 0 && (
        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Overall Progress</h2>
            <span className="muted">
              {completedCount} / {totalCount} complete
            </span>
          </div>
          <div className="progress-bar" style={{ height: 10, marginBottom: 6 }}>
            <div
              className={`progress-fill${completedCount === totalCount ? ' done' : ''}`}
              style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">
              {Math.round((completedCount / totalCount) * 100)}% materials gathered
            </span>
          </div>
        </div>
      )}

      {/* Materials table */}
      {totalCount > 0 ? (
        <div className="card">
          <h2>Materials ({totalCount})</h2>
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Needed</th>
                <th>Owned</th>
                <th>Deficit</th>
                <th>Progress</th>
                <th>Used In</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr
                  key={m.name}
                  style={m.done ? { opacity: 0.65 } : undefined}
                >
                  <td>
                    <a
                      href={m.wiki_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 600, color: m.done ? '#6fcf97' : '#e7e9ee' }}
                    >
                      {m.name}
                    </a>
                    {m.done && (
                      <span
                        className="badge"
                        style={{
                          marginLeft: 6,
                          background: '#1a2e1a',
                          color: '#6fcf97',
                          borderColor: '#2a4a2a'
                        }}
                      >
                        ✓ done
                      </span>
                    )}
                  </td>
                  <td style={{ color: '#f2c94c', fontWeight: 600 }}>
                    {m.needed.toLocaleString()}
                  </td>
                  <td>
                    <input
                      className="owned-input"
                      type="number"
                      min="0"
                      value={m.owned}
                      onChange={(e) => handleOwnedChange(m.name, e.target.value)}
                      aria-label={`Owned quantity for ${m.name}`}
                      style={{
                        color: m.done ? '#6fcf97' : '#e7e9ee',
                        borderColor: m.done ? '#2a4a2a' : undefined
                      }}
                    />
                  </td>
                  <td
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: m.done ? '#6fcf97' : '#eb5757'
                    }}
                  >
                    {m.done ? '—' : m.deficit.toLocaleString()}
                  </td>
                  <td>
                    <div className="progress-cell">
                      <div className="progress-bar">
                        <div
                          className={`progress-fill${m.done ? ' done' : ''}`}
                          style={{ width: `${m.pct}%` }}
                        />
                      </div>
                      <span className={`progress-label${m.done ? ' done' : ''}`}>
                        {m.owned.toLocaleString()} / {m.needed.toLocaleString()}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {m.items.map((item) => (
                        <Link
                          key={item.id}
                          href={`/items/${item.id}`}
                          className="badge"
                          style={{
                            textDecoration: 'none',
                            fontSize: 11
                          }}
                        >
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <p className="muted">
            No tracked items yet. Track items to see your material shopping list.
          </p>
          <p style={{ marginTop: 10 }}>
            <Link href="/items" className="btn primary">
              Browse Items &rarr;
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

export default ShoppingList;
