import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { SosService } from '../../src/application/services/SosService';
import { IncidentService } from '../../src/application/services/IncidentService';
import { VoteService } from '../../src/application/services/VoteService';
import { ShelterService } from '../../src/application/services/ShelterService';
import { ChatService } from '../../src/application/services/ChatService';
import { MeshReceiverService } from '../../src/application/services/MeshReceiverService';
import { DeltaSyncService } from '../../src/mesh/sync/DeltaSyncService';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../src/shared/types';

describe('Live Mesh Emergency Synchronization between Two Devices', () => {
  let dbA: NodeSqliteDriver;
  let dbB: NodeSqliteDriver;
  let cryptoA: Ed25519CryptoProvider;
  let cryptoB: Ed25519CryptoProvider;

  // In-memory mesh transport wiring between Device A and Device B
  let onMessageCallbackA: ((peerId: string, payload: Uint8Array) => void | Promise<void>) | null = null;
  let onMessageCallbackB: ((peerId: string, payload: Uint8Array) => void | Promise<void>) | null = null;

  let transportA: MeshTransportAdapter;
  let transportB: MeshTransportAdapter;

  let receiverA: MeshReceiverService;
  let receiverB: MeshReceiverService;

  let sosServiceA: SosService;
  let incidentServiceA: IncidentService;
  let voteServiceB: VoteService;
  let shelterServiceA: ShelterService;
  let chatServiceA: ChatService;

  beforeEach(async () => {
    dbA = new NodeSqliteDriver(':memory:');
    dbB = new NodeSqliteDriver(':memory:');
    await runMigrations(dbA);
    await runMigrations(dbB);

    cryptoA = new Ed25519CryptoProvider();
    cryptoB = new Ed25519CryptoProvider();

    transportA = {
      initialize: async () => {},
      startDiscovery: async () => {},
      stopDiscovery: async () => {},
      connect: async () => {},
      disconnect: async () => {},
      send: async (_peerId, payload) => {
        if (onMessageCallbackB) {
          await onMessageCallbackB('peer_device_a', payload);
        }
      },
      broadcast: async (payload) => {
        if (onMessageCallbackB) {
          await onMessageCallbackB('peer_device_a', payload);
        }
      },
      onPeerDiscovered: () => () => {},
      onMessageReceived: (cb) => {
        onMessageCallbackA = cb;
        return () => {
          onMessageCallbackA = null;
        };
      },
      onPeerDisconnected: () => () => {}
    };

    transportB = {
      initialize: async () => {},
      startDiscovery: async () => {},
      stopDiscovery: async () => {},
      connect: async () => {},
      disconnect: async () => {},
      send: async (_peerId, payload) => {
        if (onMessageCallbackA) {
          await onMessageCallbackA('peer_device_b', payload);
        }
      },
      broadcast: async (payload) => {
        if (onMessageCallbackA) {
          await onMessageCallbackA('peer_device_b', payload);
        }
      },
      onPeerDiscovered: () => () => {},
      onMessageReceived: (cb) => {
        onMessageCallbackB = cb;
        return () => {
          onMessageCallbackB = null;
        };
      },
      onPeerDisconnected: () => () => {}
    };

    const deltaSyncA = new DeltaSyncService(dbA, cryptoA);
    const deltaSyncB = new DeltaSyncService(dbB, cryptoB);

    receiverA = new MeshReceiverService(transportA, deltaSyncA);
    receiverB = new MeshReceiverService(transportB, deltaSyncB);

    receiverA.start();
    receiverB.start();

    sosServiceA = new SosService(dbA, cryptoA, transportA);
    incidentServiceA = new IncidentService(dbA, cryptoA, transportA);
    voteServiceB = new VoteService(dbB, cryptoB, transportB);
    shelterServiceA = new ShelterService(dbA, cryptoA, transportA);
    chatServiceA = new ChatService(dbA, cryptoA, transportA);
  });

  afterEach(async () => {
    receiverA.stop();
    receiverB.stop();
    await dbA.close();
    await dbB.close();
  });

  it('synchronizes live SOS distress from Device A to Device B over radio broadcast', async () => {
    const identityA = await cryptoA.createOrLoadIdentity();

    const location: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 5.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    // Device A creates SOS distress
    const sosA = await sosServiceA.createSos(
      {
        headcount: 2,
        message: 'Building collapse, need extrication',
        location,
        batteryLevel: 65
      },
      identityA
    );

    // Device B's receiver should have processed and saved the SOS
    const sosRepoB = new SosService(dbB, cryptoB, transportB);
    const activeB = await sosRepoB.getActiveSos();

    expect(activeB).toHaveLength(1);
    expect(activeB[0]?.sosId).toBe(sosA.sosId);
    expect(activeB[0]?.batteryLevel).toBe(65);
    expect(activeB[0]?.headcount).toBe(2);
    expect(activeB[0]?.message).toBe('Building collapse, need extrication');
  });

  it('Device A broadcasts incident, Device B receives it and casts a vote back, updating Device A confidence', async () => {
    const identityA = await cryptoA.createOrLoadIdentity();
    const identityB = await cryptoB.createOrLoadIdentity();

    const loc: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 8.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    // Device A reports incident
    const incidentA = await incidentServiceA.reportIncident(
      {
        category: 'FLOOD',
        description: 'Road submerged by flash flood',
        severity: 4,
        location: loc
      },
      identityA
    );

    // Verify Device B received and projected incident
    const incidentServiceB = new IncidentService(dbB, cryptoB, transportB);
    const incidentOnB = await incidentServiceB.getIncidentById(incidentA.incidentId);
    expect(incidentOnB).not.toBeNull();
    expect(incidentOnB?.incidentId).toBe(incidentA.incidentId);

    // Device B casts a CONFIRM vote (within 50m)
    const voteRes = await voteServiceB.castVote(
      {
        incidentId: incidentA.incidentId,
        voteType: 'CONFIRM',
        location: loc
      },
      identityB
    );

    expect(voteRes.isEffective).toBe(true);

    // Device A received the vote via radio broadcast and updated its confidence projection
    const updatedA = await incidentServiceA.getIncidentById(incidentA.incidentId);
    expect(updatedA?.confidenceScore).toBeGreaterThan(0);
  });

  it('synchronizes shelter creation and shelter status updates across devices', async () => {
    const identityA = await cryptoA.createOrLoadIdentity();

    const loc: LocationResult = {
      latitude: 12.9600,
      longitude: 77.5700,
      accuracyM: 6.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const shelter = await shelterServiceA.createShelter(
      {
        name: 'Relief Camp Alpha',
        capacity: 500,
        status: 'OPEN',
        location: loc
      },
      identityA
    );

    const shelterServiceB = new ShelterService(dbB, cryptoB, transportB);
    const sheltersB = await shelterServiceB.getAllShelters();
    expect(sheltersB).toHaveLength(1);
    expect(sheltersB[0]?.shelterId).toBe(shelter.shelterId);
    expect(sheltersB[0]?.currentStatus).toBe('OPEN');

    // Device A updates shelter status to FULL
    await shelterServiceA.updateShelterStatus(
      {
        shelterId: shelter.shelterId,
        status: 'FULL',
        availableCapacity: 0,
        location: loc
      },
      identityA
    );

    // Device B projection automatically updates to FULL
    const updatedB = await shelterServiceB.getAllShelters();
    expect(updatedB[0]?.currentStatus).toBe('FULL');
  });

  it('synchronizes mesh chat messages across devices', async () => {
    const identityA = await cryptoA.createOrLoadIdentity();

    await chatServiceA.sendMessage(
      {
        text: 'Medical team en route to Sector 4'
      },
      identityA
    );

    const chatServiceB = new ChatService(dbB, cryptoB, transportB);
    const messagesB = await chatServiceB.getMessages();
    expect(messagesB).toHaveLength(1);
    expect(messagesB[0]?.body).toBe('Medical team en route to Sector 4');
  });
});
