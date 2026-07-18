/**
 * Format a millisecond duration as `Nd Nh Nm Ns`, dropping leading zero units
 * and zero-padding the lower units once a larger one is present (clock look).
 * Returns 'Expired' for non-positive or non-finite input.
 *
 * Examples: 45000 -> "45s", 7530000 -> "2h 05m 30s", 183845000 -> "2d 03h 04m 05s"
 */
export function formatDuration(ms: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return 'Expired';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (d || h) parts.push(`${d ? pad(h) : h}h`);
  if (d || h || m) parts.push(`${d || h ? pad(m) : m}m`);
  parts.push(`${d || h || m ? pad(s) : s}s`);
  return parts.join(' ');
}
