// @ts-nocheck
'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.replace('/');
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid password');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#0d1117',
      color: '#e7e9ee',
    }}>
      <div style={{ width: 320 }}>
        <h1 style={{ textAlign: 'center', color: '#ffcf6a', marginBottom: 24, fontSize: 22 }}>
          Warframe Tracker
        </h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            style={{
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #2e3440',
              background: '#161b22',
              color: '#e7e9ee',
              fontSize: 14,
            }}
          />
          {error && (
            <span style={{ color: '#eb5757', fontSize: 13 }}>{error}</span>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="btn primary"
            style={{ justifyContent: 'center' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
