'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import repo from '../../../src/data/store.ts';

function MaterialsTable({ materials, owned, onOwnedChange }) {
  return (
    <div className="table-scroll">
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
                {needed === 1 ? (
                  <input
                    type="checkbox"
                    checked={ownedQty >= 1}
                    onChange={(e) => onOwnedChange(m.material_name, e.target.checked ? 1 : 0)}
                    aria-label={`Owned quantity for ${m.material_name}`}
                  />
                ) : (
                  <input
                    className="owned-input"
                    type="number"
                    min="0"
                    value={ownedQty}
                    onChange={(e) => onOwnedChange(m.material_name, e.target.value)}
                    aria-label={`Owned quantity for ${m.material_name}`}
                  />
                )}
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
  );
}

function CraftingTreeNode({ node, owned, depth = 0, onOwnedChange }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  // Determine overall status for this node
  const isWarframeComponent = node.item.item_type === 'warframe_component';
  const isLeaf = !hasChildren;

  // Compute aggregated progress for intermediate nodes
  const aggregated = hasChildren ? repo.constructor.aggregateNodeMaterials(node) : null;
  let aggregatedPct = 0;
  let aggregatedOwned = 0;
  let aggregatedTotal = 0;
  if (aggregated) {
    for (const [matName, totalNeeded] of aggregated) {
      aggregatedTotal += totalNeeded;
      aggregatedOwned += Math.min(owned[matName] || 0, totalNeeded);
    }
    aggregatedPct = aggregatedTotal > 0 ? Math.round((aggregatedOwned / aggregatedTotal) * 100) : 0;
  }

  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0, marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: depth === 0 ? '#1a1a2e' : '#16213e',
          borderRadius: 6,
          cursor: hasChildren ? 'pointer' : 'default',
          flexWrap: 'wrap',
        }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          <span style={{ fontSize: 12, color: '#888' }}>{expanded ? '▼' : '▶'}</span>
        )}
        <span style={{ fontWeight: depth === 0 ? 'bold' : 'normal', color: '#ffcf6a' }}>
          {node.item.name}
        </span>
        {node.quantityForParent > 1 && (
          <span className="muted" style={{ fontSize: 13 }}>x{node.quantityForParent}</span>
        )}
        {isWarframeComponent && <span className="badge" style={{ fontSize: 11 }}>component</span>}
        {hasChildren && aggregated && (
          <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
            {aggregatedOwned}/{aggregatedTotal}
          </span>
        )}
      </div>

      {hasChildren && aggregated && (
        <div style={{ marginTop: 4, marginBottom: 6, paddingLeft: 28 }}>
          <div className="progress-bar" style={{ height: 6, background: '#0f3460', borderRadius: 3, overflow: 'hidden' }}>
            <div
              className="progress-fill"
              style={{
                width: `${aggregatedPct}%`,
                background: aggregatedPct >= 100 ? '#6fcf97' : aggregatedPct > 0 ? '#f4c430' : '#e74c3c',
                height: '100%',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 6, paddingLeft: depth === 0 ? 0 : 10 }}>
          {hasChildren ? (
            <div>
              {node.children.map((child, idx) => (
                <CraftingTreeNode
                  key={child.item.id + '-' + idx}
                  node={child}
                  owned={owned}
                  depth={depth + 1}
                  onOwnedChange={onOwnedChange}
                />
              ))}
              {/* Also show raw materials for this node that aren't in children */}
              {node.materials && node.materials.filter(m => !m.is_intermediate).length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div className="muted" style={{ marginBottom: 4, fontSize: 12 }}>Raw materials:</div>
                  <MaterialsTable
                    materials={node.materials.filter(m => !m.is_intermediate)}
                    owned={owned}
                    onOwnedChange={onOwnedChange}
                  />
                </div>
              )}
            </div>
          ) : (
            <MaterialsTable materials={node.materials} owned={owned} onOwnedChange={onOwnedChange} />
          )}
        </div>
      )}
    </div>
  );
}

function ItemDetail({ params }) {
  const routeParams = useParams();
  const id = params?.id || routeParams?.id;
  const [item, setItem] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [craftingTree, setCraftingTree] = useState(null);
  const [relics, setRelics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState({});

  useEffect(() => {
    setLoading(true);
    async function load() {
      await repo.initMaterials();
      const data = await repo.getItemById(id);
      setItem(data);
      const mats = await repo.getMaterialsForItem(id);
      setMaterials(mats);
      const treeData = await repo.getCraftingTreeForItem(id);
      setCraftingTree(treeData);

      // Load relics for prime items
      if (data && data.name.includes(' Prime ')) {
        const relicData = await repo.getRelicsForItem(id);
        setRelics(relicData);
      }

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

  const incarnonTrackToggle = async () => {
    await repo.updateItem(id, { track_incarnon_install: !item.track_incarnon_install });
    const updated = await repo.getItemById(id);
    setItem(updated);
  };

  const incarnonInstalledToggle = async () => {
    await repo.updateItem(id, { incarnon_installed: !item.incarnon_installed });
    const updated = await repo.getItemById(id);
    setItem(updated);
  };

  const blueprintMaterials = materials.filter((m) => !m.is_incarnon_install);
  const incarnonMaterials = materials.filter((m) => m.is_incarnon_install);

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
          <a href={item.wiki_url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>
            {item.wiki_url}
          </a>
        </p>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Required Materials</h2>
        {blueprintMaterials.length === 0 && <p className="muted">No materials on record.</p>}
        <MaterialsTable materials={blueprintMaterials} owned={owned} onOwnedChange={handleOwnedChange} />
      </div>

      {item.has_incarnon_genesis && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="detail-header">
            <h2>Incarnon Genesis Install</h2>
            <button className="btn primary" onClick={incarnonTrackToggle}>
              {item.track_incarnon_install ? 'Untrack' : 'Track'}
            </button>
          </div>
          {item.track_incarnon_install ? (
            <>
              <MaterialsTable materials={incarnonMaterials} owned={owned} onOwnedChange={handleOwnedChange} />
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={!!item.incarnon_installed}
                    onChange={incarnonInstalledToggle}
                  />
                  Incarnon adapter installed
                </label>
                {item.incarnon_installed && (
                  <span className="badge" style={{ background: '#1a2e1a', color: '#6fcf97', borderColor: '#2a4a2a' }}>
                    ✓ done
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="muted">Not tracked. Click Track to include install materials in your Materials Needed dashboard.</p>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Crafting Tree</h2>
        {!craftingTree ? (
          <p className="muted">No tree data available.</p>
        ) : (
          <CraftingTreeNode node={craftingTree} owned={owned} depth={0} onOwnedChange={handleOwnedChange} />
        )}
      </div>

      {item.name.includes(' Prime ') && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Relics Needed</h2>
          {relics.length === 0 ? (
            <p className="muted">No relic data available for this item.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Relic</th>
                    <th>Rarity</th>
                  </tr>
                </thead>
                <tbody>
                  {relics.map((group) =>
                    group.relics.map((relic, idx) => (
                      <tr key={group.componentName + '-' + idx}>
                        {idx === 0 && (
                          <td rowSpan={group.relics.length} style={{ verticalAlign: 'top', fontWeight: 500 }}>
                            {group.componentName}
                          </td>
                        )}
                        <td>
                          {relic.relicName}
                          {relic.vaulted && <span className="badge muted" style={{ marginLeft: 6, fontSize: 11 }}>vaulted</span>}
                        </td>
                        <td>
                          <span className={`badge rarity-${relic.rarity.toLowerCase()}`}>{relic.rarity}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ItemDetail;
