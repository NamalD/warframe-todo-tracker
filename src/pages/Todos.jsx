import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import repo from '../data/store.js';

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'blocked'];

function Todos() {
  const [todos, setTodos] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [newForm, setNewForm] = useState({ notes: '', status: 'pending' });

  const load = () => {
    setTodos(repo.getTodos());
  };

  useEffect(() => {
    load();
  }, []);

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

  const create = (e) => {
    e.preventDefault();
    if (!newForm.notes.trim()) return;
    repo.addTodo({
      craftable_item_id: null,
      linked_material_name: null,
      user_notes: newForm.notes.trim(),
      status: newForm.status,
      priority: 'medium',
      due_at: null,
    });
    setNewForm({ notes: '', status: 'pending' });
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

      {todos.length === 0 && <p className="muted">No todos yet.</p>}

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
                    <Link to={`/items/${item.id}`}>{item.name}</Link>
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
                  <button className="btn" onClick={() => startEdit(todo)}>Edit</button>
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
                <Link to={`/sources`} state={{ material: materialName }}>
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
