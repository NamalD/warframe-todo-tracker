import { getDb } from '../../../src/data/database.js';
import { getAllTodos, replaceAllTodos } from '../../../src/data/sqlite-todos.js';

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
    replaceAllTodos(db, data);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/todos PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write todos' }, { status: 500 });
  }
}
