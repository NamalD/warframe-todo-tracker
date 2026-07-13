import { getDb } from '../../../../src/data/database';
import { getChecklistTaskById, updateChecklistTask, deleteChecklistTask } from '../../../../src/data/sqlite-checklists';

export async function PATCH(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return Response.json({ error: 'Missing checklist task id' }, { status: 400 });
    }
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
    }
    const db = getDb();
    const updated = updateChecklistTask(db, id, body);
    return Response.json(updated);
  } catch (err) {
    console.error(`[api/checklists PATCH] ${err.message}`);
    return Response.json({ error: 'Failed to update checklist task' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return Response.json({ error: 'Missing checklist task id' }, { status: 400 });
    }
    const db = getDb();
    const result = deleteChecklistTask(db, id);
    if ('notFound' in result) {
      return Response.json({ error: 'Checklist task not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/checklists DELETE] ${err.message}`);
    return Response.json({ error: 'Failed to delete checklist task' }, { status: 500 });
  }
}
