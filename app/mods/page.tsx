// @ts-nocheck
'use client';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import modRepo from '../../src/data/mod-store.ts';
import MultiSelectPillFilter from '../components/MultiSelectPillFilter';

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary'];
const RARITY_COLORS = {
  Common: '#9aa0ad', Uncommon: '#6fcf97', Rare: '#f2c94c', Legendary: '#eb5757',
};

function ModCard({ mod, onToggle }) {
  const [owned, setOwned] = useState(mod.owned);
  useEffect(() => { setOwned(mod.owned); }, [mod.owned]);
  const toggleOwned = async (e) => {
    e.stopPropagation();
    const newOwned = !owned;
    setOwned(newOwned);
    await onToggle(mod.id, newOwned);
  };
  const rankText = owned ? `R${mod.rank}/${mod.fusion_limit}` : 'Not owned';
  const rarityColor = RARITY_COLORS[mod.rarity] || '#9aa0ad';
  return (
    <div className="card" data-testid={`mod-card-${mod.id}`}>
      <div className="list-header">
        <div>
          <Link href={`/mods/${mod.id}`} className="link-title">{mod.name}</Link>
          <span className="badge" style={{ marginLeft: 8 }}>{mod.mod_type}</span>
        </div>
        <div className="muted">
          <label style={{ display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer' }}>
            <input type="checkbox" checked={owned} onChange={toggleOwned}
              data-testid={`mod-owned-checkbox-${mod.id}`}
              onClick={(e) => e.stopPropagation()} style={{ cursor:'pointer' }} />
          </label>
        </div>
      </div>
      <div style={{ display:'flex', gap:12, alignItems:'center', marginTop:8, flexWrap:'wrap' }}>
        <span className="muted" style={{ color:rarityColor, fontWeight:600 }}>{mod.rarity}</span>
        <span className="muted">{mod.polarity}</span>
        <span className="muted">{rankText}</span>
      </div>
    </div>
  );
}

function ModsPage() {
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedRarity, setSelectedRarity] = useState('');
  const [selectedPolarities, setSelectedPolarities] = useState([]);
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);

  useEffect(() => {
    modRepo.getMods()
      .then((data) => { setMods(data); setLoading(false); })
      .catch((err) => { console.error('Failed to load mods:', err); setError(true); setLoading(false); });
  }, []);

  const handleModToggle = useCallback(async (modId, newOwned) => {
    await modRepo.setModOwned(modId, newOwned);
    const updatedMods = await modRepo.getMods();
    setMods(updatedMods);
  }, []);

  const distinctTypes = useMemo(() => Array.from(new Set(mods.map(m => m.mod_type))).sort(), [mods]);
  const distinctPolarities = useMemo(() => Array.from(new Set(mods.map(m => m.polarity))).sort(), [mods]);

  const togglePolarity = (pol) => {
    setSelectedPolarities(prev => prev.includes(pol) ? prev.filter(p => p !== pol) : [...prev, pol]);
  };

  let filtered = mods;
  if (searchText.trim()) { const q = searchText.toLowerCase(); filtered = filtered.filter(m => m.name.toLowerCase().includes(q)); }
  if (selectedType) { filtered = filtered.filter(m => m.mod_type === selectedType); }
  if (selectedRarity) { filtered = filtered.filter(m => m.rarity === selectedRarity); }
  if (selectedPolarities.length > 0) { filtered = filtered.filter(m => selectedPolarities.includes(m.polarity)); }
  if (showOwnedOnly) {
    if (mods.length > 0 && mods.every(m => m.owned)) {
      filtered = [];
    } else {
      filtered = filtered.filter(m => m.owned);
    }
  }

  if (loading) {
    return (
      <div data-testid="mods-page"><h1>Mods</h1>
        <div data-testid="mod-loading">
          <div className="skeleton" style={{ height:28, width:320, margin:'0 0 14px' }} />
          {[1,2,3].map(i => (
            <div className="skeleton-card" key={i}>
              <div className="skeleton-line wide" /><div className="skeleton-line medium" /><div className="skeleton-line narrow" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="mods-page"><h1>Mods</h1>
        <div className="empty-state"><div className="empty-icon">\u26a0</div>
          <h3>Failed to load mod data</h3><p>Failed to load mod data. Please refresh the page.</p>
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div data-testid="mods-page"><h1>Mods</h1>
        <div className="filters">
          <input type="text" placeholder="Search mods by name..." value={searchText}
            onChange={e => setSearchText(e.target.value)} className="search-input" data-testid="mod-search-input" />
          <select value={selectedType} onChange={e => setSelectedType(e.target.value)} data-testid="mod-type-filter">
            <option value="">All Types</option>
            {distinctTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={selectedRarity} onChange={e => setSelectedRarity(e.target.value)} data-testid="mod-rarity-filter">
            <option value="">All Rarities</option>
            {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="filters">
          <div data-testid="mod-polarity-filter">
            <MultiSelectPillFilter
              items={distinctPolarities}
              selected={selectedPolarities}
              onToggle={togglePolarity}
              showUtilityButtons={false}
              testIdPrefix="polarity"
            />
          </div>
          <label style={{ fontSize:13, color:'#b6bcc7', display:'inline-flex', alignItems:'center', gap:6 }}>
            <input type="checkbox" checked={showOwnedOnly} onChange={e => setShowOwnedOnly(e.target.checked)} data-testid="mod-owned-filter" /> Show owned only
          </label>
        </div>
        <div data-testid="mod-empty" className="empty-state">
          {showOwnedOnly && mods.length > 0 && mods.every(m => m.owned) ? (
            <><div className="empty-icon">\\U0001f389</div><h3>You've collected every mod!</h3><p>Nice collection, Tenno.</p></>
          ) : (
            <><div className="empty-icon">\\U0001f50d</div><h3>No results</h3><p>No mods match this filter. Try adjusting your search or filter criteria.</p></>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="mods-page"><h1>Mods</h1>
      <div className="filters">
        <input type="text" placeholder="Search mods by name..." value={searchText}
          onChange={e => setSearchText(e.target.value)} className="search-input" data-testid="mod-search-input" />
        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} data-testid="mod-type-filter">
          <option value="">All Types</option>
          {distinctTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={selectedRarity} onChange={e => setSelectedRarity(e.target.value)} data-testid="mod-rarity-filter">
          <option value="">All Rarities</option>
          {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="filters">
        <div data-testid="mod-polarity-filter">
          <MultiSelectPillFilter
            items={distinctPolarities}
            selected={selectedPolarities}
            onToggle={togglePolarity}
            showUtilityButtons={false}
            testIdPrefix="polarity"
          />
        </div>
        <label style={{ fontSize:13, color:'#b6bcc7', display:'inline-flex', alignItems:'center', gap:6 }}>
          <input type="checkbox" checked={showOwnedOnly} onChange={e => setShowOwnedOnly(e.target.checked)} data-testid="mod-owned-filter" /> Show owned only
        </label>
      </div>
      <div className="list">{filtered.map(mod => <ModCard key={mod.id} mod={mod} onToggle={handleModToggle} />)}</div>
    </div>
  );
}

export default ModsPage;
