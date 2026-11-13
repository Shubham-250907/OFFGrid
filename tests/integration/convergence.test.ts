import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { DeltaSyncService } from '../../src/mesh/sync/DeltaSyncService';
import { IncidentRepository } from '../../src/data/repositories/IncidentRepository';
import { ShelterRepository } from '../../src/data/repositories/ShelterRepository';
import { SosRepository } from '../../src/data/repositories/SosRepository';
import { VoteRepository } from '../../src/data/repositories/VoteRepository';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { signEnvelope } from '../../src/security/signing/signPayload';
import {
  IncidentPayload,
  VotePayload,
  ShelterPayload,
  ShelterUpdatePayload,
  SOSPayload
} from '../../src/mesh/protocol/contracts';

describe('Three-Replica Convergence Property Test (PRD Section 17.3)', () => {
  let db1: NodeSqliteDriver, db2: NodeSqliteDriver, db3: NodeSqliteDriver;
  let sync1: DeltaSyncService, sync2: DeltaSyncService, sync3: DeltaSyncService;
  let incRepo1: IncidentRepository, incRepo2: IncidentRepository, incRepo3: IncidentRepository;
  let shelterRepo1: ShelterRepository, shelterRepo2: ShelterRepository, shelterRepo3: ShelterRepository;
  let sosRepo1: SosRepository, sosRepo2: SosRepository, sosRepo3: SosRepository;
  let voteRepo1: VoteRepository, voteRepo2: VoteRepository, voteRepo3: VoteRepository;
  let crypto: Ed25519CryptoProvider;

  beforeEach(async () => {
    crypto = new Ed25519CryptoProvider();

    db1 = new NodeSqliteDriver(':memory:');
    db2 = new NodeSqliteDriver(':memory:');
    db3 = new NodeSqliteDriver(':memory:');

    await runMigrations(db1);
    await runMigrations(db2);
    await runMigrations(db3);

    sync1 = new DeltaSyncService(db1, crypto);
    sync2 = new DeltaSyncService(db2, crypto);
    sync3 = new DeltaSyncService(db3, crypto);

    incRepo1 = new IncidentRepository(db1);
    incRepo2 = new IncidentRepository(db2);
    incRepo3 = new IncidentRepository(db3);

    shelterRepo1 = new ShelterRepository(db1);
    shelterRepo2 = new ShelterRepository(db2);
    shelterRepo3 = new ShelterRepository(db3);

    sosRepo1 = new SosRepository(db1);
    sosRepo2 = new SosRepository(db2);
    sosRepo3 = new SosRepository(db3);

    voteRepo1 = new VoteRepository(db1);
    voteRepo2 = new VoteRepository(db2);
    voteRepo3 = new VoteRepository(db3);
  });

  afterEach(async () => {
    await db1.close();
    await db2.close();
    await db3.close();
  });

  it('guarantees identical state across three replicas fed in different arrival orders with child-before-parent and duplicates', async () => {
    const identity = await crypto.createOrLoadIdentity();
    const watermark = 5000000;

    // 1. Create a fixed valid event set:
    // Event A: INCIDENT
    const incPayload: IncidentPayload = {
      incidentId: 'inc-conv-1',
      category: 'EARTHQUAKE_DAMAGE',
      description: 'Collapsed wall',
      latitude: 12.97,
      longitude: 77.59,
      accuracyM: 5,
      severity: 4,
      createdAt: 1000,
      expiresAt: 2000000000000
    };
    const envA = createEnvelope('INCIDENT', incPayload, identity);
    envA.signature = await signEnvelope(envA, crypto);

    // Event B: VOTE Confirm (earlier timestamp)
    const votePayload1: VotePayload = {
      voteId: 'vote-conv-1',
      incidentId: 'inc-conv-1',
      voteType: 'CONFIRM',
      latitude: 12.97,
      longitude: 77.59,
      accuracyM: 5,
      createdAt: 1100
    };
    const envB = createEnvelope('VOTE', votePayload1, identity);
    envB.createdAt = 1100;
    envB.signature = await signEnvelope(envB, crypto);

    // Event C: VOTE Dispute from same key (later timestamp - will be marked ineffective)
    const votePayload2: VotePayload = {
      voteId: 'vote-conv-2',
      incidentId: 'inc-conv-1',
      voteType: 'DISPUTE',
      latitude: 12.97,
      longitude: 77.59,
      accuracyM: 5,
      createdAt: 1200
    };
    const envC = createEnvelope('VOTE', votePayload2, identity);
    envC.createdAt = 1200;
    envC.signature = await signEnvelope(envC, crypto);

    // Event D: SHELTER Creation
    const shelterPayload: ShelterPayload = {
      shelterId: 'sh-conv-1',
      name: 'Safe School Gym',
      description: 'Power and clean water',
      latitude: 12.98,
      longitude: 77.60,
      accuracyM: 5,
      capacity: 200,
      status: 'OPEN',
      createdAt: 1300
    };
    const envD = createEnvelope('SHELTER', shelterPayload, identity);
    envD.createdAt = 1300;
    envD.signature = await signEnvelope(envD, crypto);

    // Event E: SHELTER Update
    const shelterUpdatePayload: ShelterUpdatePayload = {
      updateId: 'sh-up-conv-1',
      shelterId: 'sh-conv-1',
      status: 'FULL',
      availableCapacity: 0,
      note: 'Filled up quickly',
      latitude: 12.98,
      longitude: 77.60,
      accuracyM: 5,
      createdAt: 1400
    };
    const envE = createEnvelope('SHELTER_UPDATE', shelterUpdatePayload, identity);
    envE.createdAt = 1400;
    envE.signature = await signEnvelope(envE, crypto);

    // Event F: SOS
    const sosPayload: SOSPayload = {
      sosId: 'sos-conv-1',
      latitude: 12.971,
      longitude: 77.591,
      accuracyM: 8,
      locationStatus: 'AVAILABLE',
      batteryLevel: 75,
      headcount: 2,
      createdAt: 1500,
      expiresAt: 2000000000000
    };
    const envF = createEnvelope('SOS', sosPayload, identity);
    envF.createdAt = 1500;
    envF.signature = await signEnvelope(envF, crypto);

    // Order 1 for Replica 1 (Standard order + duplicate envA):
    await sync1.mergeSyncBatch([envA, envB, envC, envD, envE, envF, envA], 'peer_1', watermark);

    // Order 2 for Replica 2 (Child before parent delivery: Vote before Incident, Update before Shelter):
    await sync2.mergeSyncBatch([envB, envE, envC, envA, envD, envF, envB], 'peer_2', watermark);

    // Order 3 for Replica 3 (Completely reversed order with duplicate envE):
    await sync3.mergeSyncBatch([envF, envE, envD, envC, envB, envA, envE], 'peer_3', watermark);

    // Assert: Incident projection matches across all 3 replicas
    const inc1 = await incRepo1.getIncidentById('inc-conv-1');
    const inc2 = await incRepo2.getIncidentById('inc-conv-1');
    const inc3 = await incRepo3.getIncidentById('inc-conv-1');

    expect(inc1).not.toBeNull();
    expect(inc1).toEqual(inc2);
    expect(inc2).toEqual(inc3);

    // Assert: Effective votes match across all 3 replicas (CONFIRM wins tie-breaker)
    const votes1 = await voteRepo1.getEffectiveVotesForIncident('inc-conv-1');
    const votes2 = await voteRepo2.getEffectiveVotesForIncident('inc-conv-1');
    const votes3 = await voteRepo3.getEffectiveVotesForIncident('inc-conv-1');

    expect(votes1).toHaveLength(1);
    expect(votes1[0]?.voteType).toBe('CONFIRM');
    expect(votes1).toEqual(votes2);
    expect(votes2).toEqual(votes3);

    // Assert: Shelter projection matches across all 3 replicas (FULL status)
    const sh1 = await shelterRepo1.getShelterById('sh-conv-1');
    const sh2 = await shelterRepo2.getShelterById('sh-conv-1');
    const sh3 = await shelterRepo3.getShelterById('sh-conv-1');

    expect(sh1?.currentStatus).toBe('FULL');
    expect(sh1).toEqual(sh2);
    expect(sh2).toEqual(sh3);

    // Assert: SOS projection matches
    const sos1 = await sosRepo1.getSosById('sos-conv-1');
    const sos2 = await sosRepo2.getSosById('sos-conv-1');
    const sos3 = await sosRepo3.getSosById('sos-conv-1');

    expect(sos1).not.toBeNull();
    expect(sos1).toEqual(sos2);
    expect(sos2).toEqual(sos3);
  });
});
