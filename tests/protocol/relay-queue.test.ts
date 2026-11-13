import { describe, it, expect } from 'vitest';
import { PriorityRelayScheduler } from '../../src/mesh/relay/PriorityRelayScheduler';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { PacketEnvelope } from '../../src/mesh/protocol/contracts';

describe('PriorityRelayScheduler and Hop Bounding', () => {
  const createMockTransport = (): MeshTransportAdapter => {
    return {
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
  };

  const createDummyEnvelope = (
    packetId: string,
    type: any,
    ttl = 10,
    hopCount = 0
  ): PacketEnvelope<any> => ({
    protocol: 'OFFGRID',
    protocolVersion: 1,
    schemaVersion: 1,
    packetId,
    type,
    senderPublicKey: 'pub_test',
    keyAlgorithm: 'ED25519',
    createdAt: 1000,
    ttl,
    hopCount,
    payload: {},
    payloadHash: 'hash',
    signature: 'sig'
  });

  it('schedules higher priority packets ahead of lower priority packets regardless of arrival order', () => {
    const transport = createMockTransport();
    const scheduler = new PriorityRelayScheduler(transport);

    // Enqueue in reverse order: CHAT (4), VOTE (5), SHELTER (6), INCIDENT (8), SOS (10)
    scheduler.enqueueRelay(createDummyEnvelope('chat-1', 'CHAT'));
    scheduler.enqueueRelay(createDummyEnvelope('vote-1', 'VOTE'));
    scheduler.enqueueRelay(createDummyEnvelope('shelter-1', 'SHELTER'));
    scheduler.enqueueRelay(createDummyEnvelope('incident-1', 'INCIDENT'));
    scheduler.enqueueRelay(createDummyEnvelope('sos-1', 'SOS'));

    // SOS must be first
    const first = scheduler.peekNext();
    expect(first?.envelope.packetId).toBe('sos-1');
    expect(first?.priority).toBe(10);
  });

  it('decrements TTL and increments hopCount upon enqueue', () => {
    const transport = createMockTransport();
    const scheduler = new PriorityRelayScheduler(transport);

    const env = createDummyEnvelope('env-hop', 'INCIDENT', 10, 0);
    const accepted = scheduler.enqueueRelay(env);
    expect(accepted).toBe(true);

    const queued = scheduler.peekNext();
    expect(queued?.envelope.ttl).toBe(9);
    expect(queued?.envelope.hopCount).toBe(1);
  });

  it('drops packets that exceed max relay hops or have zero TTL', () => {
    const transport = createMockTransport();
    const scheduler = new PriorityRelayScheduler(transport);

    // Expired TTL
    const expiredTtl = createDummyEnvelope('env-exp', 'INCIDENT', 0, 1);
    expect(scheduler.enqueueRelay(expiredTtl)).toBe(false);

    // Exceeded max hops
    const maxHops = createDummyEnvelope('env-max', 'INCIDENT', 5, 10);
    expect(scheduler.enqueueRelay(maxHops)).toBe(false);

    expect(scheduler.getQueueLength()).toBe(0);
  });
});
