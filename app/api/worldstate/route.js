import { getWorldState } from '../../../src/data/worldstate';

// Always run at request time; the module-level cache in getWorldState() owns the TTL.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getWorldState();
    return Response.json(data);
  } catch (err) {
    console.error(`[api/worldstate GET] ${err.message}`);
    return Response.json({ error: 'Failed to fetch world state' }, { status: 503 });
  }
}
