'use client';
import { useEffect, useState } from 'react';
import { formatDuration } from './format';

// A single shared 1s clock drives every countdown on the page, instead of each
// <Countdown> owning its own interval (the Fissures card alone renders ~28).
let sharedNow = Date.now();
const subscribers = new Set();
let timer = null;

function subscribe(cb) {
  subscribers.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      sharedNow = Date.now();
      subscribers.forEach((fn) => fn(sharedNow));
    }, 1000);
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function useNow() {
  const [now, setNow] = useState(sharedNow);
  useEffect(() => subscribe(setNow), []);
  return now;
}

/**
 * Live-ticking countdown to `expiry` (ISO string), driven by the shared clock so
 * the display stays smooth between the page's 60s data refetches.
 */
export default function Countdown({ expiry, prefix = '', className }) {
  const now = useNow();

  if (!expiry) return <span className={className}>—</span>;

  const label = formatDuration(new Date(expiry).getTime() - now);
  return (
    <span className={className} data-testid="countdown">
      {prefix}
      {label}
    </span>
  );
}
