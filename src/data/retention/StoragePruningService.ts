import { DatabaseConnection } from '../database/connection';

export interface StoragePruneResult {
  prunedChatMessages: number;
  prunedExpiredEvents: number;
  activeCriticalEventsPreserved: number;
}

export class StoragePruningService {
  constructor(private db: DatabaseConnection) {}

  /**
   * Prunes non-critical expired data under low storage conditions per PRD Section 13 & 14.
   * Invariant: Never deletes unacknowledged emergency events (SOS, TRIAGE, active INCIDENTS).
   */
  async pruneLowStorage(now = Date.now()): Promise<StoragePruneResult> {
    return this.db.transaction(async (tx) => {
      // 1. Prune expired chat messages that have already been relayed or expired
      const chatRes = await tx.execute(
        `DELETE FROM chat_messages 
         WHERE expires_at < ? AND delivery_state != 'PENDING';`,
        [now]
      );

      // 2. Prune expired non-critical CHAT events not queued for relay
      const eventRes = await tx.execute(
        `DELETE FROM events 
         WHERE event_type = 'CHAT'
           AND event_id NOT IN (SELECT event_id FROM relay_queue)
           AND event_id NOT IN (SELECT event_id FROM chat_messages);`
      );

      // 3. Verify preserved critical events
      const criticalRows = await tx.query<any>(
        `SELECT COUNT(*) as cnt FROM events WHERE event_type IN ('SOS', 'SOS_UPDATE', 'TRIAGE', 'INCIDENT', 'SHELTER');`
      );

      return {
        prunedChatMessages: chatRes.rowsAffected ?? 0,
        prunedExpiredEvents: eventRes.rowsAffected ?? 0,
        activeCriticalEventsPreserved: criticalRows[0]?.cnt ?? 0
      };
    });
  }
}
