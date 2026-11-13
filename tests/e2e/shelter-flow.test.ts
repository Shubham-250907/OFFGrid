import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { ShelterService } from '../../src/application/services/ShelterService';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../src/shared/types';
import { MockLocationRejectedError } from '../../src/shared/errors/AppError';

describe('E2E Shelter Registration and Status Update Flow', () => {
  let db: NodeSqliteDriver;
  let crypto: Ed25519CryptoProvider;
  let transport: MeshTransportAdapter;
  let shelterService: ShelterService;
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

    shelterService = new ShelterService(db, crypto, transport);
  });

  afterEach(async () => {
    await db.close();
  });

  it('registers a shelter with valid GPS, capacity and status, and broadcasts at priority 6', async () => {
    const author = await crypto.createOrLoadIdentity();

    const location: LocationResult = {
      latitude: 12.9600,
      longitude: 77.5700,
      accuracyM: 6.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const shelter = await shelterService.createShelter(
      {
        name: 'Community Center Shelter',
        description: 'Dry shelter with drinking water and first aid',
        location,
        capacity: 250,
        status: 'OPEN'
      },
      author
    );

    expect(shelter.shelterId).toBeTruthy();
    expect(shelter.name).toBe('Community Center Shelter');
    expect(shelter.capacity).toBe(250);
    expect(shelter.currentStatus).toBe('OPEN');
    expect(broadcastCount).toBe(1);

    const all = await shelterService.getAllShelters();
    expect(all).toHaveLength(1);
    expect(all[0]?.shelterId).toBe(shelter.shelterId);
  });

  it('rejects shelter registration with mock GPS location', async () => {
    const author = await crypto.createOrLoadIdentity();

    const mockLocation: LocationResult = {
      latitude: 12.9600,
      longitude: 77.5700,
      accuracyM: 6.0,
      timestamp: Date.now(),
      isMock: true,
      provider: 'fused',
      status: 'MOCK'
    };

    await expect(
      shelterService.createShelter(
        {
          name: 'Fake Shelter',
          location: mockLocation,
          status: 'OPEN'
        },
        author
      )
    ).rejects.toThrow(MockLocationRejectedError);

    expect(broadcastCount).toBe(0);
  });

  it('projects status updates deterministically using maximum (authorTimestamp, eventId) tuple', async () => {
    const author = await crypto.createOrLoadIdentity();
    const volunteer = await crypto.createOrLoadIdentity();

    const location: LocationResult = {
      latitude: 12.9600,
      longitude: 77.5700,
      accuracyM: 8.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const shelter = await shelterService.createShelter(
      {
        name: 'Central High Gym',
        location,
        capacity: 100,
        status: 'OPEN'
      },
      author
    );

    // Update 1: at t=1000 -> status changes to FULL
    const u1 = await shelterService.updateShelterStatus(
      {
        shelterId: shelter.shelterId,
        status: 'FULL',
        availableCapacity: 0,
        note: 'Reached max capacity',
        location
      },
      volunteer
    );

    expect(u1.currentStatus).toBe('FULL');
    expect(broadcastCount).toBe(2);

    // Update 2: at t=2000 -> status changes to MEDICAL_AID_AVAILABLE
    const u2 = await shelterService.updateShelterStatus(
      {
        shelterId: shelter.shelterId,
        status: 'MEDICAL_AID_AVAILABLE',
        availableCapacity: 10,
        note: 'Doctors arrived with supplies',
        location
      },
      volunteer
    );

    expect(u2.currentStatus).toBe('MEDICAL_AID_AVAILABLE');
    expect(broadcastCount).toBe(3);

    // Check full update history
    const updates = await shelterService.getShelterUpdates(shelter.shelterId);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.status).toBe('FULL');
    expect(updates[1]?.status).toBe('MEDICAL_AID_AVAILABLE');
  });

  it('rejects shelter update with mock location', async () => {
    const author = await crypto.createOrLoadIdentity();

    const location: LocationResult = {
      latitude: 12.9600,
      longitude: 77.5700,
      accuracyM: 8.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const shelter = await shelterService.createShelter(
      {
        name: 'Safe Zone 1',
        location,
        status: 'OPEN'
      },
      author
    );

    const mockLocation: LocationResult = {
      ...location,
      isMock: true,
      status: 'MOCK'
    };

    await expect(
      shelterService.updateShelterStatus(
        {
          shelterId: shelter.shelterId,
          status: 'CLOSED',
          location: mockLocation
        },
        author
      )
    ).rejects.toThrow(MockLocationRejectedError);
  });
});
