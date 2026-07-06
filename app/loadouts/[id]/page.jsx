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

  // Slot form
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [slotForm, setSlotForm] = useState({ slot_type: 'warframe', item_id: '', custom_item_name: '', notes: '' });

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
    setLoadoutRepo(lr);
    const l = lr.getLoadoutById(id);
    setLoadout(l);
    setItems(repo.getAllItems());
    setLoading(false);
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

  // ── Slot CRUD ──

  const handleAddSlot = (e) => {
    e.preventDefault();
    const hasItem = slotForm.item_id || slotForm.custom_item_name.trim();
    if (!hasItem) return;
    loadoutRepo.addSlot(id, {
      slot_type: slotForm.slot_type,
      item_id: slotForm.item_id || null,
      custom_item_name: slotForm.custom_item_name.trim() || null,
      notes: slotForm.notes
    });
    setSlotForm({ slot_type: 'warframe', item_id: '', custom_item_name: '', notes: '' });
    setShowSlotForm(false);
    refresh();
  };

  const handleSlotAcquired = (slotId, acquired) => {
    loadoutRepo.updateSlot(id, slotId, { acquired });
    refresh();
  };

  const handleDeleteSlot = (slotId) => {
    if (!confirm('Delete this slot and all its requirements?')) return;
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

  if (loading) return <p className="muted">Loading...</p>;
  if (!loadout) return <p className="muted">Loadout not found.</p>;

  const slots = loadout.slots || [];

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <div>
          <Link href="/loadouts" className="muted" style={{ fontSize: 13 }}>&larr; Back to Loadouts</Link>
          <h1 style={{ margin: '4px 0 0', fontSize: 22, color: '#ffcf6a' }}>{loadout.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={() => setShowSlotForm(!showSlotForm)}>
            {showSlotForm ? 'Cancel' : '+ Add Slot'}
          </button>
          <button className="btn" onClick={handleDeleteLoadout}>Delete Loadout</button>
        </div>
      </div>

      {/* Add Slot Form */}
      {showSlotForm && (
        <form className="card" onSubmit={handleAddSlot}>
          <h2>Add Slot</h2>
          <div className="filters">
            <select
              value={slotForm.slot_type}
              onChange={(e) => setSlotForm({ ...slotForm, slot_type: e.target.value })}
            >
              {SLOT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={slotForm.item_id}
              onChange={(e) => setSlotForm({ ...slotForm, item_id: e.target.value, custom_item_name: '' })}
            >
              <option value="">Select item...</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>{it.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Or type custom name..."
              value={slotForm.custom_item_name}
              onChange={(e) => setSlotForm({ ...slotForm, custom_item_name: e.target.value, item_id: '' })}
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={slotForm.notes}
              onChange={(e) => setSlotForm({ ...slotForm, notes: e.target.value })}
            />
            <button className="btn primary" type="submit">Add</button>
          </div>
        </form>
      )}

      {/* Slots */}
      {slots.length === 0 && (
        <p className="muted">No slots yet. Add a slot to get started.</p>
      )}

      {slots.map((slot) => {
        const item = slot.item_id ? repo.getItemById(slot.item_id) : null;
        const displayName = slot.custom_item_name || (item ? item.name : 'Empty slot');
        const wikiUrl = item ? item.wiki_url : null;
        const reqs = slot.requirements || [];
        const isExpanded = !!expandedSlots[slot.id];
        const isEditing = editingSlotId === slot.id;

        return (
          <div className={`card slot-card${slot.acquired ? ' slot-acquired' : ''}`} key={slot.id}>
            {/* Slot header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge ${slot.slot_type}`}>{slot.slot_type}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={slot.acquired}
                      onChange={(e) => handleSlotAcquired(slot.id, e.target.checked)}
                    />
                    Acquired
                  </label>
                </div>
                <div style={{ marginTop: 6, fontWeight: 600, fontSize: 15 }}>
                  {item ? (
                    <>
                      <Link href={`/items/${item.id}`}>{displayName}</Link>
                      {wikiUrl && (
                        <> <a href={wikiUrl} target="_blank" rel="noreferrer" className="muted">[wiki]</a></>
                      )}
                    </>
                  ) : slot.custom_item_name ? (
                    <span>{displayName}</span>
                  ) : (
                    <span className="muted" style={{ fontStyle: 'italic' }}>Empty slot</span>
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
                  ) : (
                    <div className="muted" style={{ fontSize: 13 }}>
                      {slot.notes || <span style={{ fontStyle: 'italic' }}>No notes</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Slot actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {!isEditing && (
                  <button className="btn" onClick={() => startEditSlot(slot)}>Edit</button>
                )}
                <button className="btn" onClick={() => handleDeleteSlot(slot.id)}>Delete Slot</button>
              </div>
            </div>

            {/* Expand/collapse requirements */}
            <div style={{ marginTop: 10 }}>
              <button
                className="btn"
                onClick={() => toggleExpanded(slot.id)}
                style={{ fontSize: 13 }}
              >
                {isExpanded ? '▼' : '▶'} Requirements ({reqs.length})
              </button>
            </div>

            {isExpanded && (
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
