import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';

describe('Foreign Keys Constraint Enforcement', () => {
  let db: NodeSqliteDriver;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('verifies PRAGMA foreign_keys = ON is active', async () => {
    const rows = await db.query<{ foreign_keys: number }>('PRAGMA foreign_keys;');
    expect(rows[0]?.foreign_keys).toBe(1);
  });

  it('fails with foreign key constraint error when inserting incident with missing event_id', async () => {
    await expect(
      db.execute(
        `INSERT INTO incidents (
          incident_id, event_id, category, description, latitude, longitude,
          accuracy_m, severity, created_at, expires_at, confidence_score, confidence_badge
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'UNVERIFIED');`,
        ['inc-1', 'non-existent-event-id', 'FLOOD', 'Test flood', 12.0, 77.0, 10.0, 3, 1000, 2000]
      )
    ).rejects.toThrow();
  });

  it('fails with foreign key constraint error when inserting vote with missing incident_id', async () => {
    // 1. Insert a valid event first
    await db.execute(
      `INSERT INTO events (
        event_id, event_type, entity_id, author_public_key, author_timestamp,
        received_at, protocol_version, schema_version, payload_json, payload_hash,
        signature, validation_status
      ) VALUES (?, 'VOTE', 'inc-missing', 'pub_voter', 1000, 1000, 1, 1, '{}', 'hash_vote', 'sig', 'VALID');`,
      ['vote-event-1']
    );

    // 2. Try inserting vote referencing non-existent incident
    await expect(
      db.execute(
        `INSERT INTO votes (
          vote_id, event_id, incident_id, voter_public_key, vote_type,
          latitude, longitude, accuracy_m, created_at, effective
        ) VALUES (?, ?, ?, ?, 'CONFIRM', 12.0, 77.0, 10.0, 1000, 1);`,
        ['vote-1', 'vote-event-1', 'non-existent-incident-id', 'pub_voter']
      )
    ).rejects.toThrow();
  });
});
