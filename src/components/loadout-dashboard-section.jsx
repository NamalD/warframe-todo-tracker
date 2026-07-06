'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import LoadoutRepository from '../data/loadout-repository.js';
import repo from '../data/store.js';

export default function LoadoutDashboardSection() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const lr = new LoadoutRepository();
    setSummary(lr.getDashboardSummary());
    setLoading(false);
  }, []);

  if (loading) return null;

  // Filter to loadouts that have unacquired items
  const activeLoadouts = (summary || []).filter(
    (entry) => entry.unacquired_slots.length > 0 || entry.unacquired_requirements.length > 0
  );

  if (activeLoadouts.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, color: '#ffcf6a', marginBottom: 14 }}>
        Loadout Progress
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {activeLoadouts.map((entry) => (
          <div className="card" key={entry.loadout_id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Link href={`/loadouts/${entry.loadout_id}`} style={{ fontSize: 15, fontWeight: 600 }}>
                {entry.loadout_name}
              </Link>
              <span className="badge">
                {entry.unacquired_slots.length + entry.unacquired_requirements.length} needed
              </span>
            </div>

            {entry.unacquired_slots.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Unacquired Items:</div>
                {entry.unacquired_slots.map((slot) => {
                  const item = slot.item_id ? repo.getItemById(slot.item_id) : null;
                  const displayName = slot.custom_item_name
                    ? `Custom: ${slot.custom_item_name}`
                    : item ? item.name : 'Empty slot';
                  return (
                    <div key={slot.slot_id} style={{ fontSize: 13, padding: '2px 0' }}>
                      <span className={`badge ${slot.slot_type}`} style={{ marginRight: 6 }}>{slot.slot_type}</span>
                      {item ? (
                        <Link href={`/items/${item.id}`}>{displayName}</Link>
                      ) : (
                        <span>{displayName}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {entry.unacquired_requirements.length > 0 && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Unacquired Requirements:</div>
                {entry.unacquired_requirements.map((req) => (
                  <div key={req.requirement_id} style={{ fontSize: 13, padding: '2px 0' }}>
                    <span className={`badge ${req.slot_type}`} style={{ marginRight: 6, opacity: 0.6 }}>{req.slot_type}</span>
                    <span>— {req.name}</span>
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
