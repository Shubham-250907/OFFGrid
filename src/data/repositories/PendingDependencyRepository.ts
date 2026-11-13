import { DatabaseConnection } from '../database/connection';

export interface PendingDependencyRecord {
  eventId: string;
  dependencyEntityId: string;
  dependencyType: string;
  receivedAt: number;
  retryCount: number;
}

export class PendingDependencyRepository {
  constructor(private db: DatabaseConnection) {}

  async addPendingDependency(
    eventId: string,
    dependencyEntityId: string,
    dependencyType: string,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `INSERT INTO pending_dependencies (
        event_id, dependency_entity_id, dependency_type, received_at, retry_count
      ) VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(event_id) DO UPDATE SET
        retry_count = retry_count + 1;`,
      [eventId, dependencyEntityId, dependencyType, Date.now()]
    );
  }

  async getPendingByEntityId(
    dependencyEntityId: string,
    tx?: DatabaseConnection
  ): Promise<PendingDependencyRecord[]> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT * FROM pending_dependencies WHERE dependency_entity_id = ? ORDER BY received_at ASC;`,
      [dependencyEntityId]
    );
    return rows.map((r) => ({
      eventId: r.event_id,
      dependencyEntityId: r.dependency_entity_id,
      dependencyType: r.dependency_type,
      receivedAt: r.received_at,
      retryCount: r.retry_count
    }));
  }

  async resolvePending(
    eventId: string,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `DELETE FROM pending_dependencies WHERE event_id = ?;`,
      [eventId]
    );
  }

  async getAllPending(tx?: DatabaseConnection): Promise<PendingDependencyRecord[]> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT * FROM pending_dependencies ORDER BY received_at ASC;`
    );
    return rows.map((r) => ({
      eventId: r.event_id,
      dependencyEntityId: r.dependency_entity_id,
      dependencyType: r.dependency_type,
      receivedAt: r.received_at,
      retryCount: r.retry_count
    }));
  }
}
