'use client';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import loadoutStore from '../../src/data/loadout-store.js';

function isLoadoutComplete(loadout) {
  const slots = (loadout.slots || []).filter((s) => s.item_id || s.custom_item_name);
  if (slots.length === 0) return false;
  return slots.every((s) => s.acquired);
}

function LoadoutsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loadoutRepo, setLoadoutRepo] = useState(null);
  const [loadouts, setLoadouts] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  const statusFilter = searchParams.get('status') || 'all';

  useEffect(() => {
    const lr = loadoutStore;
    lr.init().then(() => {
      setLoadoutRepo(lr);
      setLoadouts(lr.getLoadouts());
      setLoading(false);
    });
  }, []);

  const refresh = () => {
    if (!loadoutRepo) return;
    setLoadouts(loadoutRepo.getLoadouts());
  };

  const setStatusFilter = (value) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete('status');
    } else {
      params.set('status', value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
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

  if (loading) return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <div className="skeleton-line medium" style={{ height: 22 }} />
        <div className="skeleton" style={{ width: 120, height: 36 }} />
      </div>
      {[1, 2, 3].map((i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-line wide" style={{ height: 16 }} />
          <div className="skeleton-line narrow" />
          <div className="skeleton-line medium" style={{ height: 12 }} />
        </div>
      ))}
    </div>
  );

  // Filter
  let filtered = loadouts;
  if (statusFilter === 'in_progress') {
    filtered = loadouts.filter((l) => !isLoadoutComplete(l));
  } else if (statusFilter === 'complete') {
    filtered = loadouts.filter((l) => isLoadoutComplete(l));
  }

  const FILTER_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
  ];

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#ffcf6a' }}>Loadouts</h1>
        <button className="btn primary" onClick={() => setCreating(!creating)}>
          {creating ? 'Cancel' : '+ New Loadout'}
        </button>
      </div>

      {/* Status filter */}
      <div className="filters">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`btn${statusFilter === opt.value ? ' primary' : ''}`}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
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

      {filtered.length === 0 && !creating && (
        <div className="empty-state">
          <div className="empty-icon">{statusFilter === 'complete' ? '🎯' : '📋'}</div>
          <h3>{statusFilter === 'complete' ? 'No complete loadouts yet' : statusFilter === 'in_progress' ? 'No in-progress loadouts' : 'No loadouts yet'}</h3>
          <p>{statusFilter === 'complete' ? 'Keep farming! All your loadouts still have items to acquire.' : statusFilter === 'in_progress' ? 'All loadouts are complete. Great work, Tenno!' : 'Create your first loadout to start tracking equipment and requirements.'}</p>
          {statusFilter === 'all' && (
            <button className="btn primary" onClick={() => setCreating(true)}>+ Create Loadout</button>
          )}
        </div>
      )}

      {filtered.map((loadout) => {
        const populatedSlots = (loadout.slots || []).filter((s) => s.item_id || s.custom_item_name);
        const acquiredCount = populatedSlots.filter((s) => s.acquired).length;
        const complete = isLoadoutComplete(loadout);
        const slotSummary = populatedSlots.length > 0
          ? populatedSlots.map((s) => {
              const label = s.custom_item_name || (s.item_id ? `Item #${s.item_id}` : 'Empty slot');
              return `${s.slot_type}: ${label}`;
            }).join(' • ')
          : 'No items added yet';

        return (
          <div className="card" key={loadout.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <Link href={`/loadouts/${loadout.id}`} style={{ fontSize: 16, fontWeight: 600 }}>
                  {loadout.name}
                </Link>
                <div className="muted" style={{ marginTop: 4 }}>
                  {populatedSlots.length} item{populatedSlots.length !== 1 ? 's' : ''} • {acquiredCount} / {populatedSlots.length} acquired
                  {complete && populatedSlots.length > 0 && (
                    <span className="badge completed" style={{ marginLeft: 8 }}>Complete</span>
                  )}
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

export default function LoadoutsPage() {
  return (
    <Suspense fallback={
      <div>
        <div className="detail-header" style={{ marginBottom: 14 }}>
          <div className="skeleton-line medium" style={{ height: 22 }} />
          <div className="skeleton" style={{ width: 120, height: 36 }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div className="skeleton-card" key={i}>
            <div className="skeleton-line wide" style={{ height: 16 }} />
            <div className="skeleton-line narrow" />
            <div className="skeleton-line medium" style={{ height: 12 }} />
          </div>
        ))}
      </div>
    }>
      <LoadoutsPageInner />
    </Suspense>
  );
}
