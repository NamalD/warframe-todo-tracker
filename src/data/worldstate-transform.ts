// @ts-nocheck
/**
 * Pure transform: raw warframestat.us `/pc` worldstate -> compact, UI-shaped
 * payload. No network, no server-only deps — safe to import in unit tests.
 *
 * Total and defensive: any missing or oddly-shaped upstream section yields
 * null/[] instead of throwing, so a partial upstream outage degrades
 * per-section rather than taking down the whole dashboard.
 *
 * Field names verified against a live `/pc` sample (2026-07-12).
 */

function str(v) {
  return typeof v === 'string' && v.length ? v : null;
}

function mapSortie(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    id: 'sortie',
    boss: str(s.boss),
    faction: str(s.faction),
    expiry: str(s.expiry),
    missions: Array.isArray(s.variants)
      ? s.variants.map((v) => ({
          missionType: str(v?.missionType),
          modifier: str(v?.modifier),
          node: str(v?.node),
        }))
      : [],
  };
}

function mapArchonHunt(a) {
  if (!a || typeof a !== 'object') return null;
  return {
    id: 'archon-hunt',
    boss: str(a.boss),
    faction: str(a.faction),
    expiry: str(a.expiry),
    missions: Array.isArray(a.missions)
      ? a.missions.map((m) => ({ type: str(m?.type), node: str(m?.node) }))
      : [],
  };
}

function mapSteelPath(sp) {
  if (!sp || typeof sp !== 'object') return null;
  const r = sp.currentReward;
  return {
    id: 'steel-path',
    currentReward: r ? { name: str(r.name), cost: typeof r.cost === 'number' ? r.cost : null } : null,
    expiry: str(sp.expiry),
  };
}

// Fissures rotate through the same node/tier combos, so the id folds in the
// expiry — a fresh rotation gets a fresh id, which is what lets a dismissal
// naturally "auto-show" the next instance instead of hiding it forever.
function mapFissure(f) {
  return {
    id: `fissure:${str(f?.tier)}:${str(f?.node)}:${str(f?.expiry)}`,
    tier: str(f?.tier),
    tierNum: typeof f?.tierNum === 'number' ? f.tierNum : null,
    missionType: str(f?.missionType),
    node: str(f?.node),
    expiry: str(f?.expiry),
    isStorm: Boolean(f?.isStorm),
  };
}

// Upstream keeps just-expired fissures in the payload for a while; drop any with
// a valid past expiry (missing/unparseable expiry is kept — never our call to hide).
function isLive(f) {
  const t = Date.parse(f?.expiry);
  return Number.isNaN(t) || t > Date.now();
}

function mapFissures(list) {
  const arr = (Array.isArray(list) ? list : []).filter((f) => f && isLive(f));
  const byTier = (a, b) => (a.tierNum ?? 0) - (b.tierNum ?? 0);
  return {
    normal: arr.filter((f) => !f.isHard).map(mapFissure).sort(byTier),
    steelPath: arr.filter((f) => f.isHard).map(mapFissure).sort(byTier),
  };
}

function rewardName(reward) {
  if (!reward || typeof reward !== 'object') return null;
  const counted = reward.countedItems;
  if (Array.isArray(counted) && counted.length) {
    return counted
      .map((c) => `${c?.count ? `${c.count}x ` : ''}${str(c?.type) ?? str(c?.key) ?? ''}`.trim())
      .filter(Boolean)
      .join(', ') || null;
  }
  const items = reward.items;
  if (Array.isArray(items) && items.length) return items.filter(Boolean).join(', ') || null;
  if (typeof reward.credits === 'number' && reward.credits > 0) return `${reward.credits.toLocaleString('en-US')} cr`;
  return null;
}

function mapInvasion(inv) {
  if (!inv || typeof inv !== 'object') return null;
  // Upstream `completion` is already a percentage (can be slightly negative when
  // the balance is on the other side); clamp to a 0-100 integer for display.
  const completion =
    typeof inv.completion === 'number' ? Math.max(0, Math.min(100, Math.round(inv.completion))) : null;
  return {
    // Invasions carry no expiry — they end when completed and drop out of the
    // upstream feed, so node+desc (stable for the invasion's lifetime) doubles
    // as the id; a dismissal simply stops matching once it disappears.
    id: `invasion:${str(inv.node)}:${str(inv.desc)}`,
    node: str(inv.node),
    desc: str(inv.desc),
    completion,
    attackerReward: rewardName(inv.attacker?.reward),
    defenderReward: rewardName(inv.defender?.reward),
    rewardTypes: Array.isArray(inv.rewardTypes) ? inv.rewardTypes.filter((t) => typeof t === 'string') : [],
  };
}

function mapArbitration(a) {
  if (!a || typeof a !== 'object') return null;
  // Upstream returns a placeholder (type "Unknown", node "SolNode000...") when
  // there is no current arbitration data — surface that as "no data" (null).
  const invalid =
    !str(a.type) || a.type === 'Unknown' || !str(a.node) || String(a.node).startsWith('SolNode000');
  if (invalid) return null;
  return {
    id: 'arbitration',
    node: str(a.node),
    type: str(a.type),
    enemy: str(a.enemy),
    expiry: str(a.expiry),
  };
}

function mapVoidTrader(v) {
  if (!v || typeof v !== 'object') return null;
  // Baro is always at a "... Relay"; upstream sometimes returns an internal key
  // (e.g. "TennoConHUB2") instead — only surface a genuine relay name.
  const loc = str(v.location);
  return {
    id: 'void-trader',
    character: str(v.character) ?? "Baro Ki'Teer",
    location: loc && /relay/i.test(loc) ? loc : null,
    activation: str(v.activation),
    expiry: str(v.expiry),
  };
}

function mapCycle(c) {
  if (!c || typeof c !== 'object') return null;
  return {
    state: str(c.state),
    isDay: typeof c.isDay === 'boolean' ? c.isDay : null,
    expiry: str(c.expiry),
  };
}

function mapDarvoDeal(deals) {
  const d = Array.isArray(deals) ? deals[0] : null;
  if (!d || typeof d !== 'object') return null;
  const num = (v) => (typeof v === 'number' ? v : null);
  return {
    id: 'darvo-deal',
    item: str(d.item),
    salePrice: num(d.salePrice),
    originalPrice: num(d.originalPrice),
    discount: num(d.discount),
    sold: num(d.sold),
    total: num(d.total),
    expiry: str(d.expiry),
  };
}

// Upstream's Archimedea `type` label is obfuscated/unreliable; warframestat lists
// Deep Archimedea (EntratiLab) first and Temporal Archimedea (Duviri) second.
const ARCHIMEDEA_LABELS = ['Deep Archimedea', 'Temporal Archimedea'];

function mapArchimedeas(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map((a, i) => ({
    id: `archimedea:${i}`,
    label: ARCHIMEDEA_LABELS[i] || `Archimedea ${i + 1}`,
    expiry: str(a?.expiry),
    missions: Array.isArray(a?.missions)
      ? a.missions.map((m) => ({
          missionType: str(m?.missionType),
          deviation: str(m?.deviation?.name),
          risks: Array.isArray(m?.risks)
            ? m.risks.map((r) => ({ name: str(r?.name), isHard: Boolean(r?.isHard) }))
            : [],
        }))
      : [],
    personalModifiers: Array.isArray(a?.personalModifiers)
      ? a.personalModifiers.map((p) => ({ name: str(p?.name), description: str(p?.description) }))
      : [],
  }));
}

/**
 * @param {any} raw parsed warframestat.us `/pc` JSON
 * @returns compact worldstate payload (sections only; caller adds fetchedAt/stale)
 */
export function extractWorldState(raw) {
  const w = raw && typeof raw === 'object' ? raw : {};
  return {
    sortie: mapSortie(w.sortie),
    archonHunt: mapArchonHunt(w.archonHunt),
    steelPath: mapSteelPath(w.steelPath),
    fissures: mapFissures(w.fissures),
    invasions: (Array.isArray(w.invasions) ? w.invasions : [])
      .filter((inv) => inv && inv.completed !== true)
      .map(mapInvasion)
      .filter(Boolean),
    arbitration: mapArbitration(w.arbitration),
    voidTrader: mapVoidTrader(w.voidTrader),
    cycles: {
      cetus: mapCycle(w.cetusCycle),
      vallis: mapCycle(w.vallisCycle),
      cambion: mapCycle(w.cambionCycle),
      duviri: mapCycle(w.duviriCycle),
    },
    darvoDeal: mapDarvoDeal(w.dailyDeals),
    archimedeas: mapArchimedeas(w.archimedeas),
  };
}
