// @ts-nocheck
'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import repo from '../../src/data/store.ts';
import SearchableSelect from '../components/searchable-select';

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'blocked'];

function Todos() {
  const [todos, setTodos] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [newForm, setNewForm] = useState({ notes: '', status: 'pending', craftable_item_id: '', linked_material_name: '' });
  const [items, setItems] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      await repo.initTodos();
      await repo.initMaterials();
      const allItems = await repo.getAllItems();
      setItems(allItems);
      setTodos(repo.getTodos());
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadMats() {
      if (newForm.craftable_item_id) {
        const mats = await repo.getMaterialsForItem(newForm.craftable_item_id);
        setMaterials(mats);
        setNewForm((f) => ({ ...f, linked_material_name: '' }));
      } else {
        setMaterials([]);
        setNewForm((f) => ({ ...f, linked_material_name: '' }));
      }
    }
    loadMats();
  }, [newForm.craftable_item_id]);

  const load = () => {
    setTodos(repo.getTodos());
  };

  const startEdit = (todo) => {
    setEditingId(todo.id);
    setNotesDraft(todo.user_notes || '');
    setStatusDraft(todo.status || 'pending');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await repo.updateTodoStatus(editingId, statusDraft);
      await repo.updateTodoNotes(editingId, notesDraft);
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this todo?')) return;
    setSaving(true);
    try {
      await repo.deleteTodo(id);
      load();
    } finally {
      setSaving(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!newForm.notes.trim()) return;
    setSaving(true);
    try {
      await repo.addTodo({
        craftable_item_id: newForm.craftable_item_id || null,
        linked_material_name: newForm.linked_material_name || null,
        user_notes: newForm.notes.trim(),
        status: newForm.status,
        priority: 'medium',
        due_at: null,
      });
      setNewForm({ notes: '', status: 'pending', craftable_item_id: '', linked_material_name: '' });
      load();
    } finally {
      setSaving(false);
    }
  };

  // Resolve item names sync from already-loaded items list (no async needed)
  const findItem = (id) => items.find((it) => it.id === id);

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#ffcf6a' }}>TODOs</h1>
      </div>

      <form className="card" onSubmit={create}>
        <h2>New Todo</h2>
        <div className="filters">
          <input
            type="text"
            placeholder="Notes"
            value={newForm.notes}
            onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
          />
          <SearchableSelect
            value={newForm.craftable_item_id}
            onChange={(val) => setNewForm({ ...newForm, craftable_item_id: val })}
            options={items.map(it => ({ value: it.id, label: it.name }))}
            placeholder="Item (optional)"
            style={{ minWidth: 160 }}
          />
          <SearchableSelect
            value={newForm.linked_material_name}
            onChange={(val) => setNewForm({ ...newForm, linked_material_name: val })}
            options={materials.map(m => ({ value: m.material_name, label: m.material_name }))}
            placeholder="Material (optional)"
            disabled={!newForm.craftable_item_id || materials.length === 0}
            style={{ minWidth: 160 }}
          />
          <select
            value={newForm.status}
            onChange={(e) => setNewForm({ ...newForm, status: e.target.value })}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className={`btn primary${saving ? ' loading' : ''}`} type="submit">Add</button>
        </div>
      </form>

      {loading ? (
        <p className="muted">Loading todos...</p>
      ) : todos.length === 0 && (
        <p className="muted">No todos yet.</p>
      )}

      {todos.map((todo) => {
        const isEditing = editingId === todo.id;
        const item = findItem(todo.craftable_item_id);
        const materialName = todo.linked_material_name;

        return (
          <div className="card" key={todo.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge ${todo.status}`}>{todo.status}</span>
                  {materialName && <span className="badge">{materialName}</span>}
                </div>
                {item && (
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/items/${item.id}`}>{item.name}</Link>
                  </div>
                )}
              </div>
              <div style={{ marginLeft: 12 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button className={`btn primary${saving ? ' loading' : ''}`} onClick={saveEdit}>Save</button>
                    <button className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => startEdit(todo)}>Edit</button>
                    <button className={`btn${saving ? ' loading' : ''}`} onClick={() => handleDelete(todo.id)}>Delete</button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              {isEditing ? (
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Notes"
                />
              ) : (
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {todo.user_notes || <span className="muted">No notes</span>}
                </p>
              )}
            </div>

            {materialName && (
              <div style={{ marginTop: 8 }}>
                <Link href={`/sources?material=${encodeURIComponent(materialName)}`}>
                  Source: {materialName}
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default Todos;
