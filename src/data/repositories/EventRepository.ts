import { DatabaseConnection } from '../database/connection';
import { PacketType } from '../../mesh/protocol/contracts';
import { IntegrityConflictError } from '../../shared/errors/AppError';

export interface StoredEventRecord {
  event_id: string;
  event_type: PacketType;
  entity_id: string;
  author_public_key: string;
  author_timestamp: number;
  received_at: number;
  protocol_version: number;
  schema_version: number;
  payload_json: string;
  payload_hash: string;
  signature: string; // Base64url encoded representation
  validation_status: 'VALID' | 'INVALID' | 'PENDING_DEPENDENCY';
}

export class EventRepository {
  constructor(private db: DatabaseConnection) {}

  async saveEvent(
    event: StoredEventRecord,
    tx?: DatabaseConnection
  ): Promise<{ inserted: boolean; event: StoredEventRecord }> {
    const conn = tx ?? this.db;

    // Check for existing event with the same event_id
    const existing = await conn.query<{ event_id: string; payload_hash: string }>(
      'SELECT event_id, payload_hash FROM events WHERE event_id = ?;',
      [event.event_id]
    );

    if (existing.length > 0) {
      const existingRecord = existing[0]!;
      if (existingRecord.payload_hash !== event.payload_hash) {
        throw new IntegrityConflictError(
          `Integrity conflict for event ${event.event_id}: matching UUID with different payload hash`
        );
      }
      return { inserted: false, event };
    }

    await conn.execute(
      `INSERT INTO events (
        event_id, event_type, entity_id, author_public_key,
        author_timestamp, received_at, protocol_version, schema_version,
        payload_json, payload_hash, signature, validation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        event.event_id,
        event.event_type,
        event.entity_id,
        event.author_public_key,
        event.author_timestamp,
        event.received_at,
        event.protocol_version,
        event.schema_version,
        event.payload_json,
        event.payload_hash,
        event.signature,
        event.validation_status
      ]
    );

    return { inserted: true, event };
  }

  async getEventById(eventId: string, tx?: DatabaseConnection): Promise<StoredEventRecord | null> {
    const conn = tx ?? this.db;
    const rows = await conn.query<StoredEventRecord>(
      'SELECT * FROM events WHERE event_id = ?;',
      [eventId]
    );
    return rows[0] ?? null;
  }

  async getEventsByEntityId(
    entityId: string,
    tx?: DatabaseConnection
  ): Promise<StoredEventRecord[]> {
    const conn = tx ?? this.db;
    return conn.query<StoredEventRecord>(
      'SELECT * FROM events WHERE entity_id = ? ORDER BY author_timestamp ASC, event_id ASC;',
      [entityId]
    );
  }

  async getEventsByType(
    type: PacketType,
    tx?: DatabaseConnection
  ): Promise<StoredEventRecord[]> {
    const conn = tx ?? this.db;
    return conn.query<StoredEventRecord>(
      'SELECT * FROM events WHERE event_type = ? ORDER BY author_timestamp ASC, event_id ASC;',
      [type]
    );
  }

  async getAllEvents(
    limit = 100,
    cursor?: string | null,
    tx?: DatabaseConnection
  ): Promise<StoredEventRecord[]> {
    const conn = tx ?? this.db;
    if (cursor) {
      return conn.query<StoredEventRecord>(
        'SELECT * FROM events WHERE event_id > ? ORDER BY event_id ASC LIMIT ?;',
        [cursor, limit]
      );
    }
    return conn.query<StoredEventRecord>(
      'SELECT * FROM events ORDER BY event_id ASC LIMIT ?;',
      [limit]
    );
  }

  async updateValidationStatus(
    eventId: string,
    status: 'VALID' | 'INVALID' | 'PENDING_DEPENDENCY',
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      'UPDATE events SET validation_status = ? WHERE event_id = ?;',
      [status, eventId]
    );
  }

  async countEvents(tx?: DatabaseConnection): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn.query<{ count: number }>('SELECT count(*) as count FROM events;');
    return rows[0]?.count ?? 0;
  }
}
