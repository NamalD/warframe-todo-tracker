// @ts-nocheck
/**
 * Server-only: fetch live Warframe worldstate from warframestat.us, cache it
 * in-process (60s TTL, single in-flight fetch), and return the compact
 * UI-shaped payload produced by extractWorldState().
 *
 * The app runs as a long-lived Node process (Docker), so a module-scoped cache
 * persists across requests and shields the upstream API from per-visitor load.
 * On upstream failure we serve the last good payload with { stale: true }.
 *
 * This module is server-only — never import in client components.
 */
import 'server-only';
import { extractWorldState } from './worldstate-transform';

const SOURCE_URL = process.env.WORLDSTATE_URL || 'https://api.warframestat.us/pc?language=en';
const TTL_MS = Number(process.env.WORLDSTATE_TTL_MS) || 60_000;
// warframestat.us 403s default fetchers — send a descriptive UA.
const USER_AGENT = 'warframe-todo-tracker (+https://warframe.namal.dev)';

let cache = { data: null, fetchedAt: 0 };
let inflight = null;

async function fetchFresh() {
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`upstream responded ${res.status}`);
  const raw = await res.json();
  const data = extractWorldState(raw);
  cache = { data, fetchedAt: Date.now() };
  return data;
}

function envelope(data, stale, error) {
  return {
    ...data,
    fetchedAt: new Date(cache.fetchedAt).toISOString(),
    stale: Boolean(stale),
    ...(error ? { error } : {}),
  };
}

/**
 * Returns the compact worldstate payload, refetching when the cache is older
 * than TTL_MS. Concurrent misses share one in-flight upstream request.
 */
export async function getWorldState() {
  if (cache.data && Date.now() - cache.fetchedAt < TTL_MS) {
    return envelope(cache.data, false);
  }
  try {
    if (!inflight) {
      inflight = fetchFresh().finally(() => {
        inflight = null;
      });
    }
    const data = await inflight;
    return envelope(data, false);
  } catch (err) {
    // Degrade gracefully: serve the last good payload if we have one.
    if (cache.data) {
      return envelope(cache.data, true, String(err?.message || err));
    }
    throw err;
  }
}
