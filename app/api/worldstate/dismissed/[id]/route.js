import { getDb } from '../../../../../src/data/database';
import { undismissEvent } from '../../../../../src/data/sqlite-worldstate-dismissals';

export async function DELETE(request, { params }) {
  try {
    const id = params?.id;
    if (!id) {
      return Response.json({ error: 'Missing event id' }, { status: 400 });
    }
    const db = getDb();
    const result = undismissEvent(db, id);
    if ('notFound' in result) {
      return Response.json({ error: 'Dismissed event not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[api/worldstate/dismissed DELETE] ${err.message}`);
    return Response.json({ error: 'Failed to unhide world state event' }, { status: 500 });
  }
}
