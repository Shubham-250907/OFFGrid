import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { IncidentService } from '../../src/application/services/IncidentService';
import { VoteService } from '../../src/application/services/VoteService';
import { ShelterService } from '../../src/application/services/ShelterService';
import { TriageService } from '../../src/application/services/TriageService';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../src/shared/types';
import { calculateTimeDecay } from '../../src/domain/algorithms/timeDecay';
import { calculateProximityWeight } from '../../src/domain/algorithms/proximity';
import { MockLocationRejectedError, ValidationError } from '../../src/shared/errors/AppError';

describe('Phase 6 Hardening: Clock Drift, Monotonic Time & GPS Spoof Signal Gating', () => {
  let db: NodeSqliteDriver;
  let crypto: Ed25519CryptoProvider;
  let transport: MeshTransportAdapter;
  let incidentService: IncidentService;
  let shelterService: ShelterService;
  let triageService: TriageService;

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

    incidentService = new IncidentService(db, crypto, transport);
    shelterService = new ShelterService(db, crypto, transport);
    triageService = new TriageService(db, crypto, transport);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Clock Drift & Skew Handling (PRD Section 9.3 & 13)', () => {
    it('clamps future timestamps due to clock skew to 1.0 without producing invalid weights or NaN', () => {
      const watermark = 1000000;
      const futureAuthorTimestamp = 1050000; // 50s ahead

      const decay = calculateTimeDecay(futureAuthorTimestamp, watermark, 6);
      expect(decay).toBe(1.0);
    });

    it('asymptotically decays very old timestamps without numeric underflow or NaN', () => {
      const watermark = Date.now();
      const thirtyDaysAgo = watermark - 30 * 24 * 60 * 60 * 1000;

      const decay = calculateTimeDecay(thirtyDaysAgo, watermark, 6);
      expect(decay).toBeGreaterThanOrEqual(0);
      expect(decay).toBeLessThan(0.0001);
      expect(Number.isFinite(decay)).toBe(true);
    });
  });

  describe('GPS Spoofing & Mock Provider Rejection (PRD Section 10.4 & 12.1)', () => {
    const mockLocation: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 5.0,
      timestamp: Date.now(),
      isMock: true, // Mock provider active
      provider: 'fused',
      status: 'MOCK'
    };

    it('strictly rejects incident creation with mock GPS signal', async () => {
      const identity = await crypto.createOrLoadIdentity();

      await expect(
        incidentService.reportIncident(
          { category: 'FLOOD', description: 'Mock flood report', severity: 3, location: mockLocation },
          identity
        )
      ).rejects.toThrow(MockLocationRejectedError);
    });

    it('strictly rejects verification voting with mock GPS signal', async () => {
      const reporter = await crypto.createOrLoadIdentity();
      const validLoc: LocationResult = {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracyM: 10.0,
        timestamp: Date.now(),
        isMock: false,
        provider: 'gps',
        status: 'AVAILABLE'
      };

      const inc = await incidentService.reportIncident(
        { category: 'FIRE', description: 'Actual fire', severity: 4, location: validLoc },
        reporter
      );

      const voterCrypto = new Ed25519CryptoProvider();
      const voter = await voterCrypto.createOrLoadIdentity();
      const voterService = new VoteService(db, voterCrypto, transport);

      await expect(
        voterService.castVote(
          { incidentId: inc.incidentId, voteType: 'CONFIRM', location: mockLocation },
          voter
        )
      ).rejects.toThrow(MockLocationRejectedError);
    });

    it('strictly rejects shelter creation and update with mock GPS signal', async () => {
      const identity = await crypto.createOrLoadIdentity();

      await expect(
        shelterService.createShelter(
          { name: 'Spoofed Shelter', status: 'OPEN', location: mockLocation },
          identity
        )
      ).rejects.toThrow(MockLocationRejectedError);
    });

    it('strictly rejects triage creation with mock GPS signal', async () => {
      const identity = await crypto.createOrLoadIdentity();

      await expect(
        triageService.submitTriage(
          { category: 'MEDICAL', headcount: 2, location: mockLocation },
          identity
        )
      ).rejects.toThrow(MockLocationRejectedError);
    });

    it('assigns 0 proximity weight if voter or report location is marked mock in ingress evaluation', () => {
      const report = { latitude: 12.9716, longitude: 77.5946, accuracyM: 10, isMock: false };
      const voter = { latitude: 12.9717, longitude: 77.5947, accuracyM: 10, isMock: true };

      const weight = calculateProximityWeight(report, voter);
      expect(weight).toBe(0.0);
    });

    it('rejects incident creation when GPS accuracy > 50m', async () => {
      const identity = await crypto.createOrLoadIdentity();
      const poorLoc: LocationResult = {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracyM: 120.0, // > 50m
        timestamp: Date.now(),
        isMock: false,
        provider: 'cell',
        status: 'LOW_ACCURACY'
      };

      await expect(
        incidentService.reportIncident(
          { category: 'FLOOD', description: 'Poor accuracy flood', severity: 3, location: poorLoc },
          identity
        )
      ).rejects.toThrow(ValidationError);
    });
  });
});
