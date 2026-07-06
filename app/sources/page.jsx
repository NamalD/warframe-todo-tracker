'use client';
import React, { useMemo } from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import repo from '../../src/data/store.js';

function groupBy(arr, key) {
  return arr.reduce((acc, curr) => {
    const k = curr[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(curr);
    return acc;
  }, {});
}

function SourcesInner() {
  const searchParams = useSearchParams();
  const highlight = searchParams.get('material');

  const sources = repo.getAllSources();
  const grouped = useMemo(() => groupBy(sources, 'material_name'), [sources]);

  const materialNames = Object.keys(grouped).sort();

  if (materialNames.length === 0) {
    return <p className="muted">No sources on record.</p>;
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 14px', fontSize: 22, color: '#ffcf6a' }}>Sources</h1>
      {materialNames.map((mat) => (
        <div className="card" key={mat}>
          <h2>
            <Link href={`/sources?material=${encodeURIComponent(mat)}`} style={{ color: 'inherit' }}>
              {mat}
            </Link>
          </h2>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Location</th>
                <th>Drop chance</th>
              </tr>
            </thead>
            <tbody>
              {grouped[mat].map((s) => (
                <tr key={s.id} style={s.material_name === highlight ? { background: '#1b2030' } : undefined}>
                  <td>{s.source_name}</td>
                  <td>{s.source_type}</td>
                  <td>{s.location_details}</td>
                  <td>{(s.drop_chance_pct ?? 0).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Sources() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SourcesInner />
    </Suspense>
  );
}

export default Sources;
