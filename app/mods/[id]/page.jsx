'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import modRepo from '../../../src/data/mod-store.ts';

function ModDetailPage({ params }) {
  const routeParams = useParams();
  const id = params?.id || routeParams?.id;
  const [mod, setMod] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    async function load() {
      const data = await modRepo.getModById(id);
      setMod(data);
      setLoading(false);
    }
    load();
  }, [id]);

  const handleOwnedToggle = useCallback(async () => {
    if (!mod) return;
    const newOwned = !mod.owned;
    await modRepo.setModOwned(mod.id, newOwned);
    const updated = await modRepo.getModById(mod.id);
    setMod(updated);
  }, [mod]);

  const handleRankChange = useCallback(async (e) => {
    if (!mod) return;
    const newRank = parseInt(e.target.value, 10);
    await modRepo.setModRank(mod.id, newRank);
    const updated = await modRepo.getModById(mod.id);
    setMod(updated);
  }, [mod]);

  // ── Loading skeleton ──────────────────────────────────────

  if (loading || !id) {
    return (
      <div data-testid="mod-detail-loading" className="detail">
        <div className="skeleton" style={{ height: 28, width: 320, margin: '0 0 14px' }} />
        <div className="skeleton" style={{ height: 18, width: 180, margin: '0 0 14px' }} />
        <div className="card">
          <div className="skeleton" style={{ height: 16, width: 160, margin: '0 0 10px' }} />
          <div className="skeleton" style={{ height: 16, width: 240 }} />
        </div>
        <div className="card">
          <div className="skeleton" style={{ height: 16, width: 120, margin: '0 0 10px' }} />
          <div className="skeleton" style={{ height: 16, width: 200 }} />
        </div>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────

  if (!mod) {
    return (
      <p data-testid="mod-detail-not-found" className="muted">
        Mod not found.{' '}
        <Link href="/mods">← Back to Mods</Link>
      </p>
    );
  }

  // ── Mod loaded ────────────────────────────────────────────

  const isUnrankable = mod.fusion_limit === 0;

  return (
    <div data-testid="mod-detail-page" className="detail">
      <div style={{ marginBottom: 14 }}>
        <Link href="/mods" style={{ color: '#7cc4ff', textDecoration: 'none', fontSize: 14 }}>
          ← Back to Mods
        </Link>
      </div>

      {/* Header */}
      <div className="detail-header">
        <div>
          <h1 data-testid="mod-detail-name" style={{ margin: '0 0 8px', fontSize: 22, color: '#ffcf6a' }}>
            {mod.name}
          </h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span data-testid="mod-detail-type-badge" className="badge">{mod.mod_type}</span>
            <span data-testid="mod-detail-rarity-badge" className="badge">{mod.rarity}</span>
            <span data-testid="mod-detail-polarity-badge" className="badge">{mod.polarity}</span>
            {mod.is_prime && <span className="badge">Prime</span>}
            {mod.is_augment && <span className="badge">Augment</span>}
            {mod.is_umbral && <span className="badge">Umbral</span>}
          </div>
        </div>
      </div>

      {/* Stats card */}
      <div data-testid="mod-detail-stats" className="card" style={{ marginTop: 14 }}>
        <h2>Mod Stats</h2>
        <p>Base Drain: {mod.base_drain}</p>
        <p>Max Rank: {mod.fusion_limit}</p>
        <p>
          Compatible with:{' '}
          {mod.compat_name || 'All compatible weapons'}
        </p>
      </div>

      {/* Collection card */}
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Collection</h2>

        {/* Owned toggle */}
        <label data-testid="mod-detail-owned-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={mod.owned}
            onChange={handleOwnedToggle}
            aria-label={`Toggle owned for ${mod.name}`}
          />
          <span style={{ fontSize: 14, color: '#c9cdd8' }}>Owned</span>
        </label>

        {/* Rank slider — only when owned and rankable */}
        {mod.owned && !isUnrankable && (
          <div style={{ marginTop: 10 }}>
            <input
              data-testid="mod-detail-rank-slider"
              type="range"
              min="0"
              max={mod.fusion_limit}
              value={mod.rank}
              onChange={handleRankChange}
              style={{ width: '100%' }}
              aria-label={`Rank for ${mod.name}`}
            />
            <div data-testid="mod-detail-rank-value" style={{ fontSize: 14, color: '#c9cdd8', marginTop: 4 }}>
              Rank {mod.rank} / {mod.fusion_limit}
            </div>
          </div>
        )}

        {/* Not owned text */}
        {!mod.owned && !isUnrankable && (
          <p style={{ fontSize: 14, color: '#8a91a0', margin: '8px 0 0' }}>Not owned</p>
        )}

        {/* Unrankable text */}
        {isUnrankable && (
          <p style={{ fontSize: 14, color: '#8a91a0', margin: '8px 0 0' }}>Unrankable</p>
        )}
      </div>

      {/* Wiki link */}
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Resources</h2>
        <p>
          Wiki:{' '}
          <a
            data-testid="mod-detail-wiki-link"
            href={mod.wiki_url}
            target="_blank"
            rel="noreferrer"
          >
            {mod.wiki_url}
          </a>
        </p>
      </div>
    </div>
  );
}

export default ModDetailPage;
