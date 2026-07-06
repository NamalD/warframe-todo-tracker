'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import LoadoutRepository from '../../src/data/loadout-repository.js';

function LoadoutsPage() {
  const [loadoutRepo, setLoadoutRepo] = useState(null);
  const [loadouts, setLoadouts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const lr = new LoadoutRepository();
    setLoadoutRepo(lr);
    setLoadouts(lr.getLoadouts());
    setLoading(false);
  }, []);

  const refresh = () => {
    if (!loadoutRepo) return;
    setLoadouts(loadoutRepo.getLoadouts());
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    loadoutRepo.createLoadout({ name: newName.trim() });
    setNewName('');
    setCreating(false);
    refresh();
  };

  const handleDelete = (id) => {
    if (!confirm('Delete this loadout? All slots and requirements will be lost.')) return;
    loadoutRepo.deleteLoadout(id);
    refresh();
  };

  if (loading) return <p className="muted">Loading loadouts...</p>;

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#ffcf6a' }}>Loadouts</h1>
        <button className="btn primary" onClick={() => setCreating(!creating)}>
          {creating ? 'Cancel' : '+ New Loadout'}
        </button>
      </div>

      {creating && (
        <form className="card" onSubmit={handleCreate}>
          <h2>New Loadout</h2>
          <div className="filters">
            <input
              type="text"
              placeholder="Loadout name (e.g., Saryn Loadout)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <button className="btn primary" type="submit">Create</button>
          </div>
        </form>
      )}

      {!loading && loadouts.length === 0 && !creating && (
        <p className="muted">No loadouts yet. Create one to get started.</p>
      )}

      {loadouts.map((loadout) => {
        const slots = loadout.slots || [];
        const acquiredCount = slots.filter((s) => s.acquired).length;
        const slotSummary = slots.length > 0
          ? slots.map((s) => {
              const label = s.custom_item_name || (s.item_id ? `Item #${s.item_id}` : 'Empty slot');
              return `${s.slot_type}: ${label}`;
            }).join(' • ')
          : 'No slots yet';

        return (
          <div className="card" key={loadout.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <Link href={`/loadouts/${loadout.id}`} style={{ fontSize: 16, fontWeight: 600 }}>
                  {loadout.name}
                </Link>
                <div className="muted" style={{ marginTop: 4 }}>
                  {slots.length} slot{slots.length !== 1 ? 's' : ''} • {acquiredCount} / {slots.length} acquired
                </div>
                <div className="muted" style={{ marginTop: 2, fontSize: 12, maxWidth: 500 }}>
                  {slotSummary}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
                <Link href={`/loadouts/${loadout.id}`} className="btn">Open</Link>
                <button className="btn" onClick={() => handleDelete(loadout.id)}>Delete</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default LoadoutsPage;
