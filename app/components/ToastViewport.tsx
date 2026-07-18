// @ts-nocheck
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToasts } from '../../src/toast/toast-bus.ts';

// Per-type auto-dismiss defaults (ms). Errors linger a little longer so the
// user has time to notice something went wrong. A per-toast `duration` of 0 or
// Infinity makes the toast sticky (no auto-dismiss).
const DEFAULT_DURATION = { success: 4000, info: 4000, error: 6000 };

const ICONS = { success: '✓', error: '⚠', info: 'ℹ' };

export default function ToastViewport() {
  const [toasts, setToasts] = useState([]);
  // Synchronous mirror of `toasts` so the bus callback can dedup against the
  // latest list without waiting for a re-render.
  const listRef = useRef([]);
  const timers = useRef(new Map());

  const setList = useCallback((next) => {
    listRef.current = next;
    setToasts(next);
  }, []);

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setList(listRef.current.filter((t) => t.id !== id));
  }, [setList]);

  const schedule = useCallback((id, duration) => {
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    if (duration > 0 && Number.isFinite(duration)) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    } else {
      timers.current.delete(id);
    }
  }, [dismiss]);

  useEffect(() => {
    const unsubscribe = subscribeToasts((incoming) => {
      const duration = incoming.duration ?? DEFAULT_DURATION[incoming.type] ?? 4000;
      // Coalesce repeats of the same message (e.g. a failing sync retried on
      // every keystroke) into one toast whose timer is refreshed.
      const dupe = listRef.current.find(
        (t) => t.type === incoming.type && t.message === incoming.message,
      );
      if (dupe) {
        schedule(dupe.id, duration);
        return;
      }
      setList([
        ...listRef.current,
        { id: incoming.id, type: incoming.type, message: incoming.message },
      ]);
      schedule(incoming.id, duration);
    });
    const activeTimers = timers.current;
    return () => {
      unsubscribe();
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
    };
  }, [schedule, setList]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} data-testid="toast" data-toast-type={t.type}>
          <span className="toast-icon" aria-hidden="true">{ICONS[t.type] || ICONS.info}</span>
          <span className="toast-message">{t.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
