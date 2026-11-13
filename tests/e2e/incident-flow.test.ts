import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { IncidentService } from '../../src/application/services/IncidentService';
import { VoteService } from '../../src/application/services/VoteService';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../src/shared/types';
import { MockLocationRejectedError, RateLimitExceededError, ValidationError } from '../../src/shared/errors/AppError';

describe('E2E Incident Hazard Reporting and Community Verification Voting Flow', () => {
  let db: NodeSqliteDriver;
  let crypto: Ed25519CryptoProvider;
  let transport: MeshTransportAdapter;
  let incidentService: IncidentService;
  let voteService: VoteService;
  let broadcastCount = 0;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
    crypto = new Ed25519CryptoProvider();
    broadcastCount = 0;

    transport = {
      initialize: async () => {},
      startDiscovery: async () => {},
      stopDiscovery: async () => {},
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
      broadcast: async () => {
        broadcastCount++;
      },
      onPeerDiscovered: () => () => {},
      onMessageReceived: () => () => {},
      onPeerDisconnected: () => () => {}
    };

    incidentService = new IncidentService(db, crypto, transport);
    voteService = new VoteService(db, crypto, transport);
  });

  afterEach(async () => {
    await db.close();
  });

  it('reports a hazard incident with valid GPS and priority 8 broadcast', async () => {
    const author = await crypto.createOrLoadIdentity();

    const location: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 10.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const incident = await incidentService.reportIncident(
      {
        category: 'FLOOD',
        description: 'Severe road flooding, bridge submerged',
        severity: 4,
        location
      },
      author
    );

    expect(incident.incidentId).toBeTruthy();
    expect(incident.category).toBe('FLOOD');
    expect(incident.severity).toBe(4);
    expect(incident.latitude).toBe(12.9716);
    expect(incident.longitude).toBe(77.5946);
    expect(incident.confidenceBadge).toBe('UNVERIFIED');
    expect(incident.confidenceScore).toBe(0);
    expect(broadcastCount).toBe(1);

    const activeList = await incidentService.getActiveIncidents();
    expect(activeList).toHaveLength(1);
    expect(activeList[0]?.incidentId).toBe(incident.incidentId);
  });

  it('strictly rejects mock location for incident reporting', async () => {
    const author = await crypto.createOrLoadIdentity();

    const mockLocation: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 5.0,
      timestamp: Date.now(),
      isMock: true,
      provider: 'fused',
      status: 'MOCK'
    };

    await expect(
      incidentService.reportIncident(
        {
          category: 'EARTHQUAKE_DAMAGE',
          description: 'Cracked overpass',
          severity: 5,
          location: mockLocation
        },
        author
      )
    ).rejects.toThrow(MockLocationRejectedError);

    expect(broadcastCount).toBe(0);
    const activeList = await incidentService.getActiveIncidents();
    expect(activeList).toHaveLength(0);
  });

  it('rejects incident reporting if GPS accuracy is worse than 50m', async () => {
    const author = await crypto.createOrLoadIdentity();

    const lowAccuracyLocation: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 75.0, // > 50m threshold
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'LOW_ACCURACY'
    };

    await expect(
      incidentService.reportIncident(
        {
          category: 'LANDSLIDE',
          description: 'Mud covering road',
          severity: 3,
          location: lowAccuracyLocation
        },
        author
      )
    ).rejects.toThrow(ValidationError);

    expect(broadcastCount).toBe(0);
  });

  it('enforces 5-minute sliding rate limit per public key', async () => {
    const author = await crypto.createOrLoadIdentity();

    const location: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 10.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    // 1st report succeeds
    await incidentService.reportIncident(
      {
        category: 'FIRE',
        description: 'Brush fire near highway',
        severity: 4,
        location
      },
      author
    );

    // 2nd report immediately after from same key throws RateLimitExceededError
    await expect(
      incidentService.reportIncident(
        {
          category: 'FIRE',
          description: 'Another fire spotted',
          severity: 3,
          location
        },
        author
      )
    ).rejects.toThrow(RateLimitExceededError);
  });

  it('recomputes confidence badge to HIGH_CONFIDENCE when 3 nearby peers confirm', async () => {
    const reporter = await crypto.createOrLoadIdentity();

    const reporterLoc: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 10.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const incident = await incidentService.reportIncident(
      {
        category: 'FLOOD',
        description: 'Rising water on Main St',
        severity: 4,
        location: reporterLoc
      },
      reporter
    );

    expect(incident.confidenceBadge).toBe('UNVERIFIED');

    // Generate 3 separate voter devices with independent Ed25519 identities
    const crypto1 = new Ed25519CryptoProvider();
    const crypto2 = new Ed25519CryptoProvider();
    const crypto3 = new Ed25519CryptoProvider();

    const voter1 = await crypto1.createOrLoadIdentity();
    const voter2 = await crypto2.createOrLoadIdentity();
    const voter3 = await crypto3.createOrLoadIdentity();

    const voterService1 = new VoteService(db, crypto1, transport);
    const voterService2 = new VoteService(db, crypto2, transport);
    const voterService3 = new VoteService(db, crypto3, transport);

    // Voters within 50m of the incident (<200m effective distance)
    const voterLoc: LocationResult = {
      latitude: 12.9717,
      longitude: 77.5947,
      accuracyM: 8.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    // Voter 1 casts CONFIRM
    const res1 = await voterService1.castVote(
      { incidentId: incident.incidentId, voteType: 'CONFIRM', location: voterLoc },
      voter1
    );
    expect(res1.isEffective).toBe(true);
    expect(res1.evaluation.badge).toBe('UNVERIFIED'); // Need >= 3 positive proximity keys

    // Voter 2 casts CONFIRM
    const res2 = await voterService2.castVote(
      { incidentId: incident.incidentId, voteType: 'CONFIRM', location: voterLoc },
      voter2
    );
    expect(res2.isEffective).toBe(true);
    expect(res2.evaluation.badge).toBe('UNVERIFIED');

    // Voter 3 casts CONFIRM -> reaches 3 keys with positive proximity weight
    const res3 = await voterService3.castVote(
      { incidentId: incident.incidentId, voteType: 'CONFIRM', location: voterLoc },
      voter3
    );
    expect(res3.isEffective).toBe(true);
    expect(res3.evaluation.score).toBeGreaterThanOrEqual(0.60);
    expect(res3.evaluation.badge).toBe('HIGH_CONFIDENCE');

    // Verify persisted incident projection updated
    const updated = await incidentService.getIncidentById(incident.incidentId);
    expect(updated?.confidenceBadge).toBe('HIGH_CONFIDENCE');
    expect(updated?.confidenceScore).toBeGreaterThanOrEqual(0.60);
  });

  it('enforces one effective vote per public key and ignores repeat votes in confidence scoring', async () => {
    const reporter = await crypto.createOrLoadIdentity();

    const loc: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 10.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const incident = await incidentService.reportIncident(
      { category: 'ROAD_BLOCKAGE', description: 'Fallen tree', severity: 2, location: loc },
      reporter
    );

    const voter = await crypto.createOrLoadIdentity();

    // 1st vote: CONFIRM
    const v1 = await voteService.castVote(
      { incidentId: incident.incidentId, voteType: 'CONFIRM', location: loc },
      voter
    );
    expect(v1.isEffective).toBe(true);

    // 2nd vote from same key: DISPUTE
    const v2 = await voteService.castVote(
      { incidentId: incident.incidentId, voteType: 'DISPUTE', location: loc },
      voter
    );
    // Earlier vote wins; repeat vote is ineffective
    expect(v2.isEffective).toBe(false);
    expect(v2.evaluation.effectiveConfirmCount).toBe(1);
    expect(v2.evaluation.effectiveDisputeCount).toBe(0);
  });

  it('gives 0 proximity weight to distant votes (>1000m) and does not upgrade confidence', async () => {
    const reporter = await crypto.createOrLoadIdentity();

    const loc: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 10.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const incident = await incidentService.reportIncident(
      { category: 'FLOOD', description: 'Water on tracks', severity: 4, location: loc },
      reporter
    );

    // Distant voter (15 km away)
    const distantLoc: LocationResult = {
      latitude: 13.1000,
      longitude: 77.6000,
      accuracyM: 10.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const distantCryptos = [
      new Ed25519CryptoProvider(),
      new Ed25519CryptoProvider(),
      new Ed25519CryptoProvider()
    ];

    for (const c of distantCryptos) {
      const v = await c.createOrLoadIdentity();
      const vs = new VoteService(db, c, transport);
      const res = await vs.castVote(
        { incidentId: incident.incidentId, voteType: 'CONFIRM', location: distantLoc },
        v
      );
      // Even with 3 voters, positiveProximityKeyCount is 0 because effective distance >= 1000m
      expect(res.evaluation.positiveProximityKeyCount).toBe(0);
      expect(res.evaluation.badge).toBe('UNVERIFIED');
    }
  });

  it('rejects mock vote with MockLocationRejectedError', async () => {
    const reporter = await crypto.createOrLoadIdentity();

    const loc: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 10.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const incident = await incidentService.reportIncident(
      { category: 'FLOOD', description: 'Road closed', severity: 3, location: loc },
      reporter
    );

    const voter = await crypto.createOrLoadIdentity();
    const mockLoc: LocationResult = {
      ...loc,
      isMock: true,
      status: 'MOCK'
    };

    await expect(
      voteService.castVote(
        { incidentId: incident.incidentId, voteType: 'CONFIRM', location: mockLoc },
        voter
      )
    ).rejects.toThrow(MockLocationRejectedError);
  });
});
