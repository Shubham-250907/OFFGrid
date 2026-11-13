import { DatabaseConnection } from '../database/connection';
import { TriagePayload } from '../../mesh/protocol/contracts';

export interface TriageProjection {
  triageId: string;
  eventId: string;
  category: 'MEDICAL' | 'TRAPPED' | 'FOOD_WATER' | 'SAFE';
  headcount: number;
  description?: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  createdAt: number;
  expiresAt: number;
}

export class TriageRepository {
  constructor(private db: DatabaseConnection) {}

  async projectTriage(
    payload: TriagePayload,
    eventId: string,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `INSERT INTO triage_requests (
        triage_id, event_id, category, headcount, description,
        latitude, longitude, accuracy_m, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(triage_id) DO UPDATE SET
        category = excluded.category,
        headcount = excluded.headcount,
        description = excluded.description,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy_m = excluded.accuracy_m;`,
      [
        payload.triageId,
        eventId,
        payload.category,
        payload.headcount,
        payload.description ?? null,
        payload.latitude,
        payload.longitude,
        payload.accuracyM,
        payload.createdAt,
        payload.expiresAt
      ]
    );
  }

  async getAllTriage(
    now = Date.now(),
    tx?: DatabaseConnection
  ): Promise<TriageProjection[]> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT * FROM triage_requests WHERE expires_at > ? ORDER BY created_at DESC;`,
      [now]
    );
    return rows.map((r) => ({
      triageId: r.triage_id,
      eventId: r.event_id,
      category: r.category,
      headcount: r.headcount,
      description: r.description ?? undefined,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyM: r.accuracy_m,
      createdAt: r.created_at,
      expiresAt: r.expires_at
    }));
  }
}
