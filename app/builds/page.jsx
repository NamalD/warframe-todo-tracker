'use client';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import buildStore from '../../src/data/build-store.js';

function isBuildComplete(build) {
  if (!build.acquired) return false;
  const reqs = build.requirements || [];
  return reqs.length === 0 || reqs.every((r) => r.acquired);
}

function BuildsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [buildRepo, setBuildRepo] = useState(null);
  const [builds, setBuilds] = useState([]);
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newItemId, setNewItemId] = useState('');
  const [newCustomName, setNewCustomName] = useState('');
  const [loading, setLoading] = useState(true);

  const statusFilter = searchParams.get('status') || 'all';

  useEffect(() => {
    const br = buildStore;
    br.syncFromServer().then(async () => {
      setBuildRepo(br);
      setBuilds(br.getBuilds());
      // Load items for the item picker
      const repo = (await import('../../src/data/store.js')).default;
      const allItems = await repo.getAllItems();
      setItems(allItems);
      setLoading(false);
    });
  }, []);

  const refresh = () => {
    if (!buildRepo) return;
    setBuilds(buildRepo.getBuilds());
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

    // If an item is selected, use its name and wiki_url automatically
    let name = newName.trim();
    let itemId = newItemId || null;
    let customItemName = newCustomName.trim() || null;
    let wikiUrl = null;

    if (itemId) {
      const selectedItem = items.find((it) => it.id === itemId);
      if (selectedItem) {
        name = selectedItem.name;
        wikiUrl = selectedItem.wiki_url || null;
        customItemName = null;
      }
    }

    buildRepo.createBuild({
      name,
      item_id: itemId,
      custom_item_name: customItemName,
      wiki_url: wikiUrl,
      notes: ''
    });
    setNewName('');
    setNewItemId('');
    setNewCustomName('');
    setCreating(false);
    refresh();
  };

  const handleDelete = (id) => {
    if (!confirm('Delete this build? All requirements will be lost.')) return;
    buildRepo.deleteBuild(id);
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
  let filtered = builds;
  if (statusFilter === 'in_progress') {
    filtered = builds.filter((b) => !isBuildComplete(b));
  } else if (statusFilter === 'complete') {
    filtered = builds.filter((b) => isBuildComplete(b));
  }

  const FILTER_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
  ];

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#ffcf6a' }}>Builds</h1>
        <button className="btn primary" onClick={() => setCreating(!creating)} data-testid="new-build-btn">
          {creating ? 'Cancel' : '+ New Build'}
        </button>
      </div>

      {/* Status filter */}
      <div className="filters">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`btn${statusFilter === opt.value ? ' primary' : ''}`}
            onClick={() => setStatusFilter(opt.value)}
            data-testid={`filter-${opt.value}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {creating && (
        <form className="card" onSubmit={handleCreate}>
          <h2>New Build</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="filters">
              <select
                value={newItemId}
                onChange={(e) => {
                  setNewItemId(e.target.value);
                  if (e.target.value) setNewCustomName('');
                }}
                style={{ minWidth: 200 }}
                data-testid="build-item-select"
              >
                <option value="">Select item from database...</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.name}</option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 13 }}>or</span>
              <input
                type="text"
                placeholder="Type custom name..."
                value={newCustomName}
                onChange={(e) => {
                  setNewCustomName(e.target.value);
                  if (e.target.value) setNewItemId('');
                }}
                style={{ minWidth: 180 }}
                data-testid="build-custom-name"
              />
            </div>
            <div className="filters">
              <input
                type="text"
                placeholder="Build name (auto-filled from item)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ minWidth: 200 }}
                data-testid="build-name-input"
              />
              <button className="btn primary" type="submit" data-testid="create-build-btn">Create</button>
            </div>
          </div>
        </form>
      )}

      {filtered.length === 0 && !creating && (
        <div className="empty-state">
          <div className="empty-icon">{statusFilter === 'complete' ? '🎯' : '🔧'}</div>
          <h3>{statusFilter === 'complete' ? 'No complete builds yet' : statusFilter === 'in_progress' ? 'No in-progress builds' : 'No builds yet'}</h3>
          <p>{statusFilter === 'complete' ? 'Complete all your builds to see them here!' : statusFilter === 'in_progress' ? 'All builds are complete. Great work, Tenno!' : 'Create your first build to track a weapon, warframe, or project.'}</p>
          {statusFilter === 'all' && (
            <button className="btn primary" onClick={() => setCreating(true)} data-testid="empty-create-btn">+ Create Build</button>
          )}
        </div>
      )}

      {filtered.map((build) => {
        const reqs = build.requirements || [];
        const acquiredCount = reqs.filter((r) => r.acquired).length;
        const complete = isBuildComplete(build);
        const item = build.item_id ? items.find((it) => it.id === build.item_id) : null;
        const displayName = build.custom_item_name || (item ? item.name : build.name);
        const wikiUrl = build.wiki_url || (item ? item.wiki_url : null);

        return (
          <div className="card" key={build.id} data-testid={`build-card-${build.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <Link href={`/builds/${build.id}`} style={{ fontSize: 16, fontWeight: 600 }} data-testid={`build-link-${build.id}`}>
                  {build.name}
                </Link>
                <div className="muted" style={{ marginTop: 4 }}>
                  {displayName !== build.name && (
                    <span style={{ fontSize: 12, marginRight: 8 }}>{displayName}</span>
                  )}
                  {wikiUrl && (
                    <a href={wikiUrl} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}>[wiki]</a>
                  )}
                </div>
                <div className="muted" style={{ marginTop: 2 }}>
                  {build.acquired ? 'Acquired' : 'Not acquired'}
                  {reqs.length > 0 && <> • {acquiredCount} / {reqs.length} requirements</>}
                  {complete && (
                    <span className="badge completed" style={{ marginLeft: 8 }}>Complete</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
                <Link href={`/builds/${build.id}`} className="btn" data-testid={`open-build-${build.id}`}>Open</Link>
                <button className="btn" onClick={() => handleDelete(build.id)} data-testid={`delete-build-${build.id}`}>Delete</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BuildsPage() {
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
      <BuildsPageInner />
    </Suspense>
  );
}
