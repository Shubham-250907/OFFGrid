import { describe, it, expect, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { EventRepository, StoredEventRecord } from '../../src/data/repositories/EventRepository';
import { IncidentRepository } from '../../src/data/repositories/IncidentRepository';
import * as fs from 'fs';
import * as path from 'path';

describe('Database Restart Persistence and Recovery', () => {
  const testDbFile = path.resolve(__dirname, 'restart-test.db');

  afterEach(() => {
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch {}
    }
  });

  it('persists committed events and projections across connection close and restart', async () => {
    // Session 1: Create DB, run migrations, write data
    const db1 = new NodeSqliteDriver(testDbFile);
    await runMigrations(db1);

    const eventRepo1 = new EventRepository(db1);
    const incidentRepo1 = new IncidentRepository(db1);

    const eventRecord: StoredEventRecord = {
      event_id: 'ev-restart-1',
      event_type: 'INCIDENT',
      entity_id: 'inc-restart-1',
      author_public_key: 'author_pub',
      author_timestamp: 1000,
      received_at: 1010,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify({ category: 'FIRE' }),
      payload_hash: 'hash_restart',
      signature: 'sig_restart',
      validation_status: 'VALID'
    };

    await eventRepo1.saveEvent(eventRecord);
    await incidentRepo1.projectIncident(
      {
        incidentId: 'inc-restart-1',
        category: 'FIRE',
        description: 'Wildfire near perimeter',
        latitude: 34.05,
        longitude: -118.25,
        accuracyM: 10,
        severity: 5,
        createdAt: 1000,
        expiresAt: 5000000000
      },
      'ev-restart-1'
    );

    // Close session 1
    await db1.close();

    // Session 2: Reopen same file
    const db2 = new NodeSqliteDriver(testDbFile);
    const eventRepo2 = new EventRepository(db2);
    const incidentRepo2 = new IncidentRepository(db2);

    // Verify migrations ledger survived
    const ledger = await db2.query<{ version: number }>('SELECT version FROM schema_migrations;');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.version).toBe(1);

    // Verify stored event survived
    const retrievedEvent = await eventRepo2.getEventById('ev-restart-1');
    expect(retrievedEvent).not.toBeNull();
    expect(retrievedEvent?.entity_id).toBe('inc-restart-1');

    // Verify incident projection survived
    const retrievedIncident = await incidentRepo2.getIncidentById('inc-restart-1');
    expect(retrievedIncident).not.toBeNull();
    expect(retrievedIncident?.category).toBe('FIRE');
    expect(retrievedIncident?.description).toBe('Wildfire near perimeter');

    await db2.close();
  });
});
