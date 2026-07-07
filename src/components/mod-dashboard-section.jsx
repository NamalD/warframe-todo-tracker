'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import modRepo from '../data/mod-store.js';

export default function ModDashboardSection() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    modRepo
      .getMods()
      .then(() => {
        if (cancelled) return;
        setStats(modRepo.getStats());
        setLoading(false);
      })
      .catch(() => {
        // Silent fail — mods are non-critical
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Loading state: skeleton bar
  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 28 }} data-testid="mod-dashboard-section">
        <div className="skeleton" style={{ height: 18, width: 160, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 8 }} />
      </div>
    );
  }

  // Error / not loaded — render nothing
  if (!stats) return null;

  // Empty state
  if (stats.total === 0) {
    return (
      <div className="card" style={{ marginBottom: 28 }} data-testid="mod-dashboard-section">
        <h2 style={{ fontSize: 18, color: '#ffcf6a', marginBottom: 14 }}>Mod Collection</h2>
        <p>
          Your mod collection is empty.{' '}
          <Link href="/mods" data-testid="mod-dashboard-link">
            Start tracking &rarr;
          </Link>
        </p>
      </div>
    );
  }

  // Normal state
  const pct = (stats.owned / stats.total) * 100;

  return (
    <div className="card" style={{ marginBottom: 28 }} data-testid="mod-dashboard-section">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
        }}
      >
        <h2 style={{ fontSize: 18, color: '#ffcf6a', margin: 0 }}>Mod Collection</h2>
        <Link href="/mods" data-testid="mod-dashboard-link">
          Browse all mods &rarr;
        </Link>
      </div>
      <div
        data-testid="mod-dashboard-stats"
        style={{ marginBottom: 8, fontSize: 14, color: '#e7e9ee' }}
      >
        <strong>
          {stats.owned} / {stats.total.toLocaleString()} owned
        </strong>
      </div>
      <div className="progress-bar">
        <div className="progress-fill done" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
