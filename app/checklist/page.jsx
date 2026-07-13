'use client';
import React, { useEffect, useState, useCallback } from 'react';
import repo from '../../src/data/checklist-store.ts';

const CADENCES = ['daily', 'weekly', 'biweekly'];

function nextResetUtc(cadence) {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(0, 0, 0, 0);

  if (cadence === 'daily') {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (cadence === 'weekly' || cadence === 'biweekly') {
    const day = now.getUTCDay();
    const daysUntilSunday = (7 - day) % 7 || 7;
    next.setUTCDate(next.getUTCDate() + daysUntilSunday);
    return next;
  }

  return next;
}

function useCountdown(targetDate) {
  const [diff, setDiff] = useState(() => Math.max(0, targetDate - Date.now()));

  useEffect(() => {
    const id = setInterval(() => setDiff(Math.max(0, targetDate - Date.now())), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

function TaskRow({ task, onToggle, onDelete }) {
  const next = nextResetUtc(task.cadence);
  const countdown = useCountdown(next);

  const completed = !!task.last_completed_at;
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <input type="checkbox" checked={completed} onChange={() => onToggle(task)} style={{ width: 18, height: 18 }} />
      <div style={{ flex: 1 }}>
        <div>{task.label}</div>
        <div className="muted" style={{ fontSize: 12 }}>Resets in {countdown}</div>
      </div>
      <button className="btn" onClick={() => onDelete(task.id)}>Delete</button>
    </div>
  );
}

function Checklist() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState({ label: '', cadence: 'daily', category: 'general' });

  const load = async () => {
    try {
      await repo.init();
      setTasks([...repo.tasks]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!newTask.label.trim()) return;
    const ok = await repo.create({
      label: newTask.label.trim(),
      cadence: newTask.cadence,
      category: newTask.category.trim() || 'general',
      sort_order: 0,
    });
    if (ok) {
      setNewTask({ label: '', cadence: newTask.cadence, category: newTask.category });
      load();
    }
  };

  const toggle = async (task) => {
    const next = nextResetUtc(task.cadence);
    const last = task.last_completed_at ? new Date(task.last_completed_at) : null;
    const alreadyDone = last && (next.getTime() - last.getTime()) < 86400000 && Date.now() < next.getTime();
    await repo.update(task.id, { last_completed_at: alreadyDone ? null : new Date().toISOString() });
    load();
  };

  const remove = async (id) => {
    if (!confirm('Delete this task?')) return;
    await repo.remove(id);
    load();
  };

  const grouped = tasks.reduce((acc, task) => {
    acc[task.cadence] = acc[task.cadence] || {};
    acc[task.cadence][task.category] = acc[task.cadence][task.category] || [];
    acc[task.cadence][task.category].push(task);
    return acc;
  }, {});

  if (loading) return <p className="muted">Loading checklist...</p>;
  if (tasks.length === 0) return <p className="muted">No tasks yet. Add your daily/weekly/biweekly chores above.</p>;

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#ffcf6a' }}>Checklist</h1>
      </div>

      <form className="card" onSubmit={create} style={{ marginBottom: 16 }}>
        <h2>Add task</h2>
        <div className="filters">
          <input
            type="text"
            placeholder="Task"
            value={newTask.label}
            onChange={(e) => setNewTask({ ...newTask, label: e.target.value })}
          />
          <input
            type="text"
            placeholder="Category"
            value={newTask.category}
            onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
          />
          <select
            value={newTask.cadence}
            onChange={(e) => setNewTask({ ...newTask, cadence: e.target.value })}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="btn primary" type="submit">Add</button>
        </div>
      </form>

      {CADENCES.map((cadence) => {
        const byCategory = grouped[cadence];
        if (!byCategory) return null;
        const categories = Object.keys(byCategory);
        return (
          <div key={cadence} style={{ marginBottom: 18 }}>
            <h2 style={{ color: '#ffcf6a', textTransform: 'capitalize' }}>{cadence}</h2>
            {categories.map((category) => {
              const items = byCategory[category];
              if (!items || items.length === 0) return null;
              return (
                <div key={category} style={{ marginBottom: 10 }}>
                  <h3 style={{ color: '#b6c2d0', fontSize: 14, textTransform: 'capitalize' }}>{category}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((task) => (
                      <TaskRow key={task.id} task={task} onToggle={toggle} onDelete={remove} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default Checklist;
