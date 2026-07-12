# Live World State Dashboard — Issue #55

Type: feat
Date: 2026-07-12
Status: Ready for implementation
Depth: Standard
Issue: [#55](https://github.com/NamalD/warframe-todo-tracker/issues/55)

---

## 1. Problem & Scope

Players want to see live, time-sensitive Warframe activities (Sortie, Fissures, Invasions, Baro
timer, day/night cycles, etc.) without leaving the tracker. Issue #55 asks for a dashboard page
that pulls live Worldstate data, caches it server-side to avoid rate limits, auto-refreshes, and is
mobile-responsive.

**In scope** (from #55 acceptance):
- A cached server endpoint that fetches Worldstate.
- A dashboard page showing: Sortie, Archon Hunt, Steel Path (weekly reward), Void Fissures
  (normal + Steel Path), Invasions with rewards, Arbitration, Baro Ki'Teer countdown/location,
  day/night cycles (Cetus/Plains, Vallis, Cambion, Duviri), Darvo's daily deal, and Deep/Temporal
  Archimedea modifiers.
- Auto-refresh every 60s and on page focus.
- Mobile-responsive layout.

**Out of scope (non-goals):** persisting Worldstate to SQLite, user notifications/alerts on
timers, per-user filtering/pinning, historical tracking, and any write path. This is a read-only,
ephemeral view — it deliberately does **not** touch the two existing data domains (reference data,
user data).

## 2. Key Technical Decisions

### KTD-1 — Data source: warframestat.us REST API, not the parser package

The acceptance lists "Install `@wfcd/warframe-worldstate-parser` (or equivalent)" and names
`docs.warframestat.us` as the API. We use the **hosted REST API** (`https://api.warframestat.us/pc`)
directly rather than the parser package. Rationale:

- `docs.warframestat.us` documents this REST API; it already runs the parser server-side and returns
  clean, pre-parsed JSON — it is the "equivalent" the acceptance allows.
- The parser package requires fetching DE's raw worldstate blob **plus** a multi-MB data package
  (`warframe-worldstate-data`) and running parsing in-process. That conflicts with the repo's
  standing gotcha about not bundling tens-of-MB `@wfcd` data into the app (see AGENTS.md,
  `next.config.js` external note) and adds heavy deps for no benefit.
- A single upstream HTTP call + our own cache satisfies "server-side fetch + cache to avoid rate
  limits" with far less surface area.

Trade-off: we depend on warframestat.us uptime. Mitigated by serving the last good cached payload on
upstream failure (KTD-3) and by the endpoint degrading gracefully per-section (Section 4, U1).

### KTD-2 — Server-side transform to a compact, UI-shaped payload

The raw `/pc` response is ~250 KB with ~35 top-level keys. A pure `extractWorldState(raw)` function
trims it to only the sections the page needs (a few KB), insulating the client from upstream schema
churn and keeping it unit-testable without network. The route returns this compact shape.

### KTD-3 — Module-level TTL cache with in-flight dedup (60s)

`src/data/worldstate.ts` holds a module-scoped `{ data, fetchedAt, promise }` cache. Requests within
the TTL return the cached compact payload; concurrent misses share one in-flight upstream fetch. The
app is a long-lived Node server under Docker, so module scope persists across requests. Upstream
fetch uses `cache: 'no-store'` so Next.js does not double-cache; we own the TTL. On upstream error we
serve the last good payload (if any) with a `stale: true` flag, else return `503`.

### KTD-4 — Countdowns computed client-side from `expiry` timestamps

The server returns ISO `expiry` strings (not pre-rendered "1h 17m" strings, which go stale between
refreshes). A shared `<Countdown expiry>` component and a pure `formatDuration(ms)` helper tick every
second from a single `now` state, so every timer counts down smoothly while the underlying data only
refetches every 60s.

## 3. Architecture & Data Flow

```
warframestat.us /pc  ──(server fetch, 60s TTL cache)──►  src/data/worldstate.ts
                                                              │ extractWorldState(raw)
                                                              ▼
                                          GET /api/worldstate  ──►  compact JSON { stale?, ...sections }
                                                              ▲
        app/worldstate/page.jsx  ──(fetch on mount, every 60s, on focus)──┘
                 │ renders cards; <Countdown> ticks 1s from expiry strings
                 ▼
        NavBar link "World State"
```

Reference for compact payload shape (fields confirmed against a live `/pc` sample on 2026-07-12):

```jsonc
{
  "fetchedAt": "ISO", "stale": false,
  "sortie":     { "boss", "faction", "expiry", "missions": [{ "missionType", "modifier", "node" }] },
  "archonHunt": { "boss", "faction", "expiry", "missions": [{ "type", "node" }] },
  "steelPath":  { "currentReward": { "name", "cost" }, "expiry" },
  "fissures":   { "normal": [{ "tier", "tierNum", "missionType", "node", "expiry", "isStorm" }],
                  "steelPath": [ /* same shape, isHard===true upstream */ ] },
  "invasions":  [{ "node", "desc", "attackerReward", "defenderReward", "completion", "rewardTypes" }],
  "arbitration": { "node", "type", "enemy", "expiry" } /* or null when upstream is expired/Unknown */,
  "voidTrader": { "character", "location", "active", "activation", "expiry" },
  "cycles":     { "cetus": { "state", "isDay", "expiry" }, "vallis": {…}, "cambion": {…}, "duviri": {…} },
  "darvoDeal":  { "item", "salePrice", "originalPrice", "discount", "sold", "total", "expiry" } /* or null */,
  "archimedeas": [{ "type", "missions": [{ "missionType", "deviation": { "name" },
                     "risks": [{ "name", "isHard" }] }], "personalModifiers": [{ "name", "description" }] }]
}
```

Notes from the live sample that the transform must handle:
- **Arbitration** can come back expired/`type: "Unknown"`/`node: "SolNode000"`. Treat that as "no
  active arbitration" → emit `null`; the UI shows an unavailable state rather than garbage.
- **Steel Path Incursions** (the daily 5-mission list) are **not** exposed by this API. `steelPath`
  is Teshin's weekly honor reward. We show the weekly reward + countdown and label it accurately;
  Steel Path *fissures* are already covered by the `isHard` fissure split. (Deviation from the
  issue's "daily mission list" wording — noted in the PR.)
- **`voidTrader.active`** was `null` in the sample; compute active/pending from `activation`/`expiry`
  vs. now rather than trusting `active`/`startString`/`endString`.
- **Invasions**: `rewardTypes` (e.g. `["detonite","fieldron"]`) lets us surface the Fieldron/
  Detonite/Mutagen reward names the issue calls out; `attackerReward`/`defenderReward.countedItems`
  carry the display names/counts.

## 4. Implementation Units

### U1 — Server data layer: fetch, cache, transform, route

**Files:**
- `src/data/worldstate.ts` (new) — `import 'server-only'`. Exports `getWorldState()` (cached fetch,
  returns compact payload with `stale`) and the pure `extractWorldState(raw)`. `// @ts-nocheck` +
  JSDoc typedefs per the repo's Oxc/Vitest TS workaround (AGENTS.md).
- `app/api/worldstate/route.js` (new) — `export const dynamic = 'force-dynamic'`; `GET` calls
  `getWorldState()`, returns `Response.json(payload)`; on hard failure with no cache, `503` with an
  `{ error }` body. Mirrors the try/catch + `console.error('[api/worldstate GET] …')` shape of
  `app/api/todos/route.js`.

**Design:**
- Module-scoped cache `{ data, fetchedAt, promise }`, `TTL = 60_000`, `SOURCE_URL =
  https://api.warframestat.us/pc?language=en`. `WORLDSTATE_TTL_MS` / source overridable via env for
  tests if convenient, else keep constant and test `extractWorldState` directly.
- `extractWorldState` is pure and total: every section wrapped so a missing/oddly-shaped upstream key
  yields `null`/`[]` instead of throwing (defensive `?.`/`Array.isArray` guards). Arbitration
  expiry/Unknown rule from Section 3.

**Tests — `tests/unit/worldstate.test.js` (Vitest, no network):**
- `extractWorldState` on a trimmed real-shaped fixture returns each section with expected fields
  (sortie missions mapped to `{missionType,modifier,node}`; archonHunt missions to `{type,node}`).
- Fissures split: `normal` excludes `isHard`, `steelPath` includes only `isHard`.
- Arbitration: expired/`Unknown`/`SolNode000` fixture → `arbitration === null`; a valid future
  fixture → populated object.
- Missing top-level keys (empty `{}`) → no throw; sections are `null`/`[]`.
- Invasions: `rewardTypes` and reward display names preserved.

### U2 — Countdown component + duration formatter

**Files:**
- `app/worldstate/countdown.jsx` (new, `'use client'`) — `<Countdown expiry>` subscribes to a 1s
  tick, renders `formatDuration(expiryMs - now)`; shows "Expired" (or "—") when non-positive.
- `formatDuration(ms)` — pure; exported for unit test. Formats to `Nd Nh Nm Ns`, dropping leading
  zero units (e.g. `2h 05m 30s`, `45m 12s`, `8s`). Place alongside the component or in
  `src/data/worldstate-format.ts` if reused server-side (it is not — keep it client-local unless a
  second consumer appears).

**Tests — `tests/unit/worldstate-format.test.js`:** `formatDuration` for multi-day, hours+minutes,
sub-minute, zero, and negative inputs.

### U3 — Dashboard page + nav link

**Files:**
- `app/worldstate/page.jsx` (new, `'use client'`) — fetches `/api/worldstate` on mount; `setInterval`
  60s; `window` `focus`/`visibilitychange` refetch (cleaned up on unmount). Loading skeleton (reuse
  `.card` + `.skeleton` like `app/page.jsx`), error card with a Retry button, and a subtle "stale"
  note when `payload.stale`. Renders one `.card` per section inside the existing responsive grid
  (`display:grid; gridTemplateColumns: repeat(auto-fit, minmax(260px, 1fr)); gap:14`). Uses design
  tokens / existing classes (`.card`, `.badge`, `--wf-accent`, `--wf-link`, `--wf-text-muted`).
  Countdown via `<Countdown>`. Baro card switches between "arrives in <countdown>" and "at <location>,
  leaves in <countdown>" based on activation/expiry vs now.
- `app/components/NavBar.jsx` (edit) — add `{ href: '/worldstate', label: 'World State' }` to
  `NAV_LINKS` (renders in both desktop and mobile menus automatically).

**Tests — `tests/worldstate.spec.ts` (Playwright, route-intercepted per AGENTS.md e2e pattern):**
- Intercept `GET /api/worldstate` with a fixed fixture; assert **content**, not just counts:
  the Sortie boss/one modifier text, an invasion reward name (e.g. "Fieldron"), the Baro location or
  "arrives" wording, and at least one day/night state (e.g. Cetus "day"/"night").
- Assert a live countdown renders (matches `/\d+[hm]/` for a far-future expiry).
- Nav: clicking the "World State" link routes to `/worldstate`.
- Error path: intercept with `503` → error card + Retry visible.

## 5. Sequencing & Dependencies

U1 → U2 → U3 (each an atomic commit). U2 has no dependency on U1 and could land in parallel, but the
natural order is data → primitive → page. External dep: none added to `package.json` (KTD-1). No DB
migration, no prebuild change.

## 6. Risks & Mitigations

- **Upstream schema drift / partial outages** → total `extractWorldState`, per-section `null`/`[]`,
  stale-serve on error, UI unavailable states. Fixture-based unit tests pin the transform.
- **Upstream user-agent filtering** (observed: default fetchers get `403`) → send an explicit
  descriptive `User-Agent` header on the server fetch.
- **Timer drift between 60s refetches** → client computes from `expiry`, so timers stay correct;
  refetch only reconciles the data set.
- **SSR/build-time network** → page is `'use client'` and fetches at runtime; route is
  `force-dynamic`. No network at build.
- **Component-test hangs** (AGENTS gotcha) → UI verification is Playwright with route interception,
  not jsdom component tests, so there are no unmocked `useEffect` async traps.

## 7. Validation

- `yarn vitest run tests/unit/worldstate.test.js tests/unit/worldstate-format.test.js`
- `yarn playwright test tests/worldstate.spec.ts`
- `yarn build` (ensure the new route/page compile; no accidental server-only import in client)
- Manual/`/verify` smoke of `/worldstate` against the live endpoint before PR.

## 8. Acceptance Traceability (#55)

| Acceptance item | Covered by |
|---|---|
| Install parser (or equivalent) | KTD-1 (REST API equivalent) |
| Cached server endpoint | U1 |
| Dashboard page with key world state | U3 (all listed sections) |
| Auto-refresh 60s / on focus | U3 |
| Mobile-responsive layout | U3 (auto-fit grid, existing responsive nav) |
