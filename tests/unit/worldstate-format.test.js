import { describe, it, expect } from 'vitest';
import { formatDuration } from '../../app/worldstate/format.js';

describe('formatDuration', () => {
  it('formats multi-day durations with zero-padded lower units', () => {
    expect(formatDuration((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000)).toBe('2d 03h 04m 05s');
  });

  it('formats hours + minutes + seconds', () => {
    expect(formatDuration((2 * 3600 + 5 * 60 + 30) * 1000)).toBe('2h 05m 30s');
  });

  it('drops higher units when zero', () => {
    expect(formatDuration((45 * 60 + 12) * 1000)).toBe('45m 12s');
    expect(formatDuration(8 * 1000)).toBe('8s');
  });

  it('returns Expired for zero, negative, and non-finite input', () => {
    expect(formatDuration(0)).toBe('Expired');
    expect(formatDuration(-5000)).toBe('Expired');
    expect(formatDuration(NaN)).toBe('Expired');
    expect(formatDuration(Infinity)).toBe('Expired');
    expect(formatDuration('nope')).toBe('Expired');
  });
});
