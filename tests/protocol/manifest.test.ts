import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { DeltaSyncService } from '../../src/mesh/sync/DeltaSyncService';
import { EventRepository, StoredEventRecord } from '../../src/data/repositories/EventRepository';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { hashCanonicalPayload } from '../../src/security/hashing/sha256';

describe('Paginated SYNC_MANIFEST Generation', () => {
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

  it('generates an empty manifest with valid inventoryHash when event store is empty', async () => {
    const identity = await crypto.createOrLoadIdentity();
    const manifest = await syncService.createManifest(identity);

    expect(manifest.totalEventCount).toBe(0);
    expect(manifest.inventory).toHaveLength(0);
    expect(manifest.hasMore).toBe(false);
    expect(manifest.inventoryHash).toHaveLength(64);
  });

  it('paginates manifest entries with 100-record boundary and cursor', async () => {
    const identity = await crypto.createOrLoadIdentity();

    // Populate 105 mock events in event ledger
    for (let i = 1; i <= 105; i++) {
      const pad = i.toString().padStart(3, '0');
      const payload = { index: i };
      const event: StoredEventRecord = {
        event_id: `ev-${pad}`,
        event_type: 'INCIDENT',
        entity_id: `inc-${pad}`,
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

    // Page 1: limit 100
    const page1 = await syncService.createManifest(identity, null, 100);
    expect(page1.totalEventCount).toBe(105);
    expect(page1.inventory).toHaveLength(100);
    expect(page1.hasMore).toBe(true);
    expect(page1.cursor).toBe('ev-100');

    // Page 2: with cursor
    const page2 = await syncService.createManifest(identity, page1.cursor, 100);
    expect(page2.inventory).toHaveLength(5);
    expect(page2.hasMore).toBe(false);
    expect(page2.inventory[0]?.eventId).toBe('ev-101');
  });
});
