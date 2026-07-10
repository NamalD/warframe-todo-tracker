/**
 * SQLite CRUD module for the todos table.
 *
 * Todos are flat objects with normalized columns — no JSON blob needed.
 *
 * This module is server-only — never import in client components.
 */
import 'server-only';
import type { Database } from 'better-sqlite3';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Allowed statuses and priorities — enforced on create
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'abandoned', 'blocked'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;

type TodoStatus = typeof VALID_STATUSES[number];
type TodoPriority = typeof VALID_PRIORITIES[number];

interface TodoRow {
  id: string;
  craftable_item_id: string | null;
  linked_material_name: string | null;
  user_notes: string;
  status: string;
  priority: string;
  due_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface TodoInput {
  id?: string;
  craftable_item_id?: string | null;
  linked_material_name?: string | null;
  user_notes?: string;
  status?: string;
  priority?: string;
  due_at?: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAllTodos(db: Database): TodoRow[] {
  return db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos ORDER BY created_at`
  ).all() as TodoRow[];
}

export function getTodoById(db: Database, id: string): TodoRow | null {
  return db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos WHERE id = ?`
  ).get(id) as TodoRow | undefined || null;
}

export function createTodo(db: Database, todo: TodoInput): TodoRow {
  const todoId = todo.id || crypto.randomUUID();
  const now = new Date().toISOString();

  const status = todo.status || 'pending';
  const priority = todo.priority || 'medium';

  if (!VALID_STATUSES.includes(status as TodoStatus)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (!VALID_PRIORITIES.includes(priority as TodoPriority)) {
    throw new Error(`Invalid priority "${priority}". Must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  db.prepare(
    `INSERT INTO todos (id, craftable_item_id, linked_material_name, user_notes,
                        status, priority, due_at, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    todoId,
    todo.craftable_item_id || null,
    todo.linked_material_name || null,
    todo.user_notes || '',
    status,
    priority,
    todo.due_at || null,
    now,
    now,
  );

  return {
    id: todoId,
    craftable_item_id: todo.craftable_item_id || null,
    linked_material_name: todo.linked_material_name || null,
    user_notes: todo.user_notes || '',
    status,
    priority,
    due_at: todo.due_at || null,
    version: 1,
    created_at: now,
    updated_at: now,
  };
}

export function updateTodo(
  db: Database,
  id: string,
  updates: Record<string, unknown>,
  clientVersion: number
): TodoRow | { conflict: true; serverVersion: number; serverData: TodoRow; serverId: string } {
  const row = db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos WHERE id = ?`
  ).get(id) as TodoRow | undefined;

  if (!row) {
    throw new Error(`Todo not found: ${id}`);
  }

  const serverVersion = row.version;

  if (clientVersion < serverVersion) {
    db.prepare('INSERT INTO conflict_log (table_name, record_id, client_version, server_version, device_id) VALUES (?, ?, ?, ?, ?)').run(
      'todos', id, clientVersion, serverVersion, 'unknown'
    );
    return {
      conflict: true,
      serverVersion,
      serverData: {
        id: row.id,
        craftable_item_id: row.craftable_item_id,
        linked_material_name: row.linked_material_name,
        user_notes: row.user_notes,
        status: row.status,
        priority: row.priority,
        due_at: row.due_at,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      serverId: row.id,
    };
  }

  const now = new Date().toISOString();
  const setters: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  const allowedFields = ['user_notes', 'status', 'priority', 'due_at', 'craftable_item_id', 'linked_material_name'];
  const validEnumFields: Record<string, readonly string[]> = { status: VALID_STATUSES, priority: VALID_PRIORITIES };

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      const value = updates[field];

      if (validEnumFields[field] && value !== null && typeof value === 'string') {
        if (!validEnumFields[field].includes(value)) {
          throw new Error(`Invalid ${field} "${value}". Must be one of: ${validEnumFields[field].join(', ')}`);
        }
      }

      setters.push(`${field} = ?`);
      params.push(value);
    }
  }

  const setId = `${id}`;
  params.push(setId);

  db.prepare(
    `UPDATE todos
     SET ${setters.join(', ')}, version = version + 1
     WHERE id = ?`
  ).run(...params);

  const updatedRow = db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos WHERE id = ?`
  ).get(id) as TodoRow;

  return updatedRow;
}

export function deleteTodo(
  db: Database,
  id: string,
  clientVersion: number
): { success: true } | { conflict: true; serverVersion: number; serverData: TodoRow; serverId: string } | { notFound: true } {
  const row = db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos WHERE id = ?`
  ).get(id) as TodoRow | undefined;

  if (!row) {
    return { notFound: true };
  }

  const serverVersion = row.version;

  if (clientVersion < serverVersion) {
    db.prepare('INSERT INTO conflict_log (table_name, record_id, client_version, server_version, device_id) VALUES (?, ?, ?, ?, ?)').run(
      'todos', id, clientVersion, serverVersion, 'unknown'
    );
    return {
      conflict: true,
      serverVersion,
      serverData: {
        id: row.id,
        craftable_item_id: row.craftable_item_id,
        linked_material_name: row.linked_material_name,
        user_notes: row.user_notes,
        status: row.status,
        priority: row.priority,
        due_at: row.due_at,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      serverId: row.id,
    };
  }

  db.prepare('DELETE FROM todos WHERE id = ?').run(id);

  return { success: true };
}

export function mergeNewTodos(db: Database, todos: TodoInput[]): void {
  for (const item of todos) {
    if (!item.id) {
      throw new Error(`mergeNewTodos: every item must have an id (missing in: ${JSON.stringify(item)})`);
    }
  }

  const now = new Date().toISOString();

  const operation = db.transaction((items: TodoInput[]) => {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO todos (id, craftable_item_id, linked_material_name, user_notes,
                          status, priority, due_at, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    );

    for (const item of items) {
      stmt.run(
        item.id,
        item.craftable_item_id || null,
        item.linked_material_name || null,
        item.user_notes || '',
        item.status || 'pending',
        item.priority || 'medium',
        item.due_at || null,
        now,
        now,
      );
    }
  });

  operation(todos);
}
