import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { DeltaSyncService } from '../../src/mesh/sync/DeltaSyncService';
import { RelayQueueRepository } from '../../src/data/repositories/RelayQueueRepository';
import { IncidentRepository } from '../../src/data/repositories/IncidentRepository';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { signEnvelope } from '../../src/security/signing/signPayload';
import { IncidentPayload } from '../../src/mesh/protocol/contracts';

describe('Three-Device Store-and-Forward Relay Flow (PRD Section 8.6)', () => {
  let dbA: NodeSqliteDriver, dbB: NodeSqliteDriver, dbC: NodeSqliteDriver;
  let syncA: DeltaSyncService, syncB: DeltaSyncService, syncC: DeltaSyncService;
  let relayQueueC: RelayQueueRepository;
  let incidentRepoB: IncidentRepository;
  let cryptoA: Ed25519CryptoProvider, cryptoB: Ed25519CryptoProvider, cryptoC: Ed25519CryptoProvider;

  beforeEach(async () => {
    dbA = new NodeSqliteDriver(':memory:');
    dbB = new NodeSqliteDriver(':memory:');
    dbC = new NodeSqliteDriver(':memory:');

    await runMigrations(dbA);
    await runMigrations(dbB);
    await runMigrations(dbC);

    cryptoA = new Ed25519CryptoProvider();
    cryptoB = new Ed25519CryptoProvider();
    cryptoC = new Ed25519CryptoProvider();

    syncA = new DeltaSyncService(dbA, cryptoA);
    syncB = new DeltaSyncService(dbB, cryptoB);
    syncC = new DeltaSyncService(dbC, cryptoC);

    relayQueueC = new RelayQueueRepository(dbC);
    incidentRepoB = new IncidentRepository(dbB);
  });

  afterEach(async () => {
    await dbA.close();
    await dbB.close();
    await dbC.close();
  });

  it('delivers Device A incident to Device B through intermediate Device C without Device A and B ever directly connecting', async () => {
    const identityA = await cryptoA.createOrLoadIdentity();
    const identityB = await cryptoB.createOrLoadIdentity();
    const identityC = await cryptoC.createOrLoadIdentity();

    // Step 1: Device A creates a signed incident
    const incidentPayload: IncidentPayload = {
      incidentId: 'inc-relay-test-1',
      category: 'LANDSLIDE',
      description: 'Mountain pass blocked',
      latitude: 45.123,
      longitude: 7.456,
      accuracyM: 10,
      severity: 5,
      createdAt: 1000,
      expiresAt: 2000000000000
    };
    const envelopeA = createEnvelope('INCIDENT', incidentPayload, identityA);
    envelopeA.signature = await signEnvelope(envelopeA, cryptoA);

    // Save on Device A
    await syncA.mergeSyncBatch([envelopeA], 'local_author');

    // Step 2: Device A connects to Device C (Relay)
    // C requests delta from A
    const manifestA = await syncA.createManifest(identityA);
    const deltaC = await syncC.computeDelta(manifestA);
    expect(deltaC.missingEventIds).toContain(envelopeA.packetId);

    const requestC = syncC.createSyncRequest(identityC, deltaC.missingEventIds);
    const responseFromA = await syncA.createSyncResponse(requestC);
    expect(responseFromA.envelopes).toHaveLength(1);

    // Device C merges and enqueues in its relay queue for Device B
    await syncC.mergeSyncBatch(responseFromA.envelopes, identityA.keyId);
    await relayQueueC.enqueue(envelopeA.packetId, identityB.keyId, 8);

    // Step 3: Device A disconnects and is out of radio range
    // (dbA is untouched henceforth)

    // Step 4: Device C later moves into radio range of Device B
    // Device B generates its manifest, Device C compares and offers delta
    const manifestC = await syncC.createManifest(identityC);
    const deltaB = await syncB.computeDelta(manifestC);
    expect(deltaB.missingEventIds).toContain(envelopeA.packetId);

    const requestB = syncB.createSyncRequest(identityB, deltaB.missingEventIds);
    const responseFromC = await syncC.createSyncResponse(requestB);
    expect(responseFromC.envelopes).toHaveLength(1);

    // Check that Device C sends the original envelope signed by Device A (Device C did NOT re-sign it!)
    const forwardedEnvelope = responseFromC.envelopes[0]!;
    expect(forwardedEnvelope.senderPublicKey).toBe(identityA.publicKey);
    expect(forwardedEnvelope.signature).toBe(envelopeA.signature);

    // Step 5: Device B verifies Device A's signature and merges into its store
    const mergeResB = await syncB.mergeSyncBatch([forwardedEnvelope], identityC.keyId);
    expect(mergeResB.mergedCount).toBe(1);

    // Step 6: Verify Device B projected the incident identically
    const incidentOnB = await incidentRepoB.getIncidentById('inc-relay-test-1');
    expect(incidentOnB).not.toBeNull();
    expect(incidentOnB?.description).toBe('Mountain pass blocked');
    expect(incidentOnB?.category).toBe('LANDSLIDE');

    // Step 7: Device C acknowledges delivery in relay queue
    await relayQueueC.acknowledge(envelopeA.packetId, identityB.keyId);
    const remainingDue = await relayQueueC.getDueItems(identityB.keyId);
    expect(remainingDue).toHaveLength(0);
  });
});
