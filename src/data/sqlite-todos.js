/**
 * SQLite CRUD module for the todos table.
 *
 * Todos are flat objects with normalized columns — no JSON blob needed.
 * All functions accept a better-sqlite3 Database instance as their first argument.
 *
 * This module is server-only — never import in client components.
 */
import 'server-only';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Allowed statuses and priorities — enforced on create
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'abandoned'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all todos from the database.
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<object>} Array of todo objects
 */
export function getAllTodos(db) {
  return db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos ORDER BY created_at`
  ).all();
}

/**
 * Get a single todo by its ID.
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @returns {object|null} Todo object, or null
 */
export function getTodoById(db, id) {
  return db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos WHERE id = ?`
  ).get(id) || null;
}

/**
 * Create a new todo.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} todo
 * @param {string} [todo.id] - Optional explicit ID; auto-generated if omitted
 * @param {string} [todo.craftable_item_id] - Craftable item being tracked
 * @param {string} [todo.linked_material_name] - Material name this todo relates to
 * @param {string} [todo.user_notes] - Free-form notes (default '')
 * @param {string} [todo.status] - Status enum (default 'pending')
 * @param {string} [todo.priority] - Priority enum (default 'medium')
 * @param {string} [todo.due_at] - ISO 8601 due date string, or null
 * @returns {object} The created todo with version=1 and timestamps
 * @throws {Error} If status or priority is not a valid enum value
 */
export function createTodo(db, todo) {
  const todoId = todo.id || crypto.randomUUID();
  const now = new Date().toISOString();

  const status = todo.status || 'pending';
  const priority = todo.priority || 'medium';

  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (!VALID_PRIORITIES.includes(priority)) {
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

/**
 * Update a todo with optimistic concurrency control.
 *
 * If `clientVersion >= serverVersion` the update succeeds, the row's version
 * is incremented by 1, and the full updated record is returned.
 *
 * If the todo has been modified by another client (`clientVersion <
 * serverVersion`), returns a conflict object with the current server state.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @param {object} updates - Fields to update. At least one of: user_notes,
 *   status, priority, due_at, craftable_item_id, linked_material_name.
 * @param {number} clientVersion - The version the client last saw
 * @returns {object} Updated todo, or `{ conflict, serverVersion, serverData, serverId }`
 * @throws {Error} If the ID does not exist
 */
export function updateTodo(db, id, updates, clientVersion) {
  // First, fetch the current row
  const row = db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos WHERE id = ?`
  ).get(id);

  if (!row) {
    throw new Error(`Todo not found: ${id}`);
  }

  const serverVersion = row.version;

  // Conflict: client is working from a stale base
  if (clientVersion < serverVersion) {
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

  // Build the UPDATE SET clause dynamically from provided fields
  const now = new Date().toISOString();
  const setters = ['updated_at = ?'];
  const params = [now];

  const allowedFields = ['user_notes', 'status', 'priority', 'due_at', 'craftable_item_id', 'linked_material_name'];
  const validEnumFields = { status: VALID_STATUSES, priority: VALID_PRIORITIES };

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      const value = updates[field];

      // Validate enums if this field is an enum
      if (validEnumFields[field] && value !== null) {
        if (!validEnumFields[field].includes(value)) {
          throw new Error(`Invalid ${field} "${value}". Must be one of: ${validEnumFields[field].join(', ')}`);
        }
      }

      setters.push(`${field} = ?`);
      params.push(value);
    }
  }

  const setId = `${id}`; // ensure string
  params.push(setId);

  db.prepare(
    `UPDATE todos
     SET ${setters.join(', ')}, version = version + 1
     WHERE id = ?`
  ).run(...params);

  // Return the updated record
  const updatedRow = db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos WHERE id = ?`
  ).get(id);

  return updatedRow;
}

/**
 * Delete a todo with optimistic concurrency control.
 *
 * If `clientVersion >= serverVersion` the delete succeeds.
 * If the todo has been modified by another client, returns a conflict.
 * If the ID does not exist, returns `{ notFound: true }`.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @param {number} clientVersion - The version the client last saw
 * @returns {object} `{ success: true }`, or `{ conflict, serverVersion, serverData, serverId }`,
 *   or `{ notFound: true }`
 */
export function deleteTodo(db, id, clientVersion) {
  const row = db.prepare(
    `SELECT id, craftable_item_id, linked_material_name, user_notes,
            status, priority, due_at, version, created_at, updated_at
     FROM todos WHERE id = ?`
  ).get(id);

  if (!row) {
    return { notFound: true };
  }

  const serverVersion = row.version;

  // Conflict: client is working from a stale base
  if (clientVersion < serverVersion) {
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

  // Delete: clientVersion >= serverVersion
  db.prepare('DELETE FROM todos WHERE id = ?').run(id);

  return { success: true };
}

/**
 * Merge a client's local todo list into the server, additively.
 *
 * This used to be a destructive `DELETE FROM todos` + reinsert (see #14):
 * any device pushing its own local list would wipe out every todo created
 * on other devices that this device hadn't seen yet. Instead, this only
 * inserts todos the server doesn't already have (`INSERT OR IGNORE`) —
 * existing rows are left untouched. Real edits to an existing todo must go
 * through `updateTodo()`'s version-checked path (see `PATCH
 * /api/todos/[id]`), and deletes through `deleteTodo()` (see `DELETE
 * /api/todos/[id]`) — this bulk path cannot safely infer either from a
 * client's local list alone.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{ id: string, craftable_item_id?: string, linked_material_name?: string,
 *   user_notes?: string, status?: string, priority?: string, due_at?: string }>} todos
 */
export function mergeNewTodos(db, todos) {
  // Validate that every item has an id — SQLite allows NULL in TEXT PK,
  // which would silently break the insert contract
  for (const item of todos) {
    if (!item.id) {
      throw new Error(`mergeNewTodos: every item must have an id (missing in: ${JSON.stringify(item)})`);
    }
  }

  const now = new Date().toISOString();

  const operation = db.transaction((items) => {
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
