// ---------------------------------------------------------------------------
// PATCH /api/user-items — update per-item flags (tracked, Incarnon)
// GET /api/user-items — fetch all per-item flags
// ---------------------------------------------------------------------------
import { NextResponse } from 'next/server';
import { getDb } from '../../../src/data/database';
import { getAllUserItemData, upsertUserItemData } from '../../../src/data/sqlite-user-items';

export async function GET() {
  try {
    const db = getDb();
    const data = getAllUserItemData(db);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('Failed to fetch user item data:', err);
    return new NextResponse(null, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { item_id, fields, clientVersion } = await request.json();
    if (!item_id || !fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'item_id and fields are required' }, { status: 400 });
    }

    const db = getDb();
    const result = upsertUserItemData(db, item_id, fields, clientVersion || 0);

    if (result.conflict) {
      return NextResponse.json({ conflict: true, server: result.server }, { status: 409 });
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('Failed to update user item data:', err);
    return new NextResponse(null, { status: 500 });
  }
}
