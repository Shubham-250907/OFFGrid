import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { EventRepository, StoredEventRecord } from '../../src/data/repositories/EventRepository';
import { IntegrityConflictError } from '../../src/shared/errors/AppError';

describe('Duplicate Events and Integrity Conflict Handling', () => {
  let db: NodeSqliteDriver;
  let eventRepo: EventRepository;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
    eventRepo = new EventRepository(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('inserts a new valid event successfully', async () => {
    const event: StoredEventRecord = {
      event_id: 'ev-100',
      event_type: 'INCIDENT',
      entity_id: 'inc-100',
      author_public_key: 'author_key_1',
      author_timestamp: 1000,
      received_at: 1010,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify({ test: true }),
      payload_hash: 'hash_abc_123',
      signature: 'sig_base64url',
      validation_status: 'VALID'
    };

    const res = await eventRepo.saveEvent(event);
    expect(res.inserted).toBe(true);

    const count = await eventRepo.countEvents();
    expect(count).toBe(1);
  });

  it('idempotently ignores duplicate event with identical UUID and payload hash', async () => {
    const event: StoredEventRecord = {
      event_id: 'ev-100',
      event_type: 'INCIDENT',
      entity_id: 'inc-100',
      author_public_key: 'author_key_1',
      author_timestamp: 1000,
      received_at: 1010,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify({ test: true }),
      payload_hash: 'hash_abc_123',
      signature: 'sig_base64url',
      validation_status: 'VALID'
    };

    const res1 = await eventRepo.saveEvent(event);
    expect(res1.inserted).toBe(true);

    const res2 = await eventRepo.saveEvent(event);
    expect(res2.inserted).toBe(false);

    const count = await eventRepo.countEvents();
    expect(count).toBe(1);
  });

  it('throws IntegrityConflictError and quarantines when event UUID matches but payload hash differs', async () => {
    const event1: StoredEventRecord = {
      event_id: 'ev-conflict',
      event_type: 'INCIDENT',
      entity_id: 'inc-conflict',
      author_public_key: 'author_key_1',
      author_timestamp: 1000,
      received_at: 1010,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify({ version: 1 }),
      payload_hash: 'hash_version_1',
      signature: 'sig_1',
      validation_status: 'VALID'
    };

    const event2Tampered: StoredEventRecord = {
      event_id: 'ev-conflict', // Same UUID
      event_type: 'INCIDENT',
      entity_id: 'inc-conflict',
      author_public_key: 'author_key_1',
      author_timestamp: 1000,
      received_at: 1020,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify({ version: 2 }), // Different payload
      payload_hash: 'hash_version_2', // Different hash
      signature: 'sig_tampered',
      validation_status: 'VALID'
    };

    await eventRepo.saveEvent(event1);

    await expect(eventRepo.saveEvent(event2Tampered)).rejects.toThrow(
      IntegrityConflictError
    );

    // Ensure the original event was not overwritten
    const stored = await eventRepo.getEventById('ev-conflict');
    expect(stored?.payload_hash).toBe('hash_version_1');
  });
});
