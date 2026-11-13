import { DatabaseConnection } from '../database/connection';

export interface RelayQueueRecord {
  eventId: string;
  peerFingerprint: string;
  priority: number;
  attemptCount: number;
  nextAttemptAt: number;
  acknowledgedAt: number | null;
}

export class RelayQueueRepository {
  constructor(private db: DatabaseConnection) {}

  async enqueue(
    eventId: string,
    peerFingerprint: string,
    priority: number,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `INSERT INTO relay_queue (
        event_id, peer_fingerprint, priority, attempt_count,
        next_attempt_at, acknowledged_at
      ) VALUES (?, ?, ?, 0, ?, NULL)
      ON CONFLICT(event_id, peer_fingerprint) DO NOTHING;`,
      [eventId, peerFingerprint, priority, Date.now()]
    );
  }

  async getDueItems(
    peerFingerprint: string,
    now = Date.now(),
    limit = 50,
    tx?: DatabaseConnection
  ): Promise<RelayQueueRecord[]> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT * FROM relay_queue
       WHERE peer_fingerprint = ? AND acknowledged_at IS NULL AND next_attempt_at <= ?
       ORDER BY priority DESC, next_attempt_at ASC
       LIMIT ?;`,
      [peerFingerprint, now, limit]
    );

    return rows.map((r) => ({
      eventId: r.event_id,
      peerFingerprint: r.peer_fingerprint,
      priority: r.priority,
      attemptCount: r.attempt_count,
      nextAttemptAt: r.next_attempt_at,
      acknowledgedAt: r.acknowledged_at
    }));
  }

  async acknowledge(
    eventId: string,
    peerFingerprint: string,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `UPDATE relay_queue SET acknowledged_at = ? WHERE event_id = ? AND peer_fingerprint = ?;`,
      [Date.now(), eventId, peerFingerprint]
    );
  }
}
