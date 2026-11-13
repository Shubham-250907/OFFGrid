import { DatabaseConnection } from '../database/connection';
import { IncidentPayload } from '../../mesh/protocol/contracts';
import { IncidentProjection } from '../projections';
import { ConfidenceBadge } from '../../domain/algorithms/confidence';

export class IncidentRepository {
  constructor(private db: DatabaseConnection) {}

  async projectIncident(
    payload: IncidentPayload,
    eventId: string,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `INSERT INTO incidents (
        incident_id, event_id, category, description,
        latitude, longitude, accuracy_m, severity,
        created_at, expires_at, confidence_score, confidence_badge
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'UNVERIFIED')
      ON CONFLICT(incident_id) DO UPDATE SET
        category = excluded.category,
        description = excluded.description,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy_m = excluded.accuracy_m,
        severity = excluded.severity;`,
      [
        payload.incidentId,
        eventId,
        payload.category,
        payload.description,
        payload.latitude,
        payload.longitude,
        payload.accuracyM,
        payload.severity,
        payload.createdAt,
        payload.expiresAt
      ]
    );
  }

  async getIncidentById(
    incidentId: string,
    tx?: DatabaseConnection
  ): Promise<IncidentProjection | null> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      'SELECT * FROM incidents WHERE incident_id = ?;',
      [incidentId]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      incidentId: r.incident_id,
      eventId: r.event_id,
      category: r.category,
      description: r.description,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyM: r.accuracy_m,
      severity: r.severity,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      confidenceScore: r.confidence_score,
      confidenceBadge: r.confidence_badge
    };
  }

  async getActiveIncidents(
    now = Date.now(),
    tx?: DatabaseConnection
  ): Promise<IncidentProjection[]> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      'SELECT * FROM incidents WHERE expires_at > ? ORDER BY created_at DESC;',
      [now]
    );
    return rows.map((r) => ({
      incidentId: r.incident_id,
      eventId: r.event_id,
      category: r.category,
      description: r.description,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyM: r.accuracy_m,
      severity: r.severity,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      confidenceScore: r.confidence_score,
      confidenceBadge: r.confidence_badge
    }));
  }

  async updateConfidence(
    incidentId: string,
    score: number,
    badge: ConfidenceBadge,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      'UPDATE incidents SET confidence_score = ?, confidence_badge = ? WHERE incident_id = ?;',
      [score, badge, incidentId]
    );
  }
}
