'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import repo from '../src/data/store.js';
import modRepo from '../src/data/mod-store.js';
import LoadoutDashboardSection from '../src/components/loadout-dashboard-section.jsx';
import BuildDashboardSection from '../src/components/build-dashboard-section.jsx';

function Home() {
  const [items, setItems] = useState([]);
  const [todos, setTodos] = useState([]);
  const [materialsList, setMaterialsList] = useState([]);
  const [trackedMods, setTrackedMods] = useState([]);
  const [modsLoading, setModsLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const allItems = await repo.getAllItems();
      setItems(allItems);
      setTodos(repo.getTodos());

      const inv = repo.getMaterialInventory();

      // Materials needed: aggregate across tracked items
      const tracked = allItems.filter((it) => it.is_user_tracked);
      const matMap = {};
      for (const item of tracked) {
        const materials = await repo.getMaterialsForItem(item.id);
        for (const m of materials) {
          const key = m.material_name;
          if (!matMap[key]) {
            matMap[key] = { name: m.material_name, quantity: 0, items: [] };
          }
          matMap[key].quantity += m.quantity_required;
          matMap[key].items.push(item.name);
        }
      }
      setMaterialsList(
        Object.values(matMap).map((m) => {
          const ownedQty = inv[m.name] ?? 0;
          const deficit = Math.max(0, m.quantity - ownedQty);
          return { ...m, owned: ownedQty, deficit, done: deficit <= 0 };
        }).sort((a, b) => a.name.localeCompare(b.name))
      );
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    modRepo.getTrackedMods()
      .then((data) => { setTrackedMods(data); setModsLoading(false); })
      .catch(() => setModsLoading(false));
  }, []);

  // Tracked items
  const trackedItems = items.filter((it) => it.is_user_tracked);

  // Todo counts
  const pendingTodos = todos.filter((t) => t.status === 'pending');
  const inProgressTodos = todos.filter((t) => t.status === 'in_progress');

  if (loading) {
    return (
      <div>
        <div className="detail-header" style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: '#ffcf6a' }}>Dashboard</h1>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 28 }}>
          <div className="card">
            <h2>Tracked Items</h2>
            <div className="skeleton" style={{ height: 28, width: 40, margin: '8px 0' }} />
            <div className="skeleton" style={{ height: 18, width: 140 }} />
          </div>
          <div className="card">
            <h2>Todos</h2>
            <div className="skeleton" style={{ height: 28, width: 160, margin: '8px 0' }} />
          </div>
        </div>
        <div className="card">
          <div className="skeleton" style={{ height: 18, width: 280, margin: '0 0 10px' }} />
          <div className="skeleton" style={{ height: 16, width: 200 }} />
        </div>
        <div className="card">
          <h2><span className="skeleton" style={{ height: 18, width: 140, display: 'inline-block' }} /></h2>
          <div className="skeleton" style={{ height: 28, width: 40, margin: '8px 0' }} />
          <div className="skeleton" style={{ height: 14, width: 180 }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#ffcf6a' }}>Dashboard</h1>
      </div>

      <LoadoutDashboardSection />

      {/* Summary cards row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 28 }}>
        <div className="card">
          <h2>Tracked Items</h2>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#ffcf6a', margin: '8px 0' }}>
            {trackedItems.length}
          </div>
          <p>
            {trackedItems.length > 0 ? (
              <Link href="/items" className="btn">View all items &rarr;</Link>
            ) : (
              <span>No items tracked yet.</span>
            )}
          </p>
        </div>

        {todos.length > 0 && (
          <div className="card" data-testid="todos-card">
            <h2>Todos</h2>
            <div style={{ display: 'flex', gap: 20, margin: '8px 0' }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f2c94c' }}>
                  {inProgressTodos.length}
                </div>
                <span className="badge in_progress">in progress</span>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#b6bcc7' }}>
                  {pendingTodos.length}
                </div>
                <span className="badge pending">pending</span>
              </div>
            </div>
            <p>
              <Link href="/todos" className="btn">View all todos &rarr;</Link>
            </p>
          </div>
        )}
      </div>

      {/* Mods to Acquire */}
      {(modsLoading || trackedMods.length > 0) && (
        <div className="card" style={{ marginBottom: 28 }} data-testid="mods-to-acquire-card">
          <h2>Mods to Acquire</h2>
          {modsLoading ? (
            <div className="skeleton" style={{ height: 18, width: 120, margin: '8px 0' }} />
          ) : (
            <>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#ffcf6a', margin: '8px 0' }}>
                {trackedMods.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {trackedMods.map((mod) => (
                  <div key={mod.id}>
                    <Link href={`/mods/${mod.id}`} style={{ color: '#7cc4ff', textDecoration: 'none', fontSize: 14 }}>
                      {mod.name}
                    </Link>
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                      {mod.rarity} &middot; {mod.mod_type}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 12 }}>
                <Link href="/mods" className="btn">View all mods &rarr;</Link>
              </p>
            </>
          )}
        </div>
      )}

      {/* Materials needed summary */}
      {materialsList.length > 0 && (
        <div>
          <h2 style={{ fontSize: 18, color: '#ffcf6a', marginBottom: 14 }}>
            Materials Needed (Tracked Items)
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {materialsList.map((mat) => (
              <div className="card" key={mat.name} style={mat.done ? { opacity: 0.65 } : undefined} data-testid={`material-card-${mat.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <strong style={{ fontSize: 15, color: '#e7e9ee' }}>{mat.name}</strong>
                    <div className="muted">
                      {mat.done ? (
                        <span style={{ color: '#6fcf97' }}>✓ done</span>
                      ) : (
                        <span>needs {mat.deficit.toLocaleString()} (owned {mat.owned.toLocaleString()} / {mat.quantity.toLocaleString()})</span>
                      )}
                    </div>
                  </div>
                  <span className="badge">{mat.items.length} item{mat.items.length > 1 ? 's' : ''}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  {mat.items.map((itemName) => (
                    <div key={itemName} style={{ fontSize: 13, color: '#b6bcc7' }}>
                      {itemName}
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: 10 }}>
                  <Link href={`/sources?material=${encodeURIComponent(mat.name)}`}>
                    View sources &rarr;
                  </Link>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {materialsList.length === 0 && trackedItems.length === 0 && (
        <div className="card">
          <p>Start by tracking items and creating todos to see your dashboard.</p>
        </div>
      )}
    </div>
  );
}

export default Home;
