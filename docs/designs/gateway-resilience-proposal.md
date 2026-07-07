# Gateway Resilience Proposal — Stop OOM Outages

> **Author:** daedalus | **Date:** 2026-07-07 | **Status:** Proposal
>
> Root cause analysis and staged fixes for hermes-gateway OOM kills on a 3.7GB VPS.
> All profiles go offline simultaneously, the kanban pipeline stalls, and no automatic
> recovery re-spawns worker profiles after gateway restart.

---

## Table of Contents

1. [Root Cause Analysis](#1-root-cause-analysis)
2. [System Inventory](#2-system-inventory)
3. [Short-term Fixes (Do Now)](#3-short-term-fixes-do-now)
4. [Medium-term Solutions](#4-medium-term-solutions)
5. [Long-term Infrastructure](#5-long-term-infrastructure)
6. [Implementation Plan](#6-implementation-plan)
7. [Risk Assessment & Rollback](#7-risk-assessment--rollback)

---

## 1. Root Cause Analysis

### 1.1 Memory Topology (measured 2026-07-07)

| Component | RSS | Notes |
|---|---|---|
| **System baseline** | ~700 MB | OS + systemd + journald + sshd + fail2ban + caddy |
| **dockerd** | ~250 MB | Container runtime daemon |
| **Docker containers (5)** | ~115 MB | warframe-todo (22M), syncthing (28M), actual-budget (20M), lazylibrarian (4M), kavita (40M) |
| **hermes-gateway (idle)** | ~300 MB | Python process, 27 threads |
| **hermes-dashboard** | ~20 MB | Web UI management |
| **Per active kanban worker** | ~190 MB | Python runtime + model context for deepseek-v4-flash |
| **Headless Chrome** | ~150 MB | Playwright/browser_use for web tools |
| **Total with 2 workers** | **~1,915 MB** | 700+250+115+300+20+380+150 = 1,915 |
| **Total with 4 workers** | **~2,295 MB** | 700+250+115+300+20+760+150 = 2,295 |
| **Total with 4+gateway peak** | **~3,085 MB** | Gateway peaked at 2,936 MB in systemd metrics |

### 1.2 OOM Trigger Path

The kernel OOM killer activates when memory pressure exceeds 3.7GB (total RAM). The sequence:

1. **Gateway process grows over time** — conversation history, tool output, and intermediate data accumulate in-process. The systemd `MemoryPeak` metric shows **2,936 MB** for the gateway alone.
2. **Workers consume additional memory** — each active kanban profile (daedalus, hephaestus, themis, etc.) runs a Python subprocess with model context (~190 MB each).
3. **Concurrent workers amplify pressure** — if the kanban dispatcher spawns 3+ workers simultaneously (e.g., hephaestus, daedalus, themis back-to-back), memory spikes rapidly.
4. **Swap is exhausted** — 2GB swap, currently 1.3 GB used. When swap fills, remaining allocations go to physical RAM.
5. **OOM killer fires** — with `OOMScoreAdjust=200`, the gateway is the preferred OOM victim. `OOMPolicy=stop` means systemd treats the kill as a stop event.

### 1.3 Why the Pipeline Stalls

- `Restart=always` **does** restart the gateway process — the service comes back
- But: all kanban worker subprocesses are killed with the gateway
- The kanban dispatcher (which runs inside the gateway) restarts from scratch
- Worker profiles are **not** re-spawned automatically after gateway restart
- There is no cron job or health check that re-launches downed worker gateways
- Blocked tasks (waiting for review) never progress because reviewers (themis) never come back online

### 1.4 Existing Defenses (and Why They Failed)

| Defense | Status | Gap |
|---|---|---|
| `Restart=always` | ✅ Active | Restarts gateway but not workers |
| Gateway watchdog script | ⚠️ Exists but **not scheduled** | `/home/namal/.hermes/scripts/gateway-watchdog.sh` written but no cron job runs it |
| Kanban watchdog script | ⚠️ Exists but **not scheduled** | `/home/namal/.hermes/scripts/kanban-gateway-watchdog.sh` written but no cron job runs it |
| OOMScoreAdjust=200 | ❌ Harmful | Makes gateway the preferred OOM victim |
| MemoryMax/MemoryHigh | ❌ Not set | No cgroup limit on gateway memory |

---

## 2. System Inventory

### 2.1 Hardware

- VPS: Ubuntu 26.04, 3.7 GB RAM, 2 GB swap
- Storage: ~20GB available on root partition
- CPU: 2 vCPUs

### 2.2 Hermes Profiles (9 total)

| Profile | Model | Gateway State | Role |
|---|---|---|---|
| default | deepseek-v4-flash | running | Main gateway + dispatcher |
| apollo | deepseek-chat | stopped | Unknown/legacy |
| argus | deepseek-v4-flash | stopped | QA/testing |
| atlas | deepseek-v4-flash | stopped | DevOps |
| daedalus | deepseek-v4-flash | stopped | Architect/planner |
| hephaestus | deepseek-v4-flash | stopped | Implementation |
| iris | deepseek-v4-flash | stopped | Unknown |
| mnemosyne | deepseek-v4-flash | stopped | Unknown |
| themis | deepseek-v4-flash | stopped | Code review |

Only the `default` profile runs continuously. All others are spawned on demand by the kanban dispatcher.

### 2.3 Systemd Unit: hermes-gateway.service

```
Type=simple
Restart=always (5s)
OOMPolicy=stop
OOMScoreAdjust=200
MemoryMax=infinity        ← No cgroup limit!
MemoryHigh=infinity       ← No cgroup limit!
MemorySwapMax=infinity    ← No swap limit either!
MemoryCurrent=1,639 MB
MemoryPeak=2,936 MB
MemorySwapPeak=1,180 MB
```

### 2.4 Docker Containers

5 containers (warframe-todo-tracker, syncthing, actual-budget, lazylibrarian, kavita) totalling ~115MB RSS.

---

## 3. Short-term Fixes (Do Now)

### 3.1 Set Memory Cgroup Limits on Gateway

**Why:** Prevents the gateway from consuming all available RAM and triggering a system-level OOM.

**Action:** Add to `hermes-gateway.service`:
```
MemoryMax=2.5G
MemoryHigh=2.0G
MemorySwapMax=1G
```

**Why these values:**
- 2.0G `MemoryHigh`: soft limit — systemd starts throttling at 2GB (idle is 300MB, normal operation with 2 workers is ~1GB)
- 2.5G `MemoryMax`: hard limit — process is SIGTERM'd at 2.5GB, leaving ~1.2GB for system + Docker + swap
- 1G `MemorySwapMax`: swap cap — prevents swap thrashing

**Risk:** If a legitimate operation requires >2.5GB, it will crash. But with 3.7GB total RAM, any operation demanding >2.5GB in the gateway process alone is already causing OOMs — the limit just makes the failure graceful and predictable.

### 3.2 Flip OOMScoreAdjust to Protect Gateway

**Why:** Currently `OOMScoreAdjust=200` makes the gateway the _most_ likely process to be killed. The gateway is the most important process — we want it to be the _last_ killed.

**Action:** Change from `200` to `-500`:
```
OOMScoreAdjust=-500
```

This makes the kernel prefer killing heavy worker subprocesses over killing the gateway. Since workers are stateless and re-spawnable, losing a worker is far less damaging than losing the gateway.

### 3.3 Change OOMPolicy from "stop" to "cgroup"

**Why:** `OOMPolicy=stop` tells systemd to treat an OOM kill as a stop event. `OOMPolicy=cgroup` tells systemd to only kill the offending cgroup (worker subprocess within the cgroup) while keeping the main process alive.

**Action:**
```
OOMPolicy=cgroup
```

Combined with `MemoryMax=2.5G`, this means: if a worker subprocess balloons, systemd kills just that worker, not the entire gateway.

### 3.4 Schedule Gateway Health Check Cron (Existing Script)

**Why:** Two watchdog scripts already exist (`gateway-watchdog.sh` and `kanban-gateway-watchdog.sh`) but aren't scheduled. The no_agent cron pattern would run them every 5 minutes; they stay silent when healthy and alert on failures.

**Action:** Create a hermes cron job (no_agent mode):
```bash
hermes cron create \
  --name "gateway-health-check" \
  --schedule "5m" \
  --no-agent \
  --script "~/.hermes/scripts/gateway-watchdog.sh" \
  --deliver "local" \
  --repeat 0
```

This runs the existing `gateway-watchdog.sh` script every 5 minutes. When healthy: exits 0 (silent). When gateway is down: restarts it and reports.

### 3.5 Schedule Kanban Worker Recovery Script (Existing Script)

**Why:** Even when the gateway is healthy, worker profiles may not have spawned. The `kanban-gateway-watchdog.sh` script checks for ready tasks with no running workers and alerts.

**Action:** Create a second hermes cron job:
```bash
hermes cron create \
  --name "kanban-worker-watchdog" \
  --schedule "10m" \
  --no-agent \
  --script "~/.hermes/scripts/kanban-gateway-watchdog.sh" \
  --deliver "local" \
  --repeat 0
```

### 3.6 Reduce max_concurrent_children (Explicit Cap)

**Why:** The current configuration has no explicit limit on how many kanban workers can run simultaneously. If the dispatcher spawns 4-5 workers at once, memory spikes.

**Action:** Set delegation limits per profile:

Add to the deployment channel or gateway config:
- `delegation.max_concurrent_children: 2` — limits total parallel workers to 2
- This caps the worker memory overhead to ~400MB instead of 800MB+

**Implementation:**
- Check if `delegation.max_concurrent_children` can be set per-profile or globally
- Set a safe ceiling so the system never exceeds the memory budget

### 3.7 Total Memory Budget After Short-term Fixes

| Component | Before | After |
|---|---|---|
| Gateway (capped) | 2.9 GB peak | 2.0 GB soft / 2.5 GB hard |
| Workers (capped to 2) | 760 MB (4 workers) | 380 MB (2 workers) |
| System + Docker | 1,065 MB | 1,065 MB |
| **Total worst case** | **~4,725 MB** (OOM crash) | **~3,945 MB** (within 3.7GB + swap delta) |

With the cgroup cap at 2.5 GB and max 2 workers, the worst case is ~3,945 MB. This is still tight but avoids the OOM trigger (which requires exceeding 3.7 GB physical + requiring new allocations. Swap helps absorb overflow).

**If this isn't enough:** reduce `MemoryMax` to 2.0G and/or limit to 1 concurrent worker.

---

## 4. Medium-term Solutions

### 4.1 Stagger Worker Launches

**Problem:** When the kanban dispatcher picks up multiple ready tasks, it spawns all workers simultaneously — causing a memory spike.

**Solution:** Add a launch delay/stagger mechanism:
- Spawn workers with a 30-second delay between each
- Use the kanban scheduler to queue workers instead of firing them all at once
- Priority-aware: high-priority tasks first, delay lower-priority ones

**Implementation:** This could be a Hermes config option (`dispatcher.spawn_delay: 30`) or a kanban board-level setting. Check if the kanban dispatcher supports this natively.

### 4.2 Auto-Pause Idle Profiles

**Problem:** All 9 profiles exist but most are never used (apollo, argus, iris, mnemosyne). They still consume config file space and their gateways could accidentally be started.

**Solution:** Add a staleness check — if a profile hasn't had tasks for N hours, auto-pause it:
- A cron job checks `hermes kanban stats` for activity by profile
- Profiles with no tasks assigned in 12+ hours are paused
- Paused profiles don't consume resources (no gateway process to reconnect)

**Implementation:** Extend the kanban watchdog script or create a dedicated `profile-staleness-check.sh`.

### 4.3 Working Hours Scheduling

**Problem:** Workers running at 3 AM consume memory for zero user value.

**Solution:** Add kanban scheduling — only dispatch workers during configurable "active hours" (e.g., 08:00–23:00 local time):
- Tasks created outside active hours stay `scheduled` instead of `ready`
- The dispatcher only picks from `ready` pool during active hours
- Urgent tasks can bypass via a priority flag

**Implementation:** This is a kanban board feature. Check if `hermes kanban` supports time-based scheduling; if not, implement via a cron job that promotes `scheduled`→`ready` at 08:00 and demotes at 23:00.

### 4.4 Per-Task Memory Limits via cgroups

**Problem:** Individual worker processes can grow unbounded (particularly when handling large context windows — 41K tokens seen in logs).

**Solution:** Use systemd `MemoryMax` on ephemeral worker scope units:
- When kanban spawns a worker, wrap it in a transient systemd scope with `MemoryMax=500M`
- If the worker exceeds 500MB, systemd kills just that worker (not the gateway)
- The failed task gets retried

**Implementation:** Requires modifying the kanban dispatcher to use `systemd-run --scope --property=MemoryMax=500M` when spawning workers. This is a Hermes code change.

### 4.5 Gateway Memory Leak Investigation

**Problem:** The gateway grows from 300MB (idle) to 2.9GB (peak). This is suspicious — a messaging gateway should not accumulate that much memory.

**Solution:** Investigate what's holding memory:
- Check for accumulated conversation context in the gateway
- Look for tool output caching that's never evicted
- Verify that completed conversation sessions are garbage collected
- Add periodic `gc.collect()` or memory pressure handlers

This requires Python profiling of the running gateway process.

---

## 5. Long-term Infrastructure

### 5.1 Separate Gateway Processes Per Profile

**Problem:** A single gateway process handles all platform connections and dispatches all workers. A single OOM kills everything.

**Solution:** Run one gateway process per profile, each with isolated systemd units and independent memory limits:

```
hermes-gateway-default.service   (runs connections: Discord, Telegram)
hermes-gateway-hephaestus.service (spawned on demand for implantation workers)
hermes-gateway-themis.service     (spawned on demand for reviewers)
...
```

Each has its own:
- `MemoryMax=500M` (small — just comms, no inference)
- `OOMScoreAdjust=-1000` (protected)
- `Restart=always` (auto-recovery)
- Systemd socket activation for zero-wait startup

**Impact:** If any single gateway OOMs, only that profile is affected. Other profiles continue working. This also enables profile-specific rate limiting and independent version updates.

### 5.2 Worker Queue with Backpressure

**Problem:** The kanban dispatcher immediately spawns a worker for every ready task. There's no queuing or backpressure.

**Solution:** A proper task queue:
1. Tasks enter a queue on the board
2. A scheduler checks system resources before dispatching:
   - Free memory > 1GB? → dispatch next task
   - Free memory < 500MB? → hold queue, send alert
   - Swap usage > 80%? → hold queue
3. Queued tasks show status `queued` instead of `ready`
4. High-priority flag bypasses backpressure

**Implementation:** Requires kanban board changes. Integrate with Hermes status pings for real-time resource awareness.

### 5.3 VPS Upgrade vs Optimization Tradeoff

**Cost of upgrade:** A Hetzner CX22 (4GB) or CX32 (8GB) costs €3.79–€5.99/month. The current VPS is 3.7GB.

**If upgrade to 8GB:**
- No need for most memory optimization
- Can run 4-5 concurrent workers comfortably
- Gateway cgroup limits can be relaxed to 4GB
- One-time migration: snapshot, resize, reboot

**Cost of optimization (if no upgrade):**
- Requires implementing all 4 medium-term solutions
- Reduced throughput (max 2 concurrent workers)
- More complex monitoring and alerting
- Risk of edge cases blocking the pipeline during peak memory

**Recommendation:** Implement short-term fixes now (free, immediate relief). Plan for an 8GB upgrade as a parallel track — it costs less than 1 hour of engineering time per month and solves the problem permanently.

### 5.4 Resource Monitoring Dashboard

**Problem:** There is currently no visibility into memory usage trends. The first notification is "gateway is down."

**Solution:** Set up:
1. **Cron job that reports memory stats daily** to the backups Discord channel:
   ```
   Gateway: 1.2G / 2.5G (48%)
   Workers: 2 active (hephaestus 195M, themis 180M)
   System: 2.1G / 3.7G (57%) | Swap: 1.4G / 2G (70%)
   Docker: 115M total
   ```
2. **Alert at 80% memory usage** — warn before OOM happens
3. **Alert when workers fail to spawn after gateway restart** — the kanban watchdog already outputs this when active

---

## 6. Implementation Plan

### Phase 1: Immediate (Today) — Stop the Bleeding

| # | Task | Effort | Who | Dependencies |
|---|---|---|---|---|
| 1 | Set MemoryMax/MemoryHigh cgroup limits on gateway unit | 15 min | atlas | None |
| 2 | Fix OOMScoreAdjust and OOMPolicy in unit file | 5 min | atlas | None |
| 3 | Reload systemd + restart gateway | 5 min | atlas | 1, 2 |
| 4 | Configure max_concurrent_children=2 | 15 min | atlas | None |
| 5 | Schedule gateway-watchdog.sh as no_agent cron | 10 min | atlas | None |
| 6 | Schedule kanban-watchdog.sh as no_agent cron | 10 min | atlas | None |
| 7 | Test: trigger a memory spike, verify cgroup limit works | 20 min | atlas | 1, 2, 3 |

**Total Phase 1:** ~1.5 hours

### Phase 2: This Week — Increase Robustness

| # | Task | Effort | Who | Dependencies |
|---|---|---|---|---|
| 8 | Enable systemd memory accounting for worker scope units | 2 hr | atlas/hermes | Medium-term solution 4.4 |
| 9 | Set up daily memory stats report to Discord | 30 min | atlas | 5, 6 |
| 10 | Set up 80% memory alert | 30 min | atlas | 9 |
| 11 | Investigate gateway memory growth over time | 3 hr | daedalus | N/A (research track) |
| 12 | Implement worker launch staggering (30s delay) | 2 hr | hermes | N/A (code track) |

**Total Phase 2:** ~8 hours

### Phase 3: This Month — Structural Changes

| # | Task | Effort | Who | Dependencies |
|---|---|---|---|---|
| 13 | Evaluate VPS upgrade to 8GB | 30 min | namal | N/A |
| 14 | If upgrading: migrate, verify gateway works on new hardware | 1 hr | atlas | 13 |
| 15 | Implement idle profile auto-pause | 4 hr | hermes | Phase 1 |
| 16 | Implement working hours scheduling | 4 hr | hermes | Phase 1 |
| 17 | Separate gateways per profile (optional, depends on upgrade) | 8 hr | hermes | Phase 1+2 |

**Total Phase 3:** ~17-18 hours (less if VPS upgrade eliminates need for #15-17)

### Visual Dependency Graph

```
Phase 1 (today)
  1 → 3 → 7
  2 → 3 → 7
  4 (parallel with 1-3)
  5 (parallel)
  6 (parallel)

Phase 2 (this week)
  8 → 9 → 10 → 11 (parallel track)
  12 → (feeds into Phase 3 load balancing)

Phase 3 (this month)
  13 → 14 → (17 optional)
  15, 16 (parallel, reducible if VPS upgrade happens)
```

---

## 7. Risk Assessment & Rollback

### 7.1 Risk: Cgroup Limits Too Aggressive

**Scenario:** A legitimate operation (e.g., processing a large batch of tasks) requires more than 2.5GB.

**Impact:** Gateway process is SIGTERM'd by systemd. Systemd restarts it (Restart=always). Up to 60s downtime.

**Detection:** Journal logs will show `MemoryMax` exceeded. The gateway-watchdog will fire.

**Rollback:**
```bash
systemctl --user edit hermes-gateway.service
# Remove or increase MemoryMax= line
systemctl --user daemon-reload
systemctl --user restart hermes-gateway.service
```

**Mitigation:** Start with `MemoryMax=2.5G` (very generous — gateway runs at 300MB idle). If false positives occur, increase to 3.0G.

### 7.2 Risk: OOMPolicy=cgroup Not Supported

**Scenario:** The systemd version on Ubuntu 26.04 may not support `OOMPolicy=cgroup` as expected (requires systemd v243+, which Ubuntu 26.04 should have).

**Impact:** Systemd may ignore the directive or behave unexpectedly.

**Rollback:** Revert to `OOMPolicy=stop`.

### 7.3 Risk: max_concurrent_children=2 Too Restrictive

**Scenario:** The kanban board has 3+ ready tasks that are independent (not blocking each other). They get serialized unnecessarily.

**Impact:** Reduced throughput. Tasks take longer to complete.

**Remediation:** Increase to 3-4 after observing memory behavior post-gateway cgroup limit.

### 7.4 Risk: Watchdog Scripts Spam on Every Cron Run

**Scenario:** The no_agent cron jobs output status even when healthy (if the scripts have bugs).

**Impact:** Noise in the delivery channel.

**Remediation:** The scripts are designed for no_agent mode (exit 0 = silent). If a script has a bug, fix it. The kanban-watchdog also has a `BLOCKED_THRESHOLD=5` to avoid alerting on non-critical states.

### 7.5 Risk: Gateway Restarting Too Fast Causes Crash Loop

**Scenario:** A transient resource spike kills the gateway immediately on startup (e.g., if Docker daemon is also restarting).

**Impact:** Crash loop: restart → OOM → restart → OOM.

**Detection:** Systemd `StartLimitBurst=5` in the unit file (stops after 5 failures per interval). Currently `StartLimitIntervalSec=0` (no interval, unlimited restart attempts). This is intentional — we always want the gateway to keep trying.

**Mitigation:** If crash loop occurs, the watchdog scripts should detect it (service is stopping and restarting rapidly) and alert. Manual intervention: check what's consuming memory on startup.

---

## Appendix A: Systemd Unit Diff

**Current** (`systemctl --user cat hermes-gateway.service`):
```
[Service]
...
OOMPolicy=stop
OOMScoreAdjust=200
MemoryMax=infinity
MemoryHigh=infinity
```

**Proposed**:
```
[Service]
...
OOMPolicy=cgroup             # Kill the offending cgroup, not the whole process
OOMScoreAdjust=-500           # Protect gateway from being the OOM target
MemoryMax=2.5G               # Hard cap: gateway + workers ≤ 2.5GB
MemoryHigh=2.0G              # Soft cap: throttle at 2GB
MemorySwapMax=1G             # Swap cap: prevent swap thrashing
```

Apply via override:
```bash
systemctl --user edit hermes-gateway.service
# Paste the proposed [Service] overrides into the editor
systemctl --user daemon-reload
systemctl --user restart hermes-gateway.service
```

## Appendix B: Cron Job Commands

```bash
# Gateway health check (every 5 min, no_agent pattern)
hermes cron create \
  --name "gateway-health-check" \
  --schedule "5m" \
  --script "~/.hermes/scripts/gateway-watchdog.sh" \
  --deliver "local" \
  --no-agent \
  --repeat 0

# Kanban worker health check (every 10 min, no_agent pattern)
hermes cron create \
  --name "kanban-worker-watchdog" \
  --schedule "10m" \
  --script "~/.hermes/scripts/kanban-gateway-watchdog.sh" \
  --deliver "local" \
  --no-agent \
  --repeat 0
```

## Appendix C: Delegation Configuration

```yaml
# hermes configuration — set delegation limits
delegation:
  max_concurrent_children: 2    # Max agent profiles running simultaneously
  max_spawn_depth: 1             # No nested delegation (already set)
```

## Appendix D: Memory Budget Calculator

Use this formula to assess remaining budget at any point:

```
available = 3700 - gateway_rss - sum(worker_rss) - docker_rss - system_rss

Where:
  gateway_rss  ≈ read from systemctl --user show hermes-gateway.service | grep MemoryCurrent
  worker_rss   ≈ read from ps -eo rss,cmd | grep 'hermes -p [a-z]*'
  docker_rss   ≈ read from docker stats --no-stream
  system_rss   ≈ 1050 (read from free -h minus known processes)

Safe zone: available > 500MB
Warning zone: available < 300MB
Critical zone: available < 100MB
```
