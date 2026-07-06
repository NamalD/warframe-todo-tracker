'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import repo from '../../src/data/store.js';

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

  useEffect(() => {
    setItems(repo.getAllItems());
    setTodos(repo.getTodos());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (newForm.craftable_item_id) {
      setMaterials(repo.getMaterialsForItem(newForm.craftable_item_id));
      setNewForm((f) => ({ ...f, linked_material_name: '' }));
    } else {
      setMaterials([]);
      setNewForm((f) => ({ ...f, linked_material_name: '' }));
    }
  }, [newForm.craftable_item_id]);

  const load = () => {
    setTodos(repo.getTodos());
  };

  const startEdit = (todo) => {
    setEditingId(todo.id);
    setNotesDraft(todo.user_notes || '');
    setStatusDraft(todo.status || 'pending');
  };

  const saveEdit = () => {
    if (!editingId) return;
    repo.updateTodoStatus(editingId, statusDraft);
    repo.updateTodoNotes(editingId, notesDraft);
    setEditingId(null);
    load();
  };

  const handleDelete = (id) => {
    if (!confirm('Delete this todo?')) return;
    repo.deleteTodo(id);
    load();
  };

  const create = (e) => {
    e.preventDefault();
    if (!newForm.notes.trim()) return;
    repo.addTodo({
      craftable_item_id: newForm.craftable_item_id || null,
      linked_material_name: newForm.linked_material_name || null,
      user_notes: newForm.notes.trim(),
      status: newForm.status,
      priority: 'medium',
      due_at: null,
    });
    setNewForm({ notes: '', status: 'pending', craftable_item_id: '', linked_material_name: '' });
    load();
  };

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
          <select
            value={newForm.craftable_item_id}
            onChange={(e) => setNewForm({ ...newForm, craftable_item_id: e.target.value })}
          >
            <option value="">Item (optional)</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </select>
          <select
            value={newForm.linked_material_name}
            onChange={(e) => setNewForm({ ...newForm, linked_material_name: e.target.value })}
            disabled={!newForm.craftable_item_id || materials.length === 0}
          >
            <option value="">Material (optional)</option>
            {materials.map((m) => (
              <option key={m.material_name} value={m.material_name}>
                {m.material_name}
              </option>
            ))}
          </select>
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
          <button className="btn primary" type="submit">Add</button>
        </div>
      </form>

      {loading ? (
        <p className="muted">Loading todos...</p>
      ) : todos.length === 0 && (
        <p className="muted">No todos yet.</p>
      )}

      {todos.map((todo) => {
        const isEditing = editingId === todo.id;
        const item = repo.getItemById(todo.craftable_item_id);
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
                    <button className="btn primary" onClick={saveEdit}>Save</button>
                    <button className="btn" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => startEdit(todo)}>Edit</button>
                    <button className="btn" onClick={() => handleDelete(todo.id)}>Delete</button>
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
