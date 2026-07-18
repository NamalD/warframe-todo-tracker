// @ts-nocheck
'use client';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import buildStore from '../../../src/data/build-store.ts';
import repo from '../../../src/data/store.ts';
import SearchableSelect from '../../components/searchable-select';

function BuildDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [buildRepo, setBuildRepo] = useState(null);
  const [build, setBuild] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edition state
  const [editing, setEditing] = useState(false);
  const [editAcquired, setEditAcquired] = useState(false);
  const [editNotes, setEditNotes] = useState('');

  // Requirement form
  const [reqFormVisible, setReqFormVisible] = useState(false);
  const [reqForm, setReqForm] = useState({ name: '', wiki_url: '', user_notes: '' });

  // Link-to-item form
  const [linkingItem, setLinkingItem] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');

  useEffect(() => {
    const br = buildStore;
    br.init().then(async () => {
      setBuildRepo(br);
      const b = br.getBuildById(id);
      setBuild(b);
      const allItems = await repo.getAllItems();
      setItems(allItems);
      setLoading(false);
    });
  }, [id]);

  const refresh = () => {
    if (!buildRepo) return;
    const b = buildRepo.getBuildById(id);
    setBuild(b);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this build? All requirements will be lost.')) return;
    setSaving(true);
    try {
      await buildRepo.deleteBuild(id);
      router.push('/builds');
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ──

  const startEdit = () => {
    if (!build) return;
    setEditAcquired(build.acquired);
    setEditNotes(build.notes || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!buildRepo || !build) return;
    setSaving(true);
    try {
      await buildRepo.updateBuild(build.id, { acquired: editAcquired, notes: editNotes });
      setEditing(false);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  // ── Link to item ──

  const handleLinkItem = async () => {
    if (!selectedItemId || !buildRepo || !build) return;
    const item = items.find((it) => it.id === selectedItemId);
    if (!item) return;
    setSaving(true);
    try {
      await buildRepo.updateBuild(build.id, {
        item_id: item.id,
        custom_item_name: null,
        wiki_url: item.wiki_url || null
      });
      setLinkingItem(false);
      setSelectedItemId('');
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkItem = async () => {
    if (!confirm('Remove the link to this item?')) return;
    setSaving(true);
    try {
      await buildRepo.updateBuild(build.id, { item_id: null, wiki_url: null });
      refresh();
    } finally {
      setSaving(false);
    }
  };

  // ── Requirement CRUD ──

  const handleAddRequirement = async (e) => {
    e.preventDefault();
    if (!reqForm.name.trim() || !buildRepo || !build) return;

    setSaving(true);
    try {
      buildRepo.addRequirement(build.id, {
        name: reqForm.name.trim(),
        wiki_url: reqForm.wiki_url.trim() || null,
        user_notes: reqForm.user_notes.trim() || ''
      });
      setReqForm({ name: '', wiki_url: '', user_notes: '' });
      setReqFormVisible(false);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleReqAcquired = async (reqId, acquired) => {
    if (!buildRepo || !build) return;
    await buildRepo.updateRequirement(build.id, reqId, { acquired });
    refresh();
  };

  const handleDeleteRequirement = async (reqId) => {
    if (!confirm('Delete this requirement?')) return;
    setSaving(true);
    try {
      await buildRepo.deleteRequirement(build.id, reqId);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  // ── Helper ──

  const findItem = (itemId) => items.find((it) => it.id === itemId) || null;

  if (loading) return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <div>
          <div className="skeleton-line short" style={{ marginBottom: 8 }} />
          <div className="skeleton-line medium" style={{ height: 22 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="skeleton" style={{ width: 110, height: 36 }} />
        </div>
      </div>
      <div className="skeleton-card">
        <div className="skeleton-line wide" />
        <div className="skeleton-line medium" />
        <div className="skeleton-line narrow" />
      </div>
    </div>
  );

  if (!build) return (
    <div className="empty-state">
      <div className="empty-icon">🔍</div>
      <h3>Build not found</h3>
      <p>This build may have been deleted or the URL is incorrect.</p>
      <Link href="/builds" className="btn primary">Back to Builds</Link>
    </div>
  );

  const item = build.item_id ? findItem(build.item_id) : null;
  const displayName = build.custom_item_name || (item ? item.name : build.name);
  const wikiUrl = build.wiki_url || (item ? item.wiki_url : null);
  const reqs = build.requirements || [];

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <div>
          <Link href="/builds" className="muted" style={{ fontSize: 13 }}>&larr; Back to Builds</Link>
          <h1 style={{ margin: '4px 0 0', fontSize: 22, color: '#ffcf6a' }}>{build.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing && (
            <>
              <button className={`btn${saving ? ' loading' : ''}`} onClick={startEdit} data-testid="edit-build-btn">Edit</button>
              <button className={`btn${saving ? ' loading' : ''}`} onClick={handleDelete} data-testid="delete-build-btn">Delete Build</button>
            </>
          )}
          {editing && (
            <>
              <button className={`btn primary${saving ? ' loading' : ''}`} onClick={saveEdit} data-testid="save-build-btn">Save</button>
              <button className="btn" onClick={cancelEdit}>Cancel</button>
            </>
          )}
        </div>
      </div>

      {/* Main build card */}
      <div className="card">
        {/* Acquired toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editing ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editAcquired}
                  onChange={(e) => setEditAcquired(e.target.checked)}
                  data-testid="acquired-checkbox"
                />
                Acquired
              </label>
            ) : (
              <span className={`badge ${build.acquired ? 'completed' : ''}`}>
                {build.acquired ? 'Acquired ✓' : 'Not Acquired'}
              </span>
            )}
          </div>
        </div>

        {/* Item name display */}
        <div style={{ marginBottom: 8, fontSize: 15 }}>
          <strong>{displayName}</strong>
          {wikiUrl && (
            <> <a href={wikiUrl} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 13 }}>[wiki]</a></>
          )}
        </div>

        {/* Link to item */}
        {item ? (
          <div style={{ marginBottom: 8 }}>
            <Link href={`/items/${item.id}`} style={{ fontSize: 13 }}>View item details &rarr;</Link>
            <button className={`btn${saving ? ' loading' : ''}`} style={{ fontSize: 11, padding: '2px 8px', marginLeft: 8 }} onClick={handleUnlinkItem}>Unlink</button>
          </div>
        ) : linkingItem ? (
          <div className="filters" style={{ marginBottom: 8 }}>
            <SearchableSelect
              value={selectedItemId}
              onChange={(val) => setSelectedItemId(val)}
              options={items.map(it => ({ value: it.id, label: it.name }))}
              placeholder="Select an item..."
              style={{ minWidth: 180 }}
              data-testid="link-item-select"
            />
            <button className={`btn primary${saving ? ' loading' : ''}`} onClick={handleLinkItem} disabled={!selectedItemId}>Link</button>
            <button className="btn" onClick={() => setLinkingItem(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn" style={{ fontSize: 12 }} onClick={() => setLinkingItem(true)} data-testid="link-item-btn">
            + Link to item database
          </button>
        )}

        {/* Notes */}
        <div style={{ marginTop: 8 }}>
          {editing ? (
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Notes"
              style={{ minHeight: 50, width: '100%', maxWidth: 500 }}
              data-testid="notes-textarea"
            />
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              {build.notes || <span style={{ fontStyle: 'italic' }}>No notes</span>}
            </div>
          )}
        </div>
      </div>

      {/* Requirements section */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#e7e9ee' }}>
            Requirements ({reqs.length})
          </h2>
          {!reqFormVisible && (
            <button className="btn" onClick={() => setReqFormVisible(true)} data-testid="add-req-btn">
              + Add Requirement
            </button>
          )}
        </div>

        {/* Add requirement form */}
        {reqFormVisible && (
          <form onSubmit={handleAddRequirement} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <input
                type="text"
                placeholder="Name (required)"
                value={reqForm.name}
                onChange={(e) => setReqForm({ ...reqForm, name: e.target.value })}
                style={{ minWidth: 160 }}
                data-testid="req-name-input"
              />
              <input
                type="text"
                placeholder="Wiki URL (optional)"
                value={reqForm.wiki_url}
                onChange={(e) => setReqForm({ ...reqForm, wiki_url: e.target.value })}
                style={{ minWidth: 200 }}
                data-testid="req-wiki-input"
              />
              <input
                type="text"
                placeholder="Notes (optional)"
                value={reqForm.user_notes}
                onChange={(e) => setReqForm({ ...reqForm, user_notes: e.target.value })}
                style={{ minWidth: 160 }}
                data-testid="req-notes-input"
              />
            </div>
            <div className="filters">
              <button className={`btn primary${saving ? ' loading' : ''}`} type="submit" data-testid="save-req-btn">Add</button>
              <button className="btn" type="button" onClick={() => { setReqFormVisible(false); setReqForm({ name: '', wiki_url: '', user_notes: '' }); }}>Cancel</button>
            </div>
          </form>
        )}

        {/* Requirements list */}
        {reqs.length === 0 && !reqFormVisible && (
          <p className="muted" style={{ fontSize: 13 }}>No requirements yet.</p>
        )}

        {reqs.map((req) => (
          <div key={req.id} className="requirement-row" style={{ marginBottom: 8, padding: '8px 0', borderBottom: '1px solid #1e2230' }} data-testid={`req-row-${req.id}`}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={req.acquired}
                  onChange={(e) => handleReqAcquired(req.id, e.target.checked)}
                  data-testid={`req-checkbox-${req.id}`}
                />
              </label>
              <span style={{ fontWeight: 500, textDecoration: req.acquired ? 'line-through' : 'none', opacity: req.acquired ? 0.5 : 1 }}>
                {req.wiki_url ? (
                  <a href={req.wiki_url} target="_blank" rel="noreferrer">{req.name}</a>
                ) : (
                  req.name
                )}
              </span>
              {req.user_notes && (
                <span className="muted" style={{ fontSize: 12 }}>— {req.user_notes}</span>
              )}
              <button
                className="btn"
                style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto' }}
                onClick={() => handleDeleteRequirement(req.id)}
                data-testid={`delete-req-${req.id}`}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BuildDetailPage() {
  return (
    <Suspense fallback={
      <div>
        <div className="detail-header" style={{ marginBottom: 14 }}>
          <div>
            <div className="skeleton-line short" style={{ marginBottom: 8 }} />
            <div className="skeleton-line medium" style={{ height: 22 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton" style={{ width: 110, height: 36 }} />
          </div>
        </div>
        <div className="skeleton-card">
          <div className="skeleton-line wide" />
          <div className="skeleton-line medium" />
          <div className="skeleton-line narrow" />
        </div>
      </div>
    }>
      <BuildDetailInner />
    </Suspense>
  );
}
