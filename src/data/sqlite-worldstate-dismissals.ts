/**
 * SQLite CRUD module for the worldstate_dismissed table — "mark done" state
 * for world state dashboard events (#167).
 *
 * A dismissed row's `expiry` mirrors the underlying event's own expiry at the
 * moment it was dismissed (null for events with no expiry, e.g. invasions).
 * Once that expiry passes, the event has reset upstream, so the dismissal is
 * purged and the (new) event auto-shows again.
 *
 * This module is server-only — never import in client components.
 */
import 'server-only';
import type { Database } from 'better-sqlite3';

interface DismissedRow {
  event_id: string;
  expiry: string | null;
  dismissed_at: string;
}

function purgeExpired(db: Database): void {
  db.prepare(
    `DELETE FROM worldstate_dismissed WHERE expiry IS NOT NULL AND expiry <= ?`
  ).run(new Date().toISOString());
}

export function getDismissedEvents(db: Database): DismissedRow[] {
  purgeExpired(db);
  return db.prepare(
    `SELECT event_id, expiry, dismissed_at FROM worldstate_dismissed ORDER BY dismissed_at`
  ).all() as DismissedRow[];
}

export function dismissEvent(db: Database, eventId: string, expiry: string | null): DismissedRow {
  db.prepare(
    `INSERT INTO worldstate_dismissed (event_id, expiry, dismissed_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(event_id) DO UPDATE SET expiry = excluded.expiry, dismissed_at = excluded.dismissed_at`
  ).run(eventId, expiry ?? null);
  return db.prepare(
    `SELECT event_id, expiry, dismissed_at FROM worldstate_dismissed WHERE event_id = ?`
  ).get(eventId) as DismissedRow;
}

export function undismissEvent(db: Database, eventId: string): { success: true } | { notFound: true } {
  const row = db.prepare('SELECT event_id FROM worldstate_dismissed WHERE event_id = ?').get(eventId);
  if (!row) return { notFound: true };
  db.prepare('DELETE FROM worldstate_dismissed WHERE event_id = ?').run(eventId);
  return { success: true };
}
