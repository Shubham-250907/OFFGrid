import { DatabaseConnection } from '../database/connection';
import { VotePayload } from '../../mesh/protocol/contracts';
import { StoredVote } from '../../domain/policies/voteConflict';

export class VoteRepository {
  constructor(private db: DatabaseConnection) {}

  async recordVote(
    payload: VotePayload,
    eventId: string,
    voterPublicKey: string,
    authorTimestamp: number,
    tx?: DatabaseConnection
  ): Promise<{ isEffective: boolean }> {
    const conn = tx ?? this.db;

    // Check if there is an existing vote by this voter for this incident
    const existing = await conn.query<any>(
      `SELECT v.vote_id, v.event_id, e.author_timestamp
       FROM votes v
       JOIN events e ON v.event_id = e.event_id
       WHERE v.incident_id = ? AND v.voter_public_key = ?;`,
      [payload.incidentId, voterPublicKey]
    );

    if (existing.length > 0) {
      const current = existing[0]!;
      // Earliest (author_timestamp, event_id) wins
      const candidateWins =
        authorTimestamp < current.author_timestamp ||
        (authorTimestamp === current.author_timestamp && eventId < current.event_id);

      if (candidateWins) {
        // Replace effective vote with earlier one
        await conn.execute(
          `UPDATE votes SET
            vote_id = ?,
            event_id = ?,
            vote_type = ?,
            latitude = ?,
            longitude = ?,
            accuracy_m = ?,
            created_at = ?,
            effective = 1
          WHERE incident_id = ? AND voter_public_key = ?;`,
          [
            payload.voteId,
            eventId,
            payload.voteType,
            payload.latitude,
            payload.longitude,
            payload.accuracyM,
            payload.createdAt,
            payload.incidentId,
            voterPublicKey
          ]
        );
        return { isEffective: true };
      } else {
        // Existing vote remains effective; candidate is retained in events but not effective
        return { isEffective: false };
      }
    }

    // No existing vote, insert as effective
    await conn.execute(
      `INSERT INTO votes (
        vote_id, event_id, incident_id, voter_public_key,
        vote_type, latitude, longitude, accuracy_m, created_at, effective
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
      [
        payload.voteId,
        eventId,
        payload.incidentId,
        voterPublicKey,
        payload.voteType,
        payload.latitude,
        payload.longitude,
        payload.accuracyM,
        payload.createdAt
      ]
    );

    return { isEffective: true };
  }

  async getEffectiveVotesForIncident(
    incidentId: string,
    tx?: DatabaseConnection
  ): Promise<StoredVote[]> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT v.vote_id, v.incident_id, v.voter_public_key, v.vote_type,
              v.latitude, v.longitude, v.accuracy_m, e.author_timestamp, v.event_id
       FROM votes v
       JOIN events e ON v.event_id = e.event_id
       WHERE v.incident_id = ? AND v.effective = 1;`,
      [incidentId]
    );

    return rows.map((r) => ({
      voteId: r.vote_id,
      incidentId: r.incident_id,
      voterPublicKey: r.voter_public_key,
      voteType: r.vote_type,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyM: r.accuracy_m,
      authorTimestamp: r.author_timestamp,
      eventId: r.event_id
    }));
  }
}
