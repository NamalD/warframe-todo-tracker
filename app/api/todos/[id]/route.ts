// @ts-nocheck
import { getDb } from '../../../../src/data/database';
import { getTodoById, updateTodo, deleteTodo } from '../../../../src/data/sqlite-todos';

/**
 * GET /api/todos/[id]
 * Returns a single todo by ID, or 404 if not found.
 */
export async function GET(_request, { params }) {
  try {
    const { id } = params;
    const db = getDb();
    const record = getTodoById(db, id);
    if (!record) {
      return Response.json({ error: 'Todo not found' }, { status: 404 });
    }
    return Response.json(record);
  } catch (err) {
    console.error(`[api/todos/[id] GET] ${err.message}`);
    return Response.json({ error: 'Failed to read todo' }, { status: 500 });
  }
}

/**
 * PATCH /api/todos/[id]
 * Update a todo with version-based conflict detection.
 *
 * Body: { updates: {...}, clientVersion: <number> }
 * Returns the updated todo on success, 409 on conflict, 404 if not found.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();

    if (!body || typeof body !== 'object' || !('updates' in body) || !('clientVersion' in body)) {
      return Response.json(
        { error: 'Expected { updates, clientVersion } object' },
        { status: 400 },
      );
    }

    const db = getDb();

    // Check if record exists
    const existing = getTodoById(db, id);
    if (!existing) {
      return Response.json({ error: 'Todo not found' }, { status: 404 });
    }

    const result = updateTodo(db, id, body.updates, body.clientVersion);

    if (result && result.conflict) {
      return Response.json(
        {
          conflict: true,
          record_id: id,
          server_version: result.serverVersion,
          server_data: result.serverData,
        },
        { status: 409 },
      );
    }

    return Response.json(result);
  } catch (err) {
    console.error(`[api/todos/[id] PATCH] ${err.message}`);
    return Response.json({ error: 'Failed to update todo' }, { status: 500 });
  }
}

/**
 * DELETE /api/todos/[id]
 * Delete a todo with version-based conflict detection.
 *
 * Body: { clientVersion: <number> }
 * Returns { ok: true } on success, 409 on conflict, 404 if not found.
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();

    if (!body || typeof body !== 'object' || !('clientVersion' in body)) {
      return Response.json(
        { error: 'Expected { clientVersion } object' },
        { status: 400 },
      );
    }

    const db = getDb();

    const result = deleteTodo(db, id, body.clientVersion);

    if (result.notFound) {
      return Response.json({ error: 'Todo not found' }, { status: 404 });
    }

    if (result.conflict) {
      return Response.json(
        {
          conflict: true,
          record_id: id,
          server_version: result.serverVersion,
          server_data: result.serverData,
        },
        { status: 409 },
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/todos/[id] DELETE] ${err.message}`);
    return Response.json({ error: 'Failed to delete todo' }, { status: 500 });
  }
}
