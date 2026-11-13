import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { EventRepository, StoredEventRecord } from '../../src/data/repositories/EventRepository';
import { IncidentRepository } from '../../src/data/repositories/IncidentRepository';
import { ShelterRepository } from '../../src/data/repositories/ShelterRepository';
import { ProjectionRebuilder } from '../../src/data/projections/rebuild';
import { hashCanonicalPayload } from '../../src/security/hashing/sha256';

describe('Deterministic Projection Rebuilding from Event Log', () => {
  let db: NodeSqliteDriver;
  let eventRepo: EventRepository;
  let incidentRepo: IncidentRepository;
  let shelterRepo: ShelterRepository;
  let rebuilder: ProjectionRebuilder;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
    eventRepo = new EventRepository(db);
    incidentRepo = new IncidentRepository(db);
    shelterRepo = new ShelterRepository(db);
    rebuilder = new ProjectionRebuilder(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('rebuilds incidents and shelter projections from raw event log', async () => {
    // 1. Create and save an INCIDENT event
    const incPayload = {
      incidentId: 'inc-rebuild-1',
      category: 'FLOOD',
      description: 'Severe street flooding',
      latitude: 12.97,
      longitude: 77.59,
      accuracyM: 10,
      severity: 4,
      createdAt: 1000,
      expiresAt: 2000000000000
    };
    const incEvent: StoredEventRecord = {
      event_id: 'ev-inc-1',
      event_type: 'INCIDENT',
      entity_id: incPayload.incidentId,
      author_public_key: 'author_1',
      author_timestamp: 1000,
      received_at: 1010,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify(incPayload),
      payload_hash: hashCanonicalPayload(incPayload),
      signature: 'sig_inc',
      validation_status: 'VALID'
    };
    await eventRepo.saveEvent(incEvent);

    // 2. Create and save two SHELTER events (creation and later status update)
    const shelterPayload = {
      shelterId: 'sh-rebuild-1',
      name: 'City Stadium',
      description: 'Evacuation refuge',
      latitude: 12.98,
      longitude: 77.60,
      accuracyM: 5,
      capacity: 500,
      status: 'OPEN',
      createdAt: 2000
    };
    const shelterEvent: StoredEventRecord = {
      event_id: 'ev-sh-1',
      event_type: 'SHELTER',
      entity_id: shelterPayload.shelterId,
      author_public_key: 'author_admin',
      author_timestamp: 2000,
      received_at: 2010,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify(shelterPayload),
      payload_hash: hashCanonicalPayload(shelterPayload),
      signature: 'sig_sh',
      validation_status: 'VALID'
    };
    await eventRepo.saveEvent(shelterEvent);

    const updatePayload = {
      updateId: 'up-1',
      shelterId: 'sh-rebuild-1',
      status: 'FULL',
      availableCapacity: 0,
      note: 'Reached max capacity',
      latitude: 12.98,
      longitude: 77.60,
      accuracyM: 5,
      createdAt: 3000
    };
    const updateEvent: StoredEventRecord = {
      event_id: 'ev-up-1',
      event_type: 'SHELTER_UPDATE',
      entity_id: shelterPayload.shelterId,
      author_public_key: 'author_admin',
      author_timestamp: 3000,
      received_at: 3010,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify(updatePayload),
      payload_hash: hashCanonicalPayload(updatePayload),
      signature: 'sig_up',
      validation_status: 'VALID'
    };
    await eventRepo.saveEvent(updateEvent);

    // 3. Clear all projection tables directly to simulate reconstruction
    await db.execute('DELETE FROM shelter_updates;');
    await db.execute('DELETE FROM shelters;');
    await db.execute('DELETE FROM incidents;');

    expect(await incidentRepo.getIncidentById('inc-rebuild-1')).toBeNull();
    expect(await shelterRepo.getShelterById('sh-rebuild-1')).toBeNull();

    // 4. Rebuild projections from event log
    const count = await rebuilder.rebuildAllProjections();
    expect(count).toBe(3);

    // 5. Verify restored projections
    const restoredInc = await incidentRepo.getIncidentById('inc-rebuild-1');
    expect(restoredInc).not.toBeNull();
    expect(restoredInc?.description).toBe('Severe street flooding');

    const restoredShelter = await shelterRepo.getShelterById('sh-rebuild-1');
    expect(restoredShelter).not.toBeNull();
    expect(restoredShelter?.name).toBe('City Stadium');
    // Deterministic projection: latest update is FULL
    expect(restoredShelter?.currentStatus).toBe('FULL');
  });
});
