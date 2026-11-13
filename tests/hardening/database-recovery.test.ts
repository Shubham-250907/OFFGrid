import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { ProjectionRebuilder } from '../../src/data/projections/rebuild';
import { IncidentService } from '../../src/application/services/IncidentService';
import { VoteService } from '../../src/application/services/VoteService';
import { ShelterService } from '../../src/application/services/ShelterService';
import { TriageService } from '../../src/application/services/TriageService';
import { SosService } from '../../src/application/services/SosService';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../src/shared/types';

describe('Phase 6 Hardening: Database Recovery, Projection Rebuild & Integrity Verification', () => {
  let db: NodeSqliteDriver;
  let crypto: Ed25519CryptoProvider;
  let transport: MeshTransportAdapter;
  let rebuilder: ProjectionRebuilder;
  let incidentService: IncidentService;
  let shelterService: ShelterService;
  let triageService: TriageService;
  let sosService: SosService;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
    crypto = new Ed25519CryptoProvider();

    transport = {
      initialize: async () => {},
      startDiscovery: async () => {},
      stopDiscovery: async () => {},
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
      broadcast: async () => {},
      onPeerDiscovered: () => () => {},
      onMessageReceived: () => () => {},
      onPeerDisconnected: () => () => {}
    };

    rebuilder = new ProjectionRebuilder(db);
    incidentService = new IncidentService(db, crypto, transport);
    shelterService = new ShelterService(db, crypto, transport);
    triageService = new TriageService(db, crypto, transport);
    sosService = new SosService(db, crypto, transport);
  });

  afterEach(async () => {
    await db.close();
  });

  it('passes PRAGMA integrity_check on active database', async () => {
    const res = await db.query<any>('PRAGMA integrity_check;');
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].integrity_check).toBe('ok');
  });

  it('recovers all projection read-models deterministically after complete wipe of projection tables', async () => {
    const identity = await crypto.createOrLoadIdentity();

    const loc: LocationResult = {
      latitude: 19.076,
      longitude: 72.8777,
      accuracyM: 10,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    // 1. Create an incident
    const inc = await incidentService.reportIncident(
      {
        category: 'FLOOD',
        description: 'Rising river waters submerging bridge',
        severity: 4,
        location: loc
      },
      identity
    );
    const incidentId = inc.incidentId;

    // 2. Add an upvote from a close neighbor
    const voterCrypto = new Ed25519CryptoProvider();
    const voter = await voterCrypto.createOrLoadIdentity();
    const voterService = new VoteService(db, voterCrypto, transport);

    const voterLoc: LocationResult = {
      latitude: 19.0762,
      longitude: 72.8778,
      accuracyM: 12,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    await voterService.castVote(
      {
        incidentId,
        voteType: 'CONFIRM',
        location: voterLoc
      },
      voter
    );

    // 3. Create a shelter and update its status
    const sh = await shelterService.createShelter(
      {
        name: 'Hilltop Community Center',
        location: loc,
        capacity: 100,
        status: 'OPEN'
      },
      identity
    );
    const shelterId = sh.shelterId;

    await shelterService.updateShelterStatus(
      {
        shelterId,
        status: 'FULL',
        availableCapacity: 0,
        location: loc
      },
      identity
    );

    // 4. Create an SOS distress signal and a triage assessment
    const sos = await sosService.createSos(
      {
        location: loc,
        batteryLevel: 25,
        headcount: 2,
        message: 'Flooding trap'
      },
      identity
    );
    const sosId = sos.sosId;

    const triage = await triageService.submitTriage(
      {
        category: 'MEDICAL',
        headcount: 2,
        description: 'Hypothermia and head trauma',
        location: loc
      },
      identity
    );
    const triageId = triage.triageId;

    // Capture pre-wipe projected state
    const preInc = await incidentService.getIncidentById(incidentId);
    const preShelter = await shelterService.getShelterById(shelterId);
    const preSos = await sosService.getSosById(sosId);
    const preTriage = await triageService.getTriageById(triageId);

    expect(preInc?.confidenceBadge).toBeDefined();
    expect(preShelter?.currentStatus).toBe('FULL');
    expect(preSos?.headcount).toBe(2);
    expect(preTriage?.category).toBe('MEDICAL');

    // Simulate catastrophic projection table wipe / drop (e.g. disk reset)
    await db.execute('DELETE FROM chat_messages;');
    await db.execute('DELETE FROM shelter_updates;');
    await db.execute('DELETE FROM shelters;');
    await db.execute('DELETE FROM triage_requests;');
    await db.execute('DELETE FROM sos_requests;');
    await db.execute('DELETE FROM votes;');
    await db.execute('DELETE FROM incidents;');

    // Verify projections are empty
    expect(await incidentService.getIncidentById(incidentId)).toBeNull();
    expect(await shelterService.getShelterById(shelterId)).toBeNull();
    expect(await sosService.getSosById(sosId)).toBeNull();
    expect(await triageService.getTriageById(triageId)).toBeNull();

    // Verify raw event log is intact
    const rawEvents = await db.query<any>('SELECT COUNT(*) as cnt FROM events;');
    expect(rawEvents[0].cnt).toBeGreaterThanOrEqual(5);

    // Run projection recovery
    const replayedCount = await rebuilder.rebuildAllProjections(Date.now() + 60000);
    expect(replayedCount).toBeGreaterThanOrEqual(5);

    // Verify all projections are completely restored
    const postInc = await incidentService.getIncidentById(incidentId);
    const postShelter = await shelterService.getShelterById(shelterId);
    const postSos = await sosService.getSosById(sosId);
    const postTriage = await triageService.getTriageById(triageId);

    expect(postInc).not.toBeNull();
    expect(postInc?.incidentId).toBe(incidentId);
    expect(postInc?.confidenceBadge).toBe(preInc?.confidenceBadge);
    expect(postInc?.confidenceScore).toBeCloseTo(preInc?.confidenceScore!, 1);

    expect(postShelter).not.toBeNull();
    expect(postShelter?.shelterId).toBe(shelterId);
    expect(postShelter?.currentStatus).toBe('FULL');

    expect(postSos).not.toBeNull();
    expect(postSos?.sosId).toBe(sosId);
    expect(postSos?.headcount).toBe(2);

    expect(postTriage).not.toBeNull();
    expect(postTriage?.triageId).toBe(triageId);
    expect(postTriage?.category).toBe('MEDICAL');
  });

  it('guarantees atomic transaction rollback when an operation encounters an integrity fault', async () => {
    // Attempt an invalid transaction
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO incidents (incident_id, created_event_id, category, description, latitude, longitude, accuracy_m, is_mock, severity, status, confidence_score, created_at, updated_at)
           VALUES ('inc-test', 'non-existent-event', 'FLOOD', 'desc', 0, 0, 10, 0, 3, 'REPORTED', 0, 100, 100);`
        );
        // Deliberate syntax violation to trigger failure
        await tx.execute('INVALID SQL SYNTAX HERE;');
      })
    ).rejects.toThrow();

    // Verify that the incident was NOT inserted due to transaction rollback
    const rows = await db.query<any>("SELECT * FROM incidents WHERE incident_id = 'inc-test';");
    expect(rows.length).toBe(0);
  });
});
