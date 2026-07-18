// @ts-nocheck
'use client';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import loadoutStore from '../../../src/data/loadout-store.ts';
import repo from '../../../src/data/store.ts';
import RequirementCombobox from './requirement-combobox';
import SearchableSelect from '../../components/searchable-select';
import { getOptionsForSlot } from '../../../src/data/requirement-options.ts';
import { NECRAMECHS, ARCHGUNS, getNecramechMeleesFor, formatSlotType } from '../../../src/data/necramech-options.ts';

const SLOT_TYPES = ['warframe', 'primary', 'secondary', 'melee', 'necramech', 'archgun', 'necramech_melee', 'companion', 'archwing', 'other'];

const SLOT_TYPE_TO_ITEM_TYPE = {
  warframe: 'warframe',
  primary: 'primary',
  secondary: 'secondary',
  melee: 'melee',
};

// Slot types not backed by the reference item catalog (@wfcd/items has no
// clean Necramech/Archgun/Necramech-melee data — see necramech-options.ts).
// Picks from these slots' curated option lists are stored as custom_item_name.
const CURATED_NAME_SLOT_TYPES = new Set(['necramech', 'archgun', 'necramech_melee']);

/**
 * Curated {value, label} options for slot types not backed by the item
 * catalog, or null for catalog-backed slot types.
 */
function getCuratedOptions(slotType, slots) {
  if (slotType === 'necramech') return NECRAMECHS.map((n) => ({ value: n, label: n }));
  if (slotType === 'archgun') return ARCHGUNS.map((n) => ({ value: n, label: n }));
  if (slotType === 'necramech_melee') {
    const mechSlot = (slots || []).find((s) => s.slot_type === 'necramech');
    return getNecramechMeleesFor(mechSlot?.custom_item_name).map((n) => ({ value: n, label: n }));
  }
  return null;
}

function LoadoutDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  const [loadoutRepo, setLoadoutRepo] = useState(null);
  const [loadout, setLoadout] = useState(null);
  const [notes, setNotes] = useState('');
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

  // Duplicate requirement warning per slot
  const [reqWarning, setReqWarning] = useState({});

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const lr = loadoutStore;
    lr.init().then(async () => {
      setLoadoutRepo(lr);
      const l = lr.getLoadoutById(id);
      setLoadout(l);
      setNotes(l?.data?.notes || l?.notes || '');
      const allItems = await repo.getAllItems();
      setItems(allItems);
      setLoading(false);
    });
  }, [id]);

  const refresh = () => {
    if (!loadoutRepo) return;
    const l = loadoutRepo.getLoadoutById(id);
    setLoadout(l);
  };

  const saveNotes = async () => {
    if (!loadoutRepo || !loadout) return;
    // Merge notes into the loadout's data blob
    const currentData = loadout.data || {};
    currentData.notes = notes;
    await loadoutRepo.updateLoadoutData(id, currentData);
  };

  const handleDeleteLoadout = async () => {
    if (!confirm('Delete this entire loadout? All slots and requirements will be lost.')) return;
    setSaving(true);
    try {
      await loadoutRepo.deleteLoadout(id);
      router.push('/loadouts');
    } finally {
      setSaving(false);
    }
  };

  // ── Populate empty slot ──

  const openPopulate = (slotId) => {
    setPopulatingSlotId(slotId);
    setPopulateForm({ item_id: '', custom_item_name: '', notes: '' });
    // Auto-open the add-requirement form so requirements can be added inline during setup
    setReqFormVisible((prev) => ({ ...prev, [slotId]: true }));
    setReqForm((prev) => ({ ...prev, [slotId]: { name: '', wiki_url: '', user_notes: '' } }));
  };

  const cancelPopulate = () => {
    setPopulatingSlotId(null);
    setPopulateForm({ item_id: '', custom_item_name: '', notes: '' });
  };

  const handlePopulateSlot = async (e, slotId) => {
    e.preventDefault();
    const slot = slots.find((s) => s.id === slotId);
    const isCurated = CURATED_NAME_SLOT_TYPES.has(slot?.slot_type);
    const finalItemId = isCurated ? null : (populateForm.item_id || null);
    const finalCustomName = isCurated
      ? (populateForm.item_id || populateForm.custom_item_name.trim() || null)
      : (populateForm.custom_item_name.trim() || null);
    const hasItem = finalItemId || finalCustomName;
    if (!hasItem) return;

    const existing = slots.filter((s) => {
      if (s.id === slotId) return false;
      if (finalItemId && s.item_id === finalItemId) return true;
      if (finalCustomName && s.custom_item_name === finalCustomName) return true;
      return false;
    });
    if (existing.length > 0) {
      alert('This item is already in the loadout.');
      return;
    }

    setSaving(true);
    try {
      await loadoutRepo.updateSlot(id, slotId, {
        item_id: finalItemId,
        custom_item_name: finalCustomName,
        notes: populateForm.notes
      });
      setPopulatingSlotId(null);
      setPopulateForm({ item_id: '', custom_item_name: '', notes: '' });
      refresh();
    } finally {
      setSaving(false);
    }
  };

  // ── Slot CRUD ──

  const handleSlotAcquired = (slotId, acquired) => {
    loadoutRepo.updateSlot(id, slotId, { acquired });
    refresh();
  };

  const handleDeleteSlot = async (slotId) => {
    if (!confirm('Reset this slot? All data and requirements will be cleared.')) return;
    setSaving(true);
    try {
      await loadoutRepo.deleteSlot(id, slotId);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const startEditSlot = (slot) => {
    setEditingSlotId(slot.id);
    setEditNotes(slot.notes || '');
  };

  const saveEditSlot = async () => {
    if (!editingSlotId) return;
    setSaving(true);
    try {
      await loadoutRepo.updateSlot(id, editingSlotId, { notes: editNotes });
      setEditingSlotId(null);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  // ── Requirement CRUD ──

  const toggleReqForm = (slotId) => {
    setReqFormVisible((prev) => ({ ...prev, [slotId]: !prev[slotId] }));
    // Clear warning when opening the form
    if (!reqFormVisible[slotId]) {
      setReqWarning((prev) => ({ ...prev, [slotId]: null }));
    }
    // Reset form when opening (was: only reset if form didn't exist)
    setReqForm((prev) => ({ ...prev, [slotId]: { name: '', wiki_url: '', user_notes: '' } }));
  };

  const handleAddRequirement = async (e, slotId) => {
    e.preventDefault();
    const form = reqForm[slotId];
    if (!form || !form.name.trim()) return;

    setReqWarning((prev) => ({ ...prev, [slotId]: null }));
    setSaving(true);
    try {
      const result = await loadoutRepo.addRequirement(slotId, {
        name: form.name.trim(),
        wiki_url: form.wiki_url.trim() || null,
        user_notes: form.user_notes.trim() || ''
      });

      if (result.error) {
        setReqWarning((prev) => ({ ...prev, [slotId]: result.error }));
        return;
      }

      setReqForm((prev) => ({ ...prev, [slotId]: { name: '', wiki_url: '', user_notes: '' } }));
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleReqAcquired = (slotId, reqId, acquired) => {
    loadoutRepo.updateRequirement(slotId, reqId, { acquired });
    refresh();
  };

  const handleDeleteRequirement = async (slotId, reqId) => {
    if (!confirm('Delete this requirement?')) return;
    setSaving(true);
    try {
      await loadoutRepo.deleteRequirement(slotId, reqId);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (slotId) => {
    setExpandedSlots((prev) => {
      if (!(slotId in prev)) {
        // Not explicitly tracked — default is auto-expanded for populated slots
        // First click should collapse
        return { ...prev, [slotId]: false };
      }
      return { ...prev, [slotId]: !prev[slotId] };
    });
  };

  // ── Helper ──

  const isSlotEmpty = (slot) => !slot.item_id && !slot.custom_item_name;
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
          <textarea
            placeholder="Build notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={2}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '6px 8px',
              borderRadius: 4,
              background: '#161b22',
              color: '#e7e9ee',
              border: '1px solid #2e3440',
              fontSize: 13,
              resize: 'vertical',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn${saving ? ' loading' : ''}`} onClick={handleDeleteLoadout}>Delete Loadout</button>
        </div>
      </div>

      {/* Slots */}
      {slots.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🔧</div>
          <h3>No slots yet</h3>
          <p>Add your first slot to get started building your loadout.</p>
        </div>
      )}

      {slots.map((slot) => {
        const isEmpty = isSlotEmpty(slot);
        const item = slot.item_id ? findItem(slot.item_id) : null;
        const displayName = slot.custom_item_name || (item ? item.name : 'Empty slot');
        const wikiUrl = item ? item.wiki_url : null;
        const reqs = slot.requirements || [];
        const isPopulating = populatingSlotId === slot.id;
        const isExpanded = slot.id in expandedSlots ? !!expandedSlots[slot.id] : (!isEmpty || isPopulating);
        const isEditing = editingSlotId === slot.id;

        // ── Empty slot card ──
        if (isEmpty && !isPopulating) {
          return (
            <div className="card slot-card" key={slot.id} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
                   onClick={() => openPopulate(slot.id)}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${slot.slot_type}`}>{formatSlotType(slot.slot_type)}</span>
                  <span className="muted" style={{ fontStyle: 'italic' }}>Empty slot — click to populate</span>
                </div>
              </div>
            </div>
          );
        }

        // ── Populated or populating slot card ──
        return (
          <div className={`card slot-card${slot.acquired && reqs.every(r => r.acquired) ? ' slot-acquired' : ''}`} key={slot.id}>
            {/* Slot header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge ${slot.slot_type}`}>{formatSlotType(slot.slot_type)}</span>
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
                    <div className="populate-form" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <SearchableSelect
                        value={populateForm.item_id}
                        onChange={(val) => setPopulateForm({ ...populateForm, item_id: val, custom_item_name: '' })}
                        options={getCuratedOptions(slot.slot_type, slots) || (SLOT_TYPE_TO_ITEM_TYPE[slot.slot_type]
                          ? items.filter(it => it.item_type === SLOT_TYPE_TO_ITEM_TYPE[slot.slot_type])
                          : items
                        ).map(it => ({ value: it.id, label: it.name }))}
                        placeholder="Select item..."
                        allowCustom={false}
                        style={{ minWidth: 160 }}
                      />
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
                    <div className="slot-notes-form" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Notes"
                        style={{ minHeight: 40, flex: 1 }}
                      />
                      <button className={`btn primary${saving ? ' loading' : ''}`} onClick={saveEditSlot}>Save</button>
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
                    <button className={`btn primary${saving ? ' loading' : ''}`} onClick={(e) => handlePopulateSlot(e, slot.id)}>Save</button>
                    <button className="btn" onClick={cancelPopulate}>Cancel</button>
                  </>
                ) : (
                  <>
                    {!isEditing && (
                      <button className="btn" onClick={() => startEditSlot(slot)}>Edit</button>
                    )}
                    <button className={`btn${saving ? ' loading' : ''}`} onClick={() => handleDeleteSlot(slot.id)}>
                      {isEmpty ? '—' : 'Delete Slot'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Expand/collapse requirements (only for populated slots) */}
            {!isEmpty && (
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
                  {/* Duplicate requirement warning */}
                  {reqWarning[slot.id] && (
                    <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 8, padding: '6px 10px', background: 'rgba(255,107,107,0.1)', borderRadius: 4, border: '1px solid rgba(255,107,107,0.3)' }}>
                      ⚠ {reqWarning[slot.id]}
                    </div>
                  )}
                  {reqFormVisible[slot.id] ? (
                    <form className="req-form" onSubmit={(e) => handleAddRequirement(e, slot.id)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <RequirementCombobox
                        options={getOptionsForSlot(slot.slot_type)}
                        value={(reqForm[slot.id] || {}).name || ''}
                        onChange={(data) => setReqForm((prev) => ({ ...prev, [slot.id]: { ...prev[slot.id], name: data.name, wiki_url: data.wiki_url } }))}
                        disabledNames={(slot.requirements || []).map(r => r.name)}
                        slotId={slot.id}
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
                      <button className={`btn primary${saving ? ' loading' : ''}`} type="submit">Add</button>
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

export default function LoadoutDetailPage() {
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
        {[1, 2, 3].map((i) => (
          <div className="skeleton-card" key={i}>
            <div className="skeleton-line wide" />
            <div className="skeleton-line medium" />
            <div className="skeleton-line narrow" />
          </div>
        ))}
      </div>
    }>
      <LoadoutDetailInner />
    </Suspense>
  );
}
