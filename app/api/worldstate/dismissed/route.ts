// @ts-nocheck
import { getDb } from '../../../../src/data/database';
import { getDismissedEvents, dismissEvent } from '../../../../src/data/sqlite-worldstate-dismissals';

export async function GET() {
  try {
    const db = getDb();
    const data = getDismissedEvents(db);
    return Response.json({ data });
  } catch (err) {
    console.error(`[api/worldstate/dismissed GET] ${err.message}`);
    return Response.json({ error: 'Failed to read dismissed world state events' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body.event_id !== 'string' || !body.event_id) {
      return Response.json({ error: 'event_id is required' }, { status: 400 });
    }
    const db = getDb();
    const record = dismissEvent(db, body.event_id, body.expiry ?? null);
    return Response.json(record, { status: 201 });
  } catch (err) {
    console.error(`[api/worldstate/dismissed POST] ${err.message}`);
    return Response.json({ error: 'Failed to dismiss world state event' }, { status: 500 });
  }
}
