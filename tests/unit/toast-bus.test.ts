import { describe, it, expect } from 'vitest';
import { subscribeToasts, pushToast, toast } from '../../src/toast/toast-bus.ts';

describe('toast-bus', () => {
  it('delivers a pushed toast to subscribers', () => {
    const received = [];
    const unsub = subscribeToasts((t) => received.push(t));
    pushToast({ type: 'success', message: 'Saved' });
    unsub();
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'success', message: 'Saved' });
    expect(typeof received[0].id).toBe('number');
  });

  it('assigns unique, incrementing ids', () => {
    const ids = [];
    const unsub = subscribeToasts((t) => ids.push(t.id));
    pushToast({ message: 'a' });
    pushToast({ message: 'b' });
    unsub();
    expect(ids[0]).toBeLessThan(ids[1]);
  });

  it('defaults the type to info', () => {
    let got;
    const unsub = subscribeToasts((t) => { got = t; });
    pushToast({ message: 'hi' });
    unsub();
    expect(got.type).toBe('info');
  });

  it('stops delivering after unsubscribe', () => {
    const received = [];
    const unsub = subscribeToasts((t) => received.push(t));
    unsub();
    pushToast({ message: 'x' });
    expect(received).toHaveLength(0);
  });

  it('broadcasts to multiple subscribers', () => {
    const a = [];
    const b = [];
    const ua = subscribeToasts((t) => a.push(t));
    const ub = subscribeToasts((t) => b.push(t));
    pushToast({ message: 'broadcast' });
    ua();
    ub();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('convenience helpers set the type and return an id', () => {
    const received = [];
    const unsub = subscribeToasts((t) => received.push(t));
    const id1 = toast.success('ok');
    const id2 = toast.error('bad');
    const id3 = toast.info('fyi');
    unsub();
    expect(received.map((t) => t.type)).toEqual(['success', 'error', 'info']);
    expect(typeof id1).toBe('number');
    expect(id2).toBeGreaterThan(id1);
    expect(id3).toBeGreaterThan(id2);
  });

  it('passes a duration override through to subscribers', () => {
    let got;
    const unsub = subscribeToasts((t) => { got = t; });
    toast.error('sticky', { duration: 0 });
    unsub();
    expect(got.duration).toBe(0);
  });

  it('is a no-op with no subscribers (safe for repositories)', () => {
    expect(() => toast.error('nobody listening')).not.toThrow();
  });
});
