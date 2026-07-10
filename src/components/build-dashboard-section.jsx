'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import BuildRepository from '../data/build-repository.ts';

export default function BuildDashboardSection() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const br = new BuildRepository();
    setSummary(br.getDashboardSummary());
    setLoading(false);
  }, []);

  if (loading) return null;

  // Filter to builds that need attention (unacquired build or unacquired requirements)
  const activeBuilds = (summary || []).filter(
    (entry) => !entry.acquired || entry.unacquired_reqs.length > 0
  );

  if (activeBuilds.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, color: '#ffcf6a', marginBottom: 14 }}>
        Build Progress
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {activeBuilds.map((entry) => (
          <div className="card" key={entry.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Link href={`/builds/${entry.id}`} style={{ fontSize: 15, fontWeight: 600 }}>
                {entry.name}
              </Link>
              <span className="badge">
                {entry.acquired ? `${entry.unacquired_reqs.length} reqs needed` : 'Build needed'}
              </span>
            </div>

            {!entry.acquired && (
              <div style={{ marginBottom: 6 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Item not yet acquired</div>
              </div>
            )}

            {entry.unacquired_reqs.length > 0 && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Unacquired Requirements:</div>
                {entry.unacquired_reqs.map((req) => (
                  <div key={req.requirement_id} style={{ fontSize: 13, padding: '2px 0' }}>
                    — {req.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
