import { DatabaseConnection } from '../database/connection';
import { SOSPayload, SOSUpdatePayload } from '../../mesh/protocol/contracts';

export interface SosProjection {
  sosId: string;
  eventId: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  locationStatus: string;
  batteryLevel: number;
  headcount: number;
  message?: string;
  createdAt: number;
  expiresAt: number;
  status: 'ACTIVE' | 'RESOLVED';
}

export class SosRepository {
  constructor(private db: DatabaseConnection) {}

  async projectSos(
    payload: SOSPayload,
    eventId: string,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `INSERT INTO sos_requests (
        sos_id, event_id, latitude, longitude, accuracy_m,
        location_status, battery_level, headcount, message,
        created_at, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      ON CONFLICT(sos_id) DO UPDATE SET
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy_m = excluded.accuracy_m,
        location_status = excluded.location_status,
        battery_level = excluded.battery_level,
        headcount = excluded.headcount,
        message = excluded.message;`,
      [
        payload.sosId,
        eventId,
        payload.latitude,
        payload.longitude,
        payload.accuracyM,
        payload.locationStatus,
        payload.batteryLevel,
        payload.headcount,
        payload.message ?? null,
        payload.createdAt,
        payload.expiresAt
      ]
    );
  }

  async resolveSos(
    payload: SOSUpdatePayload,
    _eventId: string,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `UPDATE sos_requests SET status = 'RESOLVED' WHERE sos_id = ?;`,
      [payload.sosId]
    );
  }

  async getActiveSos(
    now = Date.now(),
    tx?: DatabaseConnection
  ): Promise<SosProjection[]> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT * FROM sos_requests WHERE status = 'ACTIVE' AND expires_at > ? ORDER BY created_at DESC;`,
      [now]
    );
    return rows.map((r) => ({
      sosId: r.sos_id,
      eventId: r.event_id,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyM: r.accuracy_m,
      locationStatus: r.location_status,
      batteryLevel: r.battery_level,
      headcount: r.headcount,
      message: r.message ?? undefined,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      status: r.status
    }));
  }

  async getSosById(
    sosId: string,
    tx?: DatabaseConnection
  ): Promise<SosProjection | null> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT * FROM sos_requests WHERE sos_id = ?;`,
      [sosId]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      sosId: r.sos_id,
      eventId: r.event_id,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyM: r.accuracy_m,
      locationStatus: r.location_status,
      batteryLevel: r.battery_level,
      headcount: r.headcount,
      message: r.message ?? undefined,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      status: r.status
    };
  }
}
