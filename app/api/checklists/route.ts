// @ts-nocheck
import { getDb } from '../../../src/data/database';
import { getAllChecklistTasks, mergeNewChecklistTasks } from '../../../src/data/sqlite-checklists';

export async function GET() {
  try {
    const db = getDb();
    let data = getAllChecklistTasks(db);
    if (!data.length) {
      const now = new Date().toISOString();
      mergeNewChecklistTasks(db, [
        { id: 'cl-daily-login', cadence: 'daily', category: 'general', label: 'Daily login', sort_order: 0, created_at: now, updated_at: now },
        { id: 'cl-daily-sortie', cadence: 'daily', category: 'general', label: 'Sortie', sort_order: 1, created_at: now, updated_at: now },
        { id: 'cl-weekly-nightwave', cadence: 'weekly', category: 'general', label: 'Nightwave weekly missions', sort_order: 0, created_at: now, updated_at: now },
        { id: 'cl-weekly-clem', cadence: 'weekly', category: 'general', label: 'Help Clem', sort_order: 1, created_at: now, updated_at: now },
        { id: 'cl-biweekly-baro', cadence: 'biweekly', category: 'general', label: 'Baro Ki\'Teer check', sort_order: 0, created_at: now, updated_at: now },
      ]);
      data = getAllChecklistTasks(db);
    }
    return Response.json({ data });
  } catch (err) {
    console.error(`[api/checklists GET] ${err.message}`);
    return Response.json({ error: 'Failed to read checklists' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Expected a checklist task object in body' }, { status: 400 });
    }
    const db = getDb();
    const record = createChecklistTask(db, body);
    return Response.json(record, { status: 201 });
  } catch (err) {
    console.error(`[api/checklists POST] ${err.message}`);
    return Response.json({ error: 'Failed to create checklist task' }, { status: 500 });
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
      return Response.json({ error: 'Expected data to be an array of checklist tasks' }, { status: 400 });
    }
    const db = getDb();
    mergeNewChecklistTasks(db, data);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/checklists PUT] ${err.message}`);
    return Response.json({ error: 'Failed to write checklists' }, { status: 500 });
  }
}
