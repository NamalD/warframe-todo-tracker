import { getDb } from '../../../src/data/database';
import { getAllBuilds, createBuild, updateBuild, deleteBuild } from '../../../src/data/sqlite-builds';

export async function GET() {
  try {
    const db = getDb();
    const builds = getAllBuilds(db);
    const parsed = builds.map((b) => ({
      id: b.id,
      ...JSON.parse(b.data),
      version: b.version,
      created_at: b.created_at,
      updated_at: b.updated_at,
    }));
    return Response.json(parsed);
  } catch (err) {
    console.error('[api/builds GET]', err);
    return Response.json({ error: 'Failed to read builds' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { id, data } = await request.json();
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    const db = getDb();
    const result = createBuild(db, id, data);
    return Response.json({ ok: true, build: result });
  } catch (err) {
    console.error('[api/builds POST]', err);
    return Response.json({ error: 'Failed to create build' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { id, data, clientVersion } = await request.json();
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    const db = getDb();
    const result = updateBuild(db, id, data, clientVersion || 0);
    if (result.conflict) {
      return Response.json({ conflict: true, server: result.server }, { status: 409 });
    }
    return Response.json({ ok: true, build: result });
  } catch (err) {
    console.error('[api/builds PATCH]', err);
    return Response.json({ error: 'Failed to update build' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });
    const db = getDb();
    deleteBuild(db, id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/builds DELETE]', err);
    return Response.json({ error: 'Failed to delete build' }, { status: 500 });
  }
}
