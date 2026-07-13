/**
 * SQLite CRUD module for the checklist_tasks table.
 *
 * This module is server-only — never import in client components.
 */
import 'server-only';
import type { Database } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Allowed cadences
// ---------------------------------------------------------------------------

const VALID_CADENCES = ['daily', 'weekly', 'biweekly'] as const;

type ChecklistCadence = typeof VALID_CADENCES[number];

interface ChecklistTaskRow {
  id: string;
  cadence: string;
  category: string;
  label: string;
  sort_order: number;
  last_completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ChecklistTaskInput {
  id?: string;
  cadence?: ChecklistCadence | string;
  category?: string;
  label?: string;
  sort_order?: number;
  last_completed_at?: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAllChecklistTasks(db: Database): ChecklistTaskRow[] {
  return db.prepare(
    `SELECT id, cadence, category, label, sort_order, last_completed_at, version, created_at, updated_at
     FROM checklist_tasks
     ORDER BY cadence, sort_order, created_at`
  ).all() as ChecklistTaskRow[];
}

export function getChecklistTaskById(db: Database, id: string): ChecklistTaskRow | null {
  const row = db.prepare(
    `SELECT id, cadence, category, label, sort_order, last_completed_at, version, created_at, updated_at
     FROM checklist_tasks WHERE id = ?`
  ).get(id) as ChecklistTaskRow | undefined;

  return row || null;
}

export function createChecklistTask(db: Database, task: ChecklistTaskInput): ChecklistTaskRow {
  const taskId = task.id || crypto.randomUUID();
  const now = new Date().toISOString();

  const cadence = task.cadence || 'daily';
  if (!VALID_CADENCES.includes(cadence as ChecklistCadence)) {
    throw new Error(`Invalid cadence "${cadence}". Must be one of: ${VALID_CADENCES.join(', ')}`);
  }

  db.prepare(
    `INSERT INTO checklist_tasks
       (id, cadence, category, label, sort_order, last_completed_at, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    taskId,
    cadence,
    (task.category || '').trim(),
    (task.label || '').trim(),
    task.sort_order ?? 0,
    task.last_completed_at ?? null,
    now,
    now,
  );

  return {
    id: taskId,
    cadence,
    category: (task.category || '').trim(),
    label: (task.label || '').trim(),
    sort_order: task.sort_order ?? 0,
    last_completed_at: task.last_completed_at ?? null,
    version: 1,
    created_at: now,
    updated_at: now,
  };
}

export function updateChecklistTask(
  db: Database,
  id: string,
  updates: Record<string, unknown>
): ChecklistTaskRow {
  const row = db.prepare(
    `SELECT id, cadence, category, label, sort_order, last_completed_at, version, created_at, updated_at
     FROM checklist_tasks WHERE id = ?`
  ).get(id) as ChecklistTaskRow | undefined;

  if (!row) {
    throw new Error(`Checklist task not found: ${id}`);
  }

  const allowedFields = ['cadence', 'category', 'label', 'sort_order', 'last_completed_at'];
  const validEnumFields: Record<string, readonly string[]> = {
    cadence: VALID_CADENCES,
  };

  const now = new Date().toISOString();
  const setters: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      const value = (updates as Record<string, unknown>)[field];

      if (validEnumFields[field] && value !== null && typeof value === 'string') {
        if (!validEnumFields[field].includes(value as ChecklistCadence)) {
          throw new Error(`Invalid ${field} "${value}". Must be one of: ${validEnumFields[field].join(', ')}`);
        }
      }

      setters.push(`${field} = ?`);
      params.push(value);
    }
  }

  if (setters.length === 1) {
    return row;
  }

  params.push(id);
  db.prepare(`UPDATE checklist_tasks SET ${setters.join(', ')} WHERE id = ?`).run(...params);

  return db.prepare(
    `SELECT id, cadence, category, label, sort_order, last_completed_at, version, created_at, updated_at
     FROM checklist_tasks WHERE id = ?`
  ).get(id) as ChecklistTaskRow;
}

export function deleteChecklistTask(db: Database, id: string): { success: true } | { notFound: true } {
  const row = db.prepare('SELECT id FROM checklist_tasks WHERE id = ?').get(id) as { id: string } | undefined;
  if (!row) {
    return { notFound: true };
  }

  db.prepare('DELETE FROM checklist_tasks WHERE id = ?').run(id);
  return { success: true };
}

export function mergeNewChecklistTasks(db: Database, tasks: ChecklistTaskInput[]): void {
  for (const item of tasks) {
    if (!item.id) {
      throw new Error(`mergeNewChecklistTasks: every item must have an id (missing in: ${JSON.stringify(item)})`);
    }
  }

  const now = new Date().toISOString();

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO checklist_tasks
       (id, cadence, category, label, sort_order, last_completed_at, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  const operation = db.transaction((items: ChecklistTaskInput[]) => {
    for (const item of items) {
      stmt.run(
        item.id,
        item.cadence || 'daily',
        (item.category || '').trim(),
        (item.label || '').trim(),
        item.sort_order ?? 0,
        item.last_completed_at ?? null,
        now,
        now,
      );
    }
  });

  operation(tasks);
}
