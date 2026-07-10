# Warframe Companion App Feature Research
## Gap Analysis: Warframe TODO Tracker vs. Overframe/AlecaFrame/Ecosystem

**Current Warframe TODO Tracker features:** Dashboard, Items (tracking + Incarnon), Mods (wishlist), Loadouts (7-slot builder), Builds (component tracking), Todos, Shopping List (material aggregation), Sources (drop locations).

---

## PRIORITY 1 — Game-Changing Features (High Impact, Foundation for Others)

### 1.1 Build Share & Community Build Browser
**Source:** Overframe.gg (core feature)

The #1 feature Overframe is known for. Users create mod loadouts for any warframe/weapon, then share them publicly with upvoting, commenting, and search/filter. The Warframe TODO Tracker has a 7-slot loadout builder but it's purely local — no community, no sharing, no browsing popular builds by warframe/weapon.

**What to build:**
- Public build gallery with search by warframe/weapon/mod/tags
- Upvote/rating system + comment threads
- User profile pages showing their shared builds
- "Import from community build" into your personal loadout
- Build versioning (track updates when mods change in patches)
- Build of the week / trending section

### 1.2 Live Mission Alerts & World State Dashboard
**Source:** Tenno.Tools, Warframe Hub (hub.warframestat.us), official Companion App

These are dedicated live-dashboards showing everything happening in real-time. The Warframe TODO Tracker currently has no live data integration at all.

**What to build:**
- **Sortie** — current sortie missions, modifiers, reward pool, countdown
- **Void Fissures** — all active fissures by era (Lith/Meso/Neo/Axi/Requiem/Omnia), node, mission type, faction, countdown. Separate tab for Steel Path fissures and Void Storms.
- **Invasions** — active invasions with rewards (Fieldron/Detonite/Mutagen Mass/etc.), progress %, countdown
- **Arbitrations** — current arbitration node, mission type, countdown
- **Nightwave** — weekly/daily acts, progress, completion status
- **Alerts** — active alerts with rewards (if any)
- **Baro Ki'Teer** — arrival countdown, relay location, inventory (when active)
- **Cycle Timers** — Cetus day/night, Vallis warm/cold, Cambion Drift cycle (fass/vome), daily reset countdown
- **News & Events** — from official Warframe feed

**API source:** `https://api.warframestat.us/pc/` (free, no auth needed)

### 1.3 DPS / Stats Calculator for Loadouts
**Source:** Overframe.gg, warframe-damage.com

Overframe's build builder doesn't just store mod slots — it computes actual stat changes (damage, crit chance, status, fire rate, multishot, etc.) and DPS in real time as you slot mods.

**What to build:**
- Equip mods in a loadout and see computed stats (damage, multishot, crit chance/crit multiplier, status chance, fire rate, magazine, reload, accuracy)
- "Effective DPS" calculation accounting for crit/status
- Side-by-side comparison of two loadouts
- EHP (Effective Health Points) calculator for warframes
- Ability strength/duration/efficiency/range for warframes

**Game data needed:** Weapon base stats from @wfcd/items, mod stats from @wfcd/items, but the *calculation engine* needs to be built.

---

## PRIORITY 2 — High Value Features (Strong Differentiators)

### 2.1 Relic Planner & Vault Tracker
**Source:** AlecaFrame (Relic Planner, Relic Recommendation overlay), WFInfo

AlecaFrame's standout feature. Plan which relics to open for maximum profit. Shows which rewards are vaulted, ducat values, platinum values, and recommends which relic to crack.

**What to build:**
- Full relic inventory browser (all eras: Lith/Meso/Neo/Axi/Requiem)
- Vaulted/unvaulted status per relic
- Reward table per relic with drop rates, ducat value, platinum price (via warframe.market API)
- "Best relic to crack right now" recommendation based on current fissures
- Relic farming path (where to farm specific relics)
- Relic refinement calculator (void trace costs vs. reward chance improvement)

### 2.2 Riven Pricing & Grading
**Source:** AlecaFrame (Riven Explorer, Riven Overlay), Warframe.Market (auctions)

AlecaFrame's riven overlay shows stat grades (how perfect each roll is), estimated price, and which attributes are desirable. Warframe.Market has the auction house.

**What to build:**
- Riven stat grader (S/A/B/C/D tiers per stat, overall score)
- Price estimation based on weapon + stats (from warframe.market auction data)
- Riven wishlist / "rivens I own" tracker
- Roll comparison (before/after each reroll)
- Community tier list: which weapons benefit most from rivens

### 2.3 Forma / Polarity Optimization
**Source:** Overframe.gg

Overframe's builder automatically calculates forma count needed and shows which polarities give the best capacity savings for a given mod config.

**What to build:**
- Given a set of mods → suggest optimal forma polarities and minimum forma count
- Show capacity before/after each forma
- Forma blueprint farming tracker (where to get forma BPs, when to craft)
- "Will this build fit?" calculator — check if a mod loadout fits within capacity with X forma

### 2.4 Inventory Management & Warframe.Market Integration
**Source:** AlecaFrame (Inventory tab), Warframe.Market

AlecaFrame reads your in-game inventory and lets you one-click list items on Warframe.Market.

**What to build:**
- Track what you own vs. what you need
- Mod inventory (which mods you have, how many, ranked/not)
- Prime part inventory with ducat value + platinum value
- "List on Warframe.Market" button for sellable items
- Trade history dashboard (profit over time)
- Price alerts (notify when an item hits a target price)

---

## PRIORITY 3 — Quality-of-Life Features (Good Additions)

### 3.1 Mastery Rank Progression Tracker
**Source:** AlecaFrame (Mastery Helper), Warframe Foundry

AlecaFrame shows what items you have mastered, can master, and should build next.

**What to build:**
- MR progress bar with XP to next rank
- "What to build next" recommendations (unmastered items you can build now)
- Filter by: owned blueprints, craftable now, mastery locked
- All items sorted by mastery rank requirement
- Completion percentage per category (warframes, primary, secondary, melee, companions, archwing, etc.)

### 3.2 Syndicate Standing Tracker
**Source:** Warframe Wiki, game data

**What to build:**
- Current standing per syndicate + daily/weekly caps
- Best missions for standing farming per syndicate
- Syndicate mod/weapon shopping list (what to buy at each rank)
- Medallion spawn tracking (by tile set, per mission type)
- Allegiance planner (which 3 syndicates to max for best coverage)

### 3.3 Steel Path Progress Tracker & Duviri Circuit Planner
**Source:** Warframe Hub, Tenno.Tools (SP fissures)

**What to build:**
- Node completion map (star chart with Steel Path clear status)
- Steel Path Incarnon adapter farm tracker (which adapter for which weapon this week)
- Duviri Circuit reward rotation calendar
- Weekly Steel Path alert rewards tracker
- Teshin's Steel Path shop inventory tracker

### 3.4 Farming Route Planner & Drop Rate Database
**Source:** Warframe Wiki, various

The app already has Sources (drop locations), but it's static.

**What to build:**
- "Best place to farm X" ranking (by drop rate × efficiency)
- Odds calculator (% after N runs, expected runs to reach 90% probability)
- Full drop rate browser with search across all items/mods/relics
- Mission efficiency ratings (e.g., "best Lith relic farm: Hepit, Void")
- Farming route builder (sequence of missions to farm multiple items efficiently)

---

## PRIORITY 4 — Nice-to-Have Features (Lower Effort, Community Love)

### 4.1 Incarnon Genesis Advanced Tracker
**Source:** Current app has basic Incarnon tracking; expand it

- Weekly Incarnon rotation calendar (show all 6 weeks at once)
- Which Incarnon adapters are available this week from SP Circuit
- Evolution challenge checklist per adapter (per-kill/per-headshot conditions)
- Recommended evolutions per Incarnon weapon

### 4.2 Railjack / Archwing / Duviri Mission Tracker
- Intrinsics progress per school (tactical, piloting, gunnery, engineering, command)
- Best affinity farm per school
- Duviri pathos clamp / decree farming tracker
- Kahl's Garrison weekly mission tracker (if still active)

### 4.3 Foundry + Resource Timer Integration
**Source:** Official Companion App

- Deploy extractor tracking (which planet, time remaining, resources)
- Foundry build queue (items currently crafting, time remaining)
- Push notifications ("Your Forma is ready!")
- Resource booster tracker (time remaining on boosters)

### 4.4 Baro Ki'Teer & Prime Resurgence Inventory Tracker
- Baro arrival notifications
- "Should I buy?" value ratings (ducat cost vs. platinum price on market)
- Prime Resurgence event calendar and available relics
- Past Baro inventory history (helps predict future visits)

### 4.5 Mission Planner & Party Finder Integration
- Build a "farming session" (sequence of missions + required gear)
- Shareable mission plan links
- "LFG" note generation ("Looking for [Nekros] for [Hieracon]")

### 4.6 Lore / Codex Integration
- Quest progression tracker
- Codex scanning progress (for Simaris)
- Helminth segment/infusion tracker (which abilities subsumed, which remaining)

---

## Technical Feasibility Notes

**Live data (Priority 1.2):** Very easy — `https://api.warframestat.us/pc/` provides all world state data (sorties, fissures, invasions, alerts, arbitration, news, etc.) as JSON. No auth key needed.

**Build calculator (Priority 1.3):** Moderate difficulty. Need weapon base stats and mod stat data from @wfcd/items, then build a calculation engine that applies mod bonuses respecting Warframe's damage formulas (base damage → multishot → crit → status → faction modifiers). The formulas are well-documented on the wiki.

**Overframe build sharing (Priority 1.1):** Moderate. Needs a user accounts system, a public API for builds, and moderation tools (reporting, spam filtering).

**Riven pricing (Priority 2.2):** Hard. Riven prices are volatile, weapon-specific, and stat-dependent. Warframe.Market has an API but the riven auction data requires parsing. AlecaFrame's grading algorithm is proprietary. A machine-learned price estimator could work but is a significant project.

**Relic planner (Priority 2.1):** Moderate. Relic data from @wfcd/items, pricing from warframe.market API, vaulted status from community sources.

**Forma optimizer (Priority 2.3):** Moderate. Relies on having mod stats + forma polarity simulation (known mathematical problem — can be solved with search/optimization).

## Recommended Build Order

| Tier | Feature | Effort | Impact |
|------|---------|--------|--------|
| **Sprint 1** | Live World State (Sorties, Fissures, Invasions) | Low | Very High |
| **Sprint 2** | Relic Planner & Vault Tracker | Medium | Very High |
| **Sprint 3** | Mastery Rank Progression | Low | High |
| **Sprint 4** | Syndicate Standing Tracker | Low | High |
| **Sprint 5** | Steel Path Progress Tracker | Medium | High |
| **Sprint 6** | Build Calculator (DPS/Stats) | High | Very High |
| **Sprint 7** | Forma Optimization | Medium | High |
| **Sprint 8** | Build Sharing + Community | High | Very High |
| **Sprint 9** | Riven Pricing & Grading | High | High |
| **Sprint 10** | Inventory / Warframe.Market Integration | High | High |
| **Sprint 11** | Farming Route Planner | Medium | Medium |
| **Sprint 12** | Foundry Timers / Notifications | Medium | Medium |
