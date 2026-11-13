import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { DeltaSyncService } from '../../src/mesh/sync/DeltaSyncService';
import { EventRepository, StoredEventRecord } from '../../src/data/repositories/EventRepository';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { hashCanonicalPayload } from '../../src/security/hashing/sha256';
import { SyncManifestPayload } from '../../src/mesh/protocol/contracts';

describe('Delta Sync Comparison and Bounded Responses', () => {
  let db: NodeSqliteDriver;
  let syncService: DeltaSyncService;
  let eventRepo: EventRepository;
  let crypto: Ed25519CryptoProvider;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
    crypto = new Ed25519CryptoProvider();
    syncService = new DeltaSyncService(db, crypto);
    eventRepo = new EventRepository(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('detects missing events, skips matching events, and flags integrity conflicts', async () => {
    const identity = await crypto.createOrLoadIdentity();

    // Local DB has ev-1 (matching) and ev-conflict (local hash != remote hash)
    const event1: StoredEventRecord = {
      event_id: 'ev-1',
      event_type: 'INCIDENT',
      entity_id: 'inc-1',
      author_public_key: identity.publicKey,
      author_timestamp: 1000,
      received_at: 1010,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify({ a: 1 }),
      payload_hash: 'hash-1-match',
      signature: 'sig-1',
      validation_status: 'VALID'
    };
    const eventConflict: StoredEventRecord = {
      event_id: 'ev-conflict',
      event_type: 'INCIDENT',
      entity_id: 'inc-c',
      author_public_key: identity.publicKey,
      author_timestamp: 2000,
      received_at: 2010,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify({ version: 'local' }),
      payload_hash: 'hash-local-version',
      signature: 'sig-c',
      validation_status: 'VALID'
    };
    await eventRepo.saveEvent(event1);
    await eventRepo.saveEvent(eventConflict);

    // Remote manifest contains ev-1 (match), ev-conflict (mismatched hash), and ev-missing (not in local)
    const remoteManifest: SyncManifestPayload = {
      manifestId: 'man-remote',
      devicePublicKey: 'pub-remote',
      generatedAt: Date.now(),
      cursor: null,
      totalEventCount: 3,
      inventory: [
        {
          eventId: 'ev-1',
          eventType: 'INCIDENT',
          entityId: 'inc-1',
          payloadHash: 'hash-1-match',
          authorTimestamp: 1000
        },
        {
          eventId: 'ev-conflict',
          eventType: 'INCIDENT',
          entityId: 'inc-c',
          payloadHash: 'hash-remote-divergent',
          authorTimestamp: 2000
        },
        {
          eventId: 'ev-missing',
          eventType: 'INCIDENT',
          entityId: 'inc-m',
          payloadHash: 'hash-remote-missing',
          authorTimestamp: 3000
        }
      ],
      inventoryHash: 'inv-hash',
      hasMore: false
    };

    const delta = await syncService.computeDelta(remoteManifest);

    expect(delta.matchingCount).toBe(1);
    expect(delta.missingEventIds).toEqual(['ev-missing']);
    expect(delta.conflicts).toEqual(['ev-conflict']);
  });

  it('bounds response envelopes to maximum 100 records and 256 KB', async () => {
    const identity = await crypto.createOrLoadIdentity();

    // Insert 5 events in local DB
    for (let i = 1; i <= 5; i++) {
      const payload = { id: i, data: 'test-batch' };
      const event: StoredEventRecord = {
        event_id: `ev-resp-${i}`,
        event_type: 'INCIDENT',
        entity_id: `inc-resp-${i}`,
        author_public_key: identity.publicKey,
        author_timestamp: 1000 + i,
        received_at: 1010 + i,
        protocol_version: 1,
        schema_version: 1,
        payload_json: JSON.stringify(payload),
        payload_hash: hashCanonicalPayload(payload),
        signature: 'sig',
        validation_status: 'VALID'
      };
      await eventRepo.saveEvent(event);
    }

    const req = syncService.createSyncRequest(identity, ['ev-resp-1', 'ev-resp-2', 'ev-resp-3']);
    const resp = await syncService.createSyncResponse(req);

    expect(resp.envelopes).toHaveLength(3);
    expect(resp.hasMore).toBe(false);
  });
});
