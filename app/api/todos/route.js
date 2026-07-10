import { getDb } from '../../../src/data/database';
import { getAllTodos, mergeNewTodos, createTodo } from '../../../src/data/sqlite-todos';

export async function GET() {
  try {
    const db = getDb();
    const data = getAllTodos(db);
    return Response.json({ data });
  } catch (err) {
    console.error(`[api/todos GET] ${err.message}`);
    return Response.json({ error: 'Failed to read todos' }, { status: 500 });
  }
}

/**
 * POST /api/todos
 * Create a new todo.
 *
 * Body: { craftable_item_id?, linked_material_name?, user_notes?, status?, priority?, due_at?, [id] }
 * Returns the created todo with version=1.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Expected a todo object in body' }, { status: 400 });
    }
    const db = getDb();
    const record = createTodo(db, body);
    return Response.json(record, { status: 201 });
  } catch (err) {
    console.error(`[api/todos POST] ${err.message}`);
    return Response.json({ error: 'Failed to create todo' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || !('data' in body) || !('version' in body)) {
      return Response.json(
        { error: 'Expected { data, version } object' },
        { status: 400 },
      );
    }
    const { data } = body;
    if (!Array.isArray(data)) {
      return Response.json({ error: 'Expected data to be an array of todos' }, { status: 400 });
    }
    const db = getDb();
    // Merge (insert-if-new), never a destructive replace — see #14: a
    // device's bulk push must not erase todos created on other devices.
    // Edits to existing todos go through PATCH /api/todos/[id].
    mergeNewTodos(db, data);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/todos PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write todos' }, { status: 500 });
  }
}
