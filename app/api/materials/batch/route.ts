// @ts-nocheck
import { getDb } from '../../../../src/data/database';
import { batchUpsert } from '../../../../src/data/sqlite-materials';

/**
 * PATCH /api/materials/batch
 * Batch upsert multiple materials in a single transaction.
 *
 * Body: { entries: Array<{ material_name: string, quantity: number }> }
 * Returns { ok: true, processed: [...material_names] } on success.
 */
export async function PATCH(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || !Array.isArray(body.entries)) {
      return Response.json(
        { error: 'Expected { entries: [{ material_name, quantity }, ...] }' },
        { status: 400 },
      );
    }
    if (body.entries.length === 0) {
      return Response.json({ ok: true, processed: [] });
    }
    for (const entry of body.entries) {
      if (!entry.material_name || typeof entry.quantity !== 'number' || entry.quantity < 0) {
        return Response.json(
          { error: `Invalid entry: ${JSON.stringify(entry)}. Each entry needs material_name and quantity >= 0.` },
          { status: 400 },
        );
      }
    }
    const db = getDb();
    const results = batchUpsert(db, body.entries);
    return Response.json({ ok: true, processed: results.map(r => r.material_name) });
  } catch (err) {
    console.error(`[api/materials/batch PATCH] ${err.message}`);
    return Response.json({ error: 'Failed to batch upsert materials' }, { status: 500 });
  }
}
