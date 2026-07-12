'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Countdown from './countdown';

const REFRESH_MS = 60_000;
const accent = { color: 'var(--wf-accent)' };
const muted = 'muted';

// --- presentational helpers -------------------------------------------------

function SectionCard({ title, expiry, expiryPrefix, children }) {
  return (
    <div className="card" data-testid={`ws-card-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2>{title}</h2>
        {expiry !== undefined && (
          <span className={muted} style={{ fontSize: 'var(--wf-font-sm)', whiteSpace: 'nowrap' }}>
            <Countdown expiry={expiry} prefix={expiryPrefix} />
          </span>
        )}
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

function SortieCard({ sortie }) {
  if (!sortie) return null;
  return (
    <SectionCard title="Sortie" expiry={sortie.expiry}>
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

function ArchonCard({ archonHunt }) {
  if (!archonHunt) return null;
  return (
    <SectionCard title="Archon Hunt" expiry={archonHunt.expiry}>
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

function SteelPathCard({ steelPath }) {
  if (!steelPath) return null;
  const r = steelPath.currentReward;
  return (
    <SectionCard title="Steel Path" expiry={steelPath.expiry} expiryPrefix="resets in ">
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

function BaroCard({ voidTrader }) {
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

function FissureList({ fissures }) {
  if (!fissures || !fissures.length) return <Empty>None active</Empty>;
  return (
    <div>
      {fissures.map((f, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--wf-font-sm)', margin: '3px 0' }}>
          <span>
            <strong style={accent}>{f.tier}</strong>
            {f.isStorm && <span className="badge" style={{ marginLeft: 4 }}>Storm</span>}
            <span className={muted}> {f.missionType} · {f.node}</span>
          </span>
          <span className={muted} style={{ whiteSpace: 'nowrap' }}><Countdown expiry={f.expiry} /></span>
        </div>
      ))}
    </div>
  );
}

function FissuresCard({ fissures }) {
  const normal = fissures?.normal || [];
  const steel = fissures?.steelPath || [];
  return (
    <SectionCard title="Void Fissures">
      <h3 style={{ fontSize: 'var(--wf-font-md)', margin: '6px 0 2px', color: 'var(--wf-text-secondary)' }}>
        Normal <span className={muted}>({normal.length})</span>
      </h3>
      <FissureList fissures={normal} />
      <h3 style={{ fontSize: 'var(--wf-font-md)', margin: '12px 0 2px', color: 'var(--wf-text-secondary)' }}>
        Steel Path <span className={muted}>({steel.length})</span>
      </h3>
      <FissureList fissures={steel} />
    </SectionCard>
  );
}

function InvasionsCard({ invasions }) {
  return (
    <SectionCard title="Invasions">
      {!invasions || !invasions.length ? (
        <Empty>None active</Empty>
      ) : (
        invasions.map((inv, i) => (
          <div key={i} style={{ margin: '6px 0', fontSize: 'var(--wf-font-sm)' }}>
            <div>
              <strong style={{ color: 'var(--wf-text)' }}>{inv.node}</strong>
              {inv.completion != null && <span className={muted}> · {inv.completion}%</span>}
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

function ArbitrationCard({ arbitration }) {
  return (
    <SectionCard title="Arbitration" expiry={arbitration ? arbitration.expiry : undefined}>
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

function DarvoCard({ darvoDeal }) {
  if (!darvoDeal) return null;
  const soldOut = darvoDeal.total != null && darvoDeal.sold != null && darvoDeal.sold >= darvoDeal.total;
  return (
    <SectionCard title="Darvo's Deal" expiry={darvoDeal.expiry} expiryPrefix="ends in ">
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

function ArchimedeaCard({ arch }) {
  return (
    <SectionCard title={arch.label} expiry={arch.expiry} expiryPrefix="resets in ">
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

// --- page -------------------------------------------------------------------

function WorldStatePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  useEffect(() => {
    load();
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
  }, [load]);

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

      {data && (
        <div style={gridStyle}>
          <SortieCard sortie={data.sortie} />
          <ArchonCard archonHunt={data.archonHunt} />
          <SteelPathCard steelPath={data.steelPath} />
          <BaroCard voidTrader={data.voidTrader} />
          <CyclesCard cycles={data.cycles} />
          <ArbitrationCard arbitration={data.arbitration} />
          <InvasionsCard invasions={data.invasions} />
          <DarvoCard darvoDeal={data.darvoDeal} />
          {(data.archimedeas || []).map((arch, i) => (
            <ArchimedeaCard key={i} arch={arch} />
          ))}
          <FissuresCard fissures={data.fissures} />
        </div>
      )}
    </div>
  );
}

export default WorldStatePage;
