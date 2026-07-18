// @ts-nocheck
'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import repo from '../../src/data/store.ts';

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

  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    repo.getAllSources().then((data) => {
      setSources(data);
      setLoading(false);
    });
  }, []);

  const grouped = useMemo(() => groupBy(sources, 'material_name'), [sources]);

  const materialNames = Object.keys(grouped).sort();

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ height: 28, width: 160, margin: '0 0 14px' }} />
        <div className="card">
          <div className="skeleton" style={{ height: 16, width: 120, margin: '0 0 10px' }} />
          <div className="skeleton" style={{ height: 16, width: 200 }} />
        </div>
      </div>
    );
  }

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
            {' '}
            <a
              href={`https://wiki.warframe.com/w/${encodeURIComponent(mat.replace(/ /g, '_'))}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12 }}
            >
              wiki &rarr;
            </a>
          </h2>
          <div className="table-scroll">
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
        </div>
      ))}
    </div>
  );
}

function Sources() {
  return (
    <Suspense fallback={
      <div>
        <div className="skeleton" style={{ height: 28, width: 160, margin: '0 0 14px' }} />
        <div className="card">
          <div className="skeleton" style={{ height: 16, width: 120, margin: '0 0 10px' }} />
          <div className="skeleton" style={{ height: 16, width: 200 }} />
        </div>
        <div className="card">
          <div className="skeleton" style={{ height: 16, width: 140, margin: '0 0 10px' }} />
          <div className="skeleton" style={{ height: 16, width: 180 }} />
        </div>
      </div>
    }>
      <SourcesInner />
    </Suspense>
  );
}

export default Sources;
