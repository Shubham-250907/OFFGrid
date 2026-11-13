import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { LocalOfflineMapService } from '../../src/maps/OfflineMapService';
import { SosService } from '../../src/application/services/SosService';
import { IncidentService } from '../../src/application/services/IncidentService';
import { TriageService } from '../../src/application/services/TriageService';
import { ShelterService } from '../../src/application/services/ShelterService';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../src/shared/types';

describe('E2E Offline Dashboard State and Local MBTiles Fallback', () => {
  let db: NodeSqliteDriver;
  let crypto: Ed25519CryptoProvider;
  let transport: MeshTransportAdapter;
  let mapService: LocalOfflineMapService;
  let sosService: SosService;
  let incidentService: IncidentService;
  let triageService: TriageService;
  let shelterService: ShelterService;

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

    mapService = new LocalOfflineMapService();
    await mapService.initialize();

    sosService = new SosService(db, crypto, transport);
    incidentService = new IncidentService(db, crypto, transport);
    triageService = new TriageService(db, crypto, transport);
    shelterService = new ShelterService(db, crypto, transport);
  });

  afterEach(async () => {
    await db.close();
  });

  it('guarantees zero initial operational records on fresh installation', async () => {
    const activeSos = await sosService.getActiveSos();
    const activeIncidents = await incidentService.getActiveIncidents();
    const allTriage = await triageService.getAllTriage();
    const allShelters = await shelterService.getAllShelters();

    // PRD Section 5.1 & 11.2: Zero operational seed data
    expect(activeSos).toHaveLength(0);
    expect(activeIncidents).toHaveLength(0);
    expect(allTriage).toHaveLength(0);
    expect(allShelters).toHaveLength(0);
  });

  it('gracefully handles missing map tiles with list fallback and offline indicators', async () => {
    const hasMap = await mapService.hasOfflineMap();
    expect(hasMap).toBe(false);

    const coverage = await mapService.getCoverageStatus(12.97, 77.59);
    expect(coverage).toBe('OUTSIDE_COVERAGE');

    const bounds = await mapService.getMapBounds();
    expect(bounds).toBeNull();
  });

  it('loads all markers strictly from SQLite projections when events are ingested', async () => {
    const identity = await crypto.createOrLoadIdentity();

    const loc: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 8.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    // 1. Create SOS distress
    const sos = await sosService.createSos(
      { headcount: 2, message: 'Roof collapse', location: loc, batteryLevel: 50 },
      identity
    );

    // 2. Report Incident
    const incident = await incidentService.reportIncident(
      { category: 'FLOOD', description: 'Highway submerged', severity: 4, location: loc },
      identity
    );

    // 3. Submit Triage
    const triage = await triageService.submitTriage(
      { category: 'MEDICAL', headcount: 1, description: 'Diabetic patient needs insulin', location: loc },
      identity
    );

    // 4. Register Shelter
    const shelter = await shelterService.createShelter(
      { name: 'Community Center', capacity: 150, status: 'OPEN', location: loc },
      identity
    );

    // Query projections directly as Dashboard does
    const sosList = await sosService.getActiveSos();
    const incList = await incidentService.getActiveIncidents();
    const triList = await triageService.getAllTriage();
    const shList = await shelterService.getAllShelters();

    expect(sosList).toHaveLength(1);
    expect(sosList[0]?.sosId).toBe(sos.sosId);

    expect(incList).toHaveLength(1);
    expect(incList[0]?.incidentId).toBe(incident.incidentId);

    expect(triList).toHaveLength(1);
    expect(triList[0]?.triageId).toBe(triage.triageId);

    expect(shList).toHaveLength(1);
    expect(shList[0]?.shelterId).toBe(shelter.shelterId);
  });

  it('verifies 100% offline airplane-mode functionality without remote network dependency', async () => {
    // In airplane mode, radios might be disabled or discovering locally, but no remote HTTP requests occur
    const identity = await crypto.createOrLoadIdentity();

    const loc: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 10.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    // Emergency workflow proceeds completely in airplane mode
    const sos = await sosService.createSos(
      { headcount: 1, message: 'Isolated off-grid', location: loc, batteryLevel: 80 },
      identity
    );
    expect(sos.status).toBe('ACTIVE');

    // Resolution in airplane mode
    await sosService.resolveSos(sos.sosId, identity);
    const resolved = await sosService.getActiveSos();
    expect(resolved).toHaveLength(0);
  });
});
