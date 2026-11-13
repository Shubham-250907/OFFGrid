import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { SosService } from '../../src/application/services/SosService';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../src/shared/types';

describe('E2E SOS Emergency Distress and Resolution Flow', () => {
  let db: NodeSqliteDriver;
  let crypto: Ed25519CryptoProvider;
  let transport: MeshTransportAdapter;
  let sosService: SosService;
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

    sosService = new SosService(db, crypto, transport);
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates life-safety SOS with live GPS and battery, persists locally before broadcast, and resolves via signed SOS_UPDATE', async () => {
    const identity = await crypto.createOrLoadIdentity();

    const location: LocationResult = {
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
      {
        headcount: 3,
        message: 'Water rising, need boat evacuation',
        location,
        batteryLevel: 42
      },
      identity
    );

    expect(sos.sosId).toBeTruthy();
    expect(sos.status).toBe('ACTIVE');
    expect(sos.batteryLevel).toBe(42);
    expect(sos.headcount).toBe(3);
    expect(sos.latitude).toBe(12.9716);
    expect(broadcastCount).toBe(1);

    // Verify it is in active SOS list
    const activeList = await sosService.getActiveSos();
    expect(activeList).toHaveLength(1);
    expect(activeList[0]?.sosId).toBe(sos.sosId);

    // 2. Resolve the SOS distress via signed SOS_UPDATE event
    await sosService.resolveSos(sos.sosId, identity);
    expect(broadcastCount).toBe(2);

    // Active SOS list should now be empty
    const resolvedList = await sosService.getActiveSos();
    expect(resolvedList).toHaveLength(0);
  });

  it('allows SOS with location explicitly unavailable without using stale GPS', async () => {
    const identity = await crypto.createOrLoadIdentity();

    const unavailableLocation: LocationResult = {
      latitude: null,
      longitude: null,
      accuracyM: null,
      timestamp: null,
      isMock: false,
      provider: 'none',
      status: 'UNAVAILABLE'
    };

    const sos = await sosService.createSos(
      {
        headcount: 1,
        message: 'No GPS signal in basement',
        location: unavailableLocation,
        batteryLevel: 15
      },
      identity
    );

    expect(sos.locationStatus).toBe('UNAVAILABLE');
    expect(sos.latitude).toBeNull();
    expect(sos.longitude).toBeNull();
    expect(sos.status).toBe('ACTIVE');
  });
});
