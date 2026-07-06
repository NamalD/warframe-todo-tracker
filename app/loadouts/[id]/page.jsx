'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import LoadoutRepository from '../../../src/data/loadout-repository.js';
import repo from '../../../src/data/store.js';

const SLOT_TYPES = ['warframe', 'primary', 'secondary', 'melee', 'companion', 'archwing', 'other'];

function LoadoutDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [loadoutRepo, setLoadoutRepo] = useState(null);
  const [loadout, setLoadout] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Inline populate form for empty slots
  const [populatingSlotId, setPopulatingSlotId] = useState(null);
  const [populateForm, setPopulateForm] = useState({ item_id: '', custom_item_name: '', notes: '' });

  // Requirement form (per slot)
  const [reqFormVisible, setReqFormVisible] = useState({});
  const [reqForm, setReqForm] = useState({});

  // Expand/collapse requirements
  const [expandedSlots, setExpandedSlots] = useState({});

  // Edit mode
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    const lr = new LoadoutRepository();
    lr.syncFromServer().then(() => {
      setLoadoutRepo(lr);
      const l = lr.getLoadoutById(id);
      setLoadout(l);
      setItems(repo.getAllItems());
      setLoading(false);
    });
  }, [id]);

  const refresh = () => {
    if (!loadoutRepo) return;
    const l = loadoutRepo.getLoadoutById(id);
    setLoadout(l);
  };

  const handleDeleteLoadout = () => {
    if (!confirm('Delete this entire loadout? All slots and requirements will be lost.')) return;
    loadoutRepo.deleteLoadout(id);
    router.push('/loadouts');
  };

  // ── Populate empty slot ──

  const openPopulate = (slotId) => {
    setPopulatingSlotId(slotId);
    setPopulateForm({ item_id: '', custom_item_name: '', notes: '' });
  };

  const cancelPopulate = () => {
    setPopulatingSlotId(null);
    setPopulateForm({ item_id: '', custom_item_name: '', notes: '' });
  };

  const handlePopulateSlot = (e, slotId) => {
    e.preventDefault();
    const hasItem = populateForm.item_id || populateForm.custom_item_name.trim();
    if (!hasItem) return;

    // Check for duplicate items in this loadout (exclude the slot being populated)
    const existing = slots.filter((s) => {
      if (s.id === slotId) return false;
      if (populateForm.item_id && s.item_id === populateForm.item_id) return true;
      if (populateForm.custom_item_name.trim() && s.custom_item_name === populateForm.custom_item_name.trim()) return true;
      return false;
    });
    if (existing.length > 0) {
      alert('This item is already in the loadout.');
      return;
    }

    loadoutRepo.updateSlot(id, slotId, {
      item_id: populateForm.item_id || null,
      custom_item_name: populateForm.custom_item_name.trim() || null,
      notes: populateForm.notes
    });
    setPopulatingSlotId(null);
    setPopulateForm({ item_id: '', custom_item_name: '', notes: '' });
    refresh();
  };

  // ── Slot CRUD ──

  const handleSlotAcquired = (slotId, acquired) => {
    loadoutRepo.updateSlot(id, slotId, { acquired });
    refresh();
  };

  const handleDeleteSlot = (slotId) => {
    if (!confirm('Reset this slot? All data and requirements will be cleared.')) return;
    loadoutRepo.deleteSlot(id, slotId);
    refresh();
  };

  const startEditSlot = (slot) => {
    setEditingSlotId(slot.id);
    setEditNotes(slot.notes || '');
  };

  const saveEditSlot = () => {
    if (!editingSlotId) return;
    loadoutRepo.updateSlot(id, editingSlotId, { notes: editNotes });
    setEditingSlotId(null);
    refresh();
  };

  // ── Requirement CRUD ──

  const toggleReqForm = (slotId) => {
    setReqFormVisible((prev) => ({ ...prev, [slotId]: !prev[slotId] }));
    if (!reqForm[slotId]) {
      setReqForm((prev) => ({ ...prev, [slotId]: { name: '', wiki_url: '', user_notes: '' } }));
    }
  };

  const handleAddRequirement = (e, slotId) => {
    e.preventDefault();
    const form = reqForm[slotId];
    if (!form || !form.name.trim()) return;
    loadoutRepo.addRequirement(slotId, {
      name: form.name.trim(),
      wiki_url: form.wiki_url.trim() || null,
      user_notes: form.user_notes.trim() || ''
    });
    setReqForm((prev) => ({ ...prev, [slotId]: { name: '', wiki_url: '', user_notes: '' } }));
    refresh();
  };

  const handleReqAcquired = (slotId, reqId, acquired) => {
    loadoutRepo.updateRequirement(slotId, reqId, { acquired });
    refresh();
  };

  const handleDeleteRequirement = (slotId, reqId) => {
    if (!confirm('Delete this requirement?')) return;
    loadoutRepo.deleteRequirement(slotId, reqId);
    refresh();
  };

  const toggleExpanded = (slotId) => {
    setExpandedSlots((prev) => ({ ...prev, [slotId]: !prev[slotId] }));
  };

  // ── Helper ──

  const isSlotEmpty = (slot) => !slot.item_id && !slot.custom_item_name;

  if (loading) return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <div>
          <div className="skeleton-line short" style={{ marginBottom: 8 }} />
          <div className="skeleton-line medium" style={{ height: 22 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="skeleton" style={{ width: 100, height: 36 }} />
          <div className="skeleton" style={{ width: 110, height: 36 }} />
        </div>
      </div>
      {[1, 2, 3].map((i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-line wide" />
          <div className="skeleton-line medium" />
          <div className="skeleton-line narrow" />
        </div>
      ))}
    </div>
  );
  if (!loadout) return (
    <div className="empty-state">
      <div className="empty-icon">🔍</div>
      <h3>Loadout not found</h3>
      <p>This loadout may have been deleted or the URL is incorrect.</p>
      <Link href="/loadouts" className="btn primary">Back to Loadouts</Link>
    </div>
  );

  const slots = loadout.slots || [];

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <div>
          <Link href="/loadouts" className="muted" style={{ fontSize: 13 }}>&larr; Back to Loadouts</Link>
          <h1 style={{ margin: '4px 0 0', fontSize: 22, color: '#ffcf6a' }}>{loadout.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleDeleteLoadout}>Delete Loadout</button>
        </div>
      </div>

      {/* Slots */}
      {slots.map((slot) => {
        const isEmpty = isSlotEmpty(slot);
        const item = slot.item_id ? repo.getItemById(slot.item_id) : null;
        const displayName = slot.custom_item_name || (item ? item.name : 'Empty slot');
        const wikiUrl = item ? item.wiki_url : null;
        const reqs = slot.requirements || [];
        const isExpanded = !!expandedSlots[slot.id];
        const isEditing = editingSlotId === slot.id;
        const isPopulating = populatingSlotId === slot.id;

        // ── Empty slot card ──
        if (isEmpty && !isPopulating) {
          return (
            <div className="card slot-card" key={slot.id} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
                   onClick={() => openPopulate(slot.id)}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${slot.slot_type}`}>{slot.slot_type}</span>
                  <span className="muted" style={{ fontStyle: 'italic' }}>Empty slot — click to populate</span>
                </div>
              </div>
            </div>
          );
        }

        // ── Populated or populating slot card ──
        return (
          <div className={`card slot-card${slot.acquired ? ' slot-acquired' : ''}`} key={slot.id}>
            {/* Slot header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge ${slot.slot_type}`}>{slot.slot_type}</span>
                  {!isEmpty && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={slot.acquired}
                        onChange={(e) => handleSlotAcquired(slot.id, e.target.checked)}
                      />
                      Acquired
                    </label>
                  )}
                </div>

                {/* Item name or populate form */}
                <div style={{ marginTop: 6, fontWeight: 600, fontSize: 15 }}>
                  {isPopulating ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select
                        value={populateForm.item_id}
                        onChange={(e) => setPopulateForm({ ...populateForm, item_id: e.target.value, custom_item_name: '' })}
                        style={{ minWidth: 160 }}
                      >
                        <option value="">Select item...</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>{it.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Or type custom name..."
                        value={populateForm.custom_item_name}
                        onChange={(e) => setPopulateForm({ ...populateForm, custom_item_name: e.target.value, item_id: '' })}
                        style={{ minWidth: 180 }}
                      />
                    </div>
                  ) : item ? (
                    <>
                      <Link href={`/items/${item.id}`}>{displayName}</Link>
                      {wikiUrl && (
                        <> <a href={wikiUrl} target="_blank" rel="noreferrer" className="muted">[wiki]</a></>
                      )}
                    </>
                  ) : (
                    <span>{displayName}</span>
                  )}
                </div>

                {/* Notes */}
                <div style={{ marginTop: 6 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Notes"
                        style={{ minHeight: 40, flex: 1 }}
                      />
                      <button className="btn primary" onClick={saveEditSlot}>Save</button>
                      <button className="btn" onClick={() => setEditingSlotId(null)}>Cancel</button>
                    </div>
                  ) : isPopulating ? (
                    <input
                      type="text"
                      placeholder="Notes (optional)"
                      value={populateForm.notes}
                      onChange={(e) => setPopulateForm({ ...populateForm, notes: e.target.value })}
                      style={{ width: '100%', maxWidth: 400 }}
                    />
                  ) : (
                    <div className="muted" style={{ fontSize: 13 }}>
                      {slot.notes || <span style={{ fontStyle: 'italic' }}>No notes</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Slot actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {isPopulating ? (
                  <>
                    <button className="btn primary" onClick={(e) => handlePopulateSlot(e, slot.id)}>Save</button>
                    <button className="btn" onClick={cancelPopulate}>Cancel</button>
                  </>
                ) : (
                  <>
                    {!isEditing && (
                      <button className="btn" onClick={() => startEditSlot(slot)}>Edit</button>
                    )}
                    <button className="btn" onClick={() => handleDeleteSlot(slot.id)}>
                      {isEmpty ? '—' : 'Delete Slot'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Expand/collapse requirements (only for populated slots) */}
            {!isEmpty && !isPopulating && (
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn"
                  onClick={() => toggleExpanded(slot.id)}
                  style={{ fontSize: 13 }}
                >
                  {isExpanded ? '▼' : '▶'} Requirements ({reqs.length})
                </button>
              </div>
            )}

            {isExpanded && !isPopulating && (
              <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid #1e2230' }}>
                {reqs.length === 0 && (
                  <p className="muted" style={{ fontSize: 13 }}>No requirements yet.</p>
                )}
                {reqs.map((req) => (
                  <div key={req.id} className="requirement-row" style={{ marginBottom: 8, padding: '8px 0', borderBottom: '1px solid #1e2230' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={req.acquired}
                          onChange={(e) => handleReqAcquired(slot.id, req.id, e.target.checked)}
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
                        onClick={() => handleDeleteRequirement(slot.id, req.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add requirement form */}
                <div style={{ marginTop: 8 }}>
                  {reqFormVisible[slot.id] ? (
                    <form onSubmit={(e) => handleAddRequirement(e, slot.id)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Name (required)"
                        value={(reqForm[slot.id] || {}).name || ''}
                        onChange={(e) => setReqForm((prev) => ({ ...prev, [slot.id]: { ...prev[slot.id], name: e.target.value } }))}
                        style={{ minWidth: 160 }}
                      />
                      <input
                        type="text"
                        placeholder="Wiki URL (optional)"
                        value={(reqForm[slot.id] || {}).wiki_url || ''}
                        onChange={(e) => setReqForm((prev) => ({ ...prev, [slot.id]: { ...prev[slot.id], wiki_url: e.target.value } }))}
                        style={{ minWidth: 200 }}
                      />
                      <input
                        type="text"
                        placeholder="Notes (optional)"
                        value={(reqForm[slot.id] || {}).user_notes || ''}
                        onChange={(e) => setReqForm((prev) => ({ ...prev, [slot.id]: { ...prev[slot.id], user_notes: e.target.value } }))}
                        style={{ minWidth: 160 }}
                      />
                      <button className="btn primary" type="submit">Add</button>
                      <button className="btn" type="button" onClick={() => toggleReqForm(slot.id)}>Cancel</button>
                    </form>
                  ) : (
                    <button className="btn" style={{ fontSize: 13 }} onClick={() => toggleReqForm(slot.id)}>
                      + Add Requirement
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default LoadoutDetailPage;
