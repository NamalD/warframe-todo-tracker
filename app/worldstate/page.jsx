'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Countdown from './countdown';

const REFRESH_MS = 60_000;
const accent = { color: 'var(--wf-accent)' };
const muted = 'muted';

// --- presentational helpers -------------------------------------------------

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z]+/g, '-');
}

function MarkDoneButton({ onClick, testId }) {
  return (
    <button
      type="button"
      className="btn"
      style={{ padding: '2px 8px', fontSize: 'var(--wf-font-xs)', whiteSpace: 'nowrap' }}
      onClick={onClick}
      data-testid={testId}
    >
      Mark done
    </button>
  );
}

function SectionCard({ title, expiry, expiryPrefix, onMarkDone, children }) {
  const slug = slugify(title);
  return (
    <div className="card" data-testid={`ws-card-${slug}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {expiry !== undefined && (
            <span className={muted} style={{ fontSize: 'var(--wf-font-sm)', whiteSpace: 'nowrap' }}>
              <Countdown expiry={expiry} prefix={expiryPrefix} />
            </span>
          )}
          {onMarkDone && <MarkDoneButton onClick={onMarkDone} testId={`ws-mark-done-${slug}`} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p className={muted} style={{ fontStyle: 'italic' }}>{children}</p>;
}

function MissionRow({ primary, secondary, tertiary }) {
  return (
    <div style={{ fontSize: 'var(--wf-font-sm)', margin: '4px 0' }}>
      <span style={{ color: 'var(--wf-text)' }}>{primary}</span>
      {secondary && <span className={muted}> · {secondary}</span>}
      {tertiary && <div className={muted} style={{ fontSize: 'var(--wf-font-xs)' }}>{tertiary}</div>}
    </div>
  );
}

// --- section renderers ------------------------------------------------------

function SortieCard({ sortie, onMarkDone }) {
  if (!sortie) return null;
  return (
    <SectionCard title="Sortie" expiry={sortie.expiry} onMarkDone={onMarkDone}>
      <p style={{ margin: '2px 0 8px' }}>
        <strong style={accent}>{sortie.boss}</strong>
        {sortie.faction && <span className={muted}> · {sortie.faction}</span>}
      </p>
      {sortie.missions.map((m, i) => (
        <MissionRow key={i} primary={m.missionType} secondary={m.node} tertiary={m.modifier} />
      ))}
    </SectionCard>
  );
}

function ArchonCard({ archonHunt, onMarkDone }) {
  if (!archonHunt) return null;
  return (
    <SectionCard title="Archon Hunt" expiry={archonHunt.expiry} onMarkDone={onMarkDone}>
      <p style={{ margin: '2px 0 8px' }}>
        <strong style={accent}>{archonHunt.boss}</strong>
        {archonHunt.faction && <span className={muted}> · {archonHunt.faction}</span>}
      </p>
      {archonHunt.missions.map((m, i) => (
        <MissionRow key={i} primary={m.type} secondary={m.node} />
      ))}
    </SectionCard>
  );
}

function SteelPathCard({ steelPath, onMarkDone }) {
  if (!steelPath) return null;
  const r = steelPath.currentReward;
  return (
    <SectionCard title="Steel Path" expiry={steelPath.expiry} expiryPrefix="resets in " onMarkDone={onMarkDone}>
      <p className={muted} style={{ marginTop: 2 }}>Teshin&rsquo;s weekly reward</p>
      {r ? (
        <p style={{ margin: '4px 0' }}>
          <strong style={accent}>{r.name}</strong>
          {r.cost != null && <span className={muted}> · {r.cost} Steel Essence</span>}
        </p>
      ) : (
        <Empty>Reward unavailable</Empty>
      )}
    </SectionCard>
  );
}

function BaroCard({ voidTrader, onMarkDone }) {
  if (!voidTrader) return null;
  const now = Date.now();
  const act = voidTrader.activation ? new Date(voidTrader.activation).getTime() : null;
  const exp = voidTrader.expiry ? new Date(voidTrader.expiry).getTime() : null;
  const arriving = act != null && now < act;
  const atRelay = !arriving && exp != null && now < exp;
  return (
    <SectionCard
      title="Baro Ki'Teer"
      expiry={arriving ? voidTrader.activation : atRelay ? voidTrader.expiry : undefined}
      expiryPrefix={arriving ? 'arrives in ' : atRelay ? 'leaves in ' : ''}
      onMarkDone={onMarkDone}
    >
      {atRelay ? (
        <p style={{ margin: '4px 0' }}>
          <span className="badge in_progress">at relay</span>
          {voidTrader.location && <span className={muted}> · {voidTrader.location}</span>}
        </p>
      ) : arriving ? (
        // While arriving, upstream `location` is an internal key, not a relay name — omit it.
        <p className={muted} style={{ margin: '4px 0' }}>Next visit scheduled</p>
      ) : (
        <Empty>No scheduled visit</Empty>
      )}
    </SectionCard>
  );
}

function FissureList({ fissures, onMarkDone }) {
  if (!fissures || !fissures.length) return <Empty>None active</Empty>;
  return (
    <div>
      {fissures.map((f) => (
        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 'var(--wf-font-sm)', margin: '3px 0' }}>
          <span>
            <strong style={accent}>{f.tier}</strong>
            {f.isStorm && <span className="badge" style={{ marginLeft: 4 }}>Storm</span>}
            <span className={muted}> {f.missionType} · {f.node}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span className={muted}><Countdown expiry={f.expiry} /></span>
            <MarkDoneButton onClick={() => onMarkDone(f.id, f.expiry)} testId={`ws-mark-done-${f.id}`} />
          </span>
        </div>
      ))}
    </div>
  );
}

function FissuresCard({ fissures, onMarkDone }) {
  const normal = fissures?.normal || [];
  const steel = fissures?.steelPath || [];
  return (
    <SectionCard title="Void Fissures">
      <h3 style={{ fontSize: 'var(--wf-font-md)', margin: '6px 0 2px', color: 'var(--wf-text-secondary)' }}>
        Normal <span className={muted}>({normal.length})</span>
      </h3>
      <FissureList fissures={normal} onMarkDone={onMarkDone} />
      <h3 style={{ fontSize: 'var(--wf-font-md)', margin: '12px 0 2px', color: 'var(--wf-text-secondary)' }}>
        Steel Path <span className={muted}>({steel.length})</span>
      </h3>
      <FissureList fissures={steel} onMarkDone={onMarkDone} />
    </SectionCard>
  );
}

function InvasionsCard({ invasions, onMarkDone }) {
  return (
    <SectionCard title="Invasions">
      {!invasions || !invasions.length ? (
        <Empty>None active</Empty>
      ) : (
        invasions.map((inv) => (
          <div key={inv.id} style={{ margin: '6px 0', fontSize: 'var(--wf-font-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span>
                <strong style={{ color: 'var(--wf-text)' }}>{inv.node}</strong>
                {inv.completion != null && <span className={muted}> · {inv.completion}%</span>}
              </span>
              <MarkDoneButton onClick={() => onMarkDone(inv.id, null)} testId={`ws-mark-done-${inv.id}`} />
            </div>
            <div className={muted} style={{ fontSize: 'var(--wf-font-xs)' }}>
              {inv.attackerReward || '—'} <span aria-hidden>vs</span> {inv.defenderReward || '—'}
            </div>
          </div>
        ))
      )}
    </SectionCard>
  );
}

function ArbitrationCard({ arbitration, onMarkDone }) {
  return (
    <SectionCard
      title="Arbitration"
      expiry={arbitration ? arbitration.expiry : undefined}
      onMarkDone={arbitration ? onMarkDone : undefined}
    >
      {arbitration ? (
        <p style={{ margin: '4px 0' }}>
          <strong style={accent}>{arbitration.type}</strong>
          <span className={muted}> · {arbitration.node}</span>
          {arbitration.enemy && <div className={muted} style={{ fontSize: 'var(--wf-font-xs)' }}>{arbitration.enemy}</div>}
        </p>
      ) : (
        <Empty>No active arbitration</Empty>
      )}
    </SectionCard>
  );
}

const CYCLE_META = [
  ['cetus', 'Plains of Eidolon'],
  ['vallis', 'Orb Vallis'],
  ['cambion', 'Cambion Drift'],
  ['duviri', 'Duviri'],
];

function CyclesCard({ cycles }) {
  if (!cycles) return null;
  return (
    <SectionCard title="World Cycles">
      {CYCLE_META.map(([key, label]) => {
        const c = cycles[key];
        return (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--wf-font-sm)', margin: '4px 0' }}>
            <span>
              {label}
              {c?.state && <span className="badge" style={{ marginLeft: 6, textTransform: 'capitalize' }}>{c.state}</span>}
            </span>
            <span className={muted} style={{ whiteSpace: 'nowrap' }}>
              {c ? <Countdown expiry={c.expiry} /> : '—'}
            </span>
          </div>
        );
      })}
    </SectionCard>
  );
}

function DarvoCard({ darvoDeal, onMarkDone }) {
  if (!darvoDeal) return null;
  const soldOut = darvoDeal.total != null && darvoDeal.sold != null && darvoDeal.sold >= darvoDeal.total;
  return (
    <SectionCard title="Darvo's Deal" expiry={darvoDeal.expiry} expiryPrefix="ends in " onMarkDone={onMarkDone}>
      <p style={{ margin: '4px 0' }}>
        <strong style={accent}>{darvoDeal.item}</strong>
      </p>
      <p className={muted} style={{ margin: '2px 0', fontSize: 'var(--wf-font-sm)' }}>
        {darvoDeal.salePrice != null && <span style={{ color: 'var(--wf-text)' }}>{darvoDeal.salePrice}p</span>}
        {darvoDeal.originalPrice != null && (
          <span style={{ textDecoration: 'line-through', marginLeft: 6 }}>{darvoDeal.originalPrice}p</span>
        )}
        {darvoDeal.discount != null && <span className="badge" style={{ marginLeft: 6 }}>-{darvoDeal.discount}%</span>}
      </p>
      {darvoDeal.total != null && (
        <p className={muted} style={{ margin: '2px 0', fontSize: 'var(--wf-font-xs)' }}>
          {soldOut ? 'Sold out' : `${darvoDeal.sold ?? 0} / ${darvoDeal.total} sold`}
        </p>
      )}
    </SectionCard>
  );
}

function ArchimedeaCard({ arch, onMarkDone }) {
  return (
    <SectionCard title={arch.label} expiry={arch.expiry} expiryPrefix="resets in " onMarkDone={onMarkDone}>
      {arch.missions.map((m, i) => (
        <MissionRow key={i} primary={m.missionType} secondary={m.deviation || undefined} />
      ))}
      {arch.personalModifiers.length > 0 && (
        <p className={muted} style={{ marginTop: 8, fontSize: 'var(--wf-font-xs)' }}>
          Modifiers: {arch.personalModifiers.map((p) => p.name).filter(Boolean).join(', ')}
        </p>
      )}
    </SectionCard>
  );
}

// --- "mark done" (hide until reset) -----------------------------------------

// Flattens every dismissable event currently present in `data` to {id, label}
// pairs — used both to know which sections to hide and to label entries in
// the "Hidden events" bar so a user can unhide them before their own reset.
function collectDismissableEvents(data) {
  if (!data) return [];
  const events = [];
  if (data.sortie) events.push({ id: data.sortie.id, label: `Sortie: ${data.sortie.boss}` });
  if (data.archonHunt) events.push({ id: data.archonHunt.id, label: `Archon Hunt: ${data.archonHunt.boss}` });
  if (data.steelPath) events.push({ id: data.steelPath.id, label: 'Steel Path' });
  if (data.arbitration) events.push({ id: data.arbitration.id, label: `Arbitration: ${data.arbitration.node}` });
  if (data.voidTrader) events.push({ id: data.voidTrader.id, label: data.voidTrader.character });
  if (data.darvoDeal) events.push({ id: data.darvoDeal.id, label: `Darvo: ${data.darvoDeal.item}` });
  for (const arch of data.archimedeas || []) events.push({ id: arch.id, label: arch.label });
  for (const f of [...(data.fissures?.normal || []), ...(data.fissures?.steelPath || [])]) {
    events.push({ id: f.id, label: `Fissure: ${f.tier} · ${f.node}` });
  }
  for (const inv of data.invasions || []) events.push({ id: inv.id, label: `Invasion: ${inv.node}` });
  return events;
}

function HiddenEventsBar({ hidden, onUnhide }) {
  if (!hidden.length) return null;
  return (
    <div className="card" data-testid="ws-hidden-events" style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 'var(--wf-font-md)' }}>Hidden events ({hidden.length})</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {hidden.map((e) => (
          <span
            key={e.id}
            className="badge"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            data-testid={`ws-hidden-${e.id}`}
          >
            {e.label}
            <button
              type="button"
              className="btn"
              style={{ padding: '1px 6px', fontSize: 'var(--wf-font-xs)' }}
              onClick={() => onUnhide(e.id)}
              data-testid={`ws-unhide-${e.id}`}
            >
              Unhide
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// --- page -------------------------------------------------------------------

function WorldStatePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/worldstate');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDismissed = useCallback(async () => {
    try {
      const res = await fetch('/api/worldstate/dismissed');
      if (!res.ok) return;
      const json = await res.json();
      setDismissedIds(new Set((json.data || []).map((d) => d.event_id)));
    } catch {
      // best effort — worldstate itself still renders without hide state
    }
  }, []);

  const markDone = useCallback((id, expiry) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    fetch('/api/worldstate/dismissed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: id, expiry: expiry || null }),
    }).catch(() => {});
  }, []);

  const unhide = useCallback((id) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    fetch(`/api/worldstate/dismissed/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadDismissed();
    const id = setInterval(load, REFRESH_MS);
    const onFocus = () => {
      if (document.visibilityState !== 'hidden') load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load, loadDismissed]);

  const isHidden = (id) => dismissedIds.has(id);
  const allEvents = collectDismissableEvents(data);
  const hiddenEvents = allEvents.filter((e) => isHidden(e.id));

  const visibleFissures = data && {
    normal: (data.fissures?.normal || []).filter((f) => !isHidden(f.id)),
    steelPath: (data.fissures?.steelPath || []).filter((f) => !isHidden(f.id)),
  };
  const visibleInvasions = data && (data.invasions || []).filter((inv) => !isHidden(inv.id));

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 14,
    alignItems: 'start',
  };

  return (
    <div>
      <div className="detail-header" style={{ marginBottom: 14, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, ...accent }}>World State</h1>
        {data?.stale && (
          <span className="badge blocked" data-testid="ws-stale" title="Showing last cached data — live source unavailable">
            stale
          </span>
        )}
      </div>

      {loading && !data && (
        <div style={gridStyle}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div className="card" key={i}>
              <div className="skeleton" style={{ height: 18, width: 120, margin: '2px 0 10px' }} />
              <div className="skeleton" style={{ height: 14, width: 180, margin: '6px 0' }} />
              <div className="skeleton" style={{ height: 14, width: 140 }} />
            </div>
          ))}
        </div>
      )}

      {error && !data && (
        <div className="card" data-testid="ws-error">
          <p>Couldn&rsquo;t load live world state.</p>
          <button className="btn" onClick={load}>Retry</button>
        </div>
      )}

      {data && <HiddenEventsBar hidden={hiddenEvents} onUnhide={unhide} />}

      {data && (
        <div style={gridStyle}>
          {!isHidden(data.sortie?.id) && (
            <SortieCard sortie={data.sortie} onMarkDone={() => markDone(data.sortie.id, data.sortie.expiry)} />
          )}
          {!isHidden(data.archonHunt?.id) && (
            <ArchonCard archonHunt={data.archonHunt} onMarkDone={() => markDone(data.archonHunt.id, data.archonHunt.expiry)} />
          )}
          {!isHidden(data.steelPath?.id) && (
            <SteelPathCard steelPath={data.steelPath} onMarkDone={() => markDone(data.steelPath.id, data.steelPath.expiry)} />
          )}
          {!isHidden(data.voidTrader?.id) && (
            <BaroCard voidTrader={data.voidTrader} onMarkDone={() => markDone(data.voidTrader.id, data.voidTrader.expiry)} />
          )}
          <CyclesCard cycles={data.cycles} />
          {!isHidden(data.arbitration?.id) && (
            <ArbitrationCard arbitration={data.arbitration} onMarkDone={data.arbitration ? () => markDone(data.arbitration.id, data.arbitration.expiry) : undefined} />
          )}
          <InvasionsCard invasions={visibleInvasions} onMarkDone={markDone} />
          {!isHidden(data.darvoDeal?.id) && (
            <DarvoCard darvoDeal={data.darvoDeal} onMarkDone={() => markDone(data.darvoDeal.id, data.darvoDeal.expiry)} />
          )}
          {(data.archimedeas || [])
            .filter((arch) => !isHidden(arch.id))
            .map((arch) => (
              <ArchimedeaCard key={arch.id} arch={arch} onMarkDone={() => markDone(arch.id, arch.expiry)} />
            ))}
          <FissuresCard fissures={visibleFissures} onMarkDone={markDone} />
        </div>
      )}
    </div>
  );
}

export default WorldStatePage;
