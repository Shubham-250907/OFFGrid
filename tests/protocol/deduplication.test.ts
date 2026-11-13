import { describe, it, expect } from 'vitest';
import { PriorityRelayScheduler } from '../../src/mesh/relay/PriorityRelayScheduler';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { PacketEnvelope } from '../../src/mesh/protocol/contracts';

describe('Packet Deduplication in Mesh Relay', () => {
  const createMockTransport = (): MeshTransportAdapter => ({
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
  });

  const createDummyEnvelope = (packetId: string): PacketEnvelope<any> => ({
    protocol: 'OFFGRID',
    protocolVersion: 1,
    schemaVersion: 1,
    packetId,
    type: 'INCIDENT',
    senderPublicKey: 'pub_test',
    keyAlgorithm: 'ED25519',
    createdAt: 1000,
    ttl: 10,
    hopCount: 0,
    payload: { id: 1 },
    payloadHash: 'hash',
    signature: 'sig'
  });

  it('rejects and drops duplicate packet IDs seen previously', () => {
    const transport = createMockTransport();
    const scheduler = new PriorityRelayScheduler(transport);

    const env = createDummyEnvelope('dup-packet-id');

    // First reception
    const res1 = scheduler.enqueueRelay(env);
    expect(res1).toBe(true);
    expect(scheduler.isDuplicate('dup-packet-id')).toBe(true);

    // Second reception from a different peer path
    const res2 = scheduler.enqueueRelay(env);
    expect(res2).toBe(false);

    expect(scheduler.getQueueLength()).toBe(1);
  });
});
