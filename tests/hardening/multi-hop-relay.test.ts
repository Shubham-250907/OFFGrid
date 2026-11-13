import { describe, it, expect } from 'vitest';
import { PriorityRelayScheduler } from '../../src/mesh/relay/PriorityRelayScheduler';
import { MeshPeer, MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { PacketEnvelope } from '../../src/mesh/protocol/contracts';
import { LIMITS } from '../../src/shared/constants/config';

class MockTransport implements MeshTransportAdapter {
  public sentDirect: { peerId: string; data: Uint8Array; priority: number }[] = [];
  public sentBroadcast: { data: Uint8Array; priority: number }[] = [];

  async initialize(): Promise<void> {}
  async startDiscovery(): Promise<void> {}
  async stopDiscovery(): Promise<void> {}
  async connect(_peerId: string): Promise<void> {}
  async disconnect(_peerId: string): Promise<void> {}
  async send(peerId: string, payload: Uint8Array, priority: number): Promise<void> {
    this.sentDirect.push({ peerId, data: payload, priority });
  }
  async broadcast(payload: Uint8Array, priority: number): Promise<void> {
    this.sentBroadcast.push({ data: payload, priority });
  }
  onPeerDiscovered(_cb: (peer: MeshPeer) => void): () => void {
    return () => {};
  }
  onMessageReceived(_cb: (peerId: string, payload: Uint8Array) => void): () => void {
    return () => {};
  }
  onPeerDisconnected(_cb: (peerId: string) => void): () => void {
    return () => {};
  }
}

function makeEnvelope(type: any, packetId: string, ttl = 5, hopCount = 0): PacketEnvelope<any> {
  return {
    protocol: 'OFFGRID',
    protocolVersion: 1,
    schemaVersion: 1,
    packetId,
    type,
    senderPublicKey: 'pub-key-node-origin',
    keyAlgorithm: 'ED25519',
    createdAt: Date.now(),
    ttl,
    hopCount,
    payloadHash: 'hash-' + packetId,
    signature: 'sig-' + packetId,
    payload: { id: packetId }
  };
}

describe('Phase 6 Hardening: Multi-Hop Relay, TTL Decay & Priority Scheduling', () => {
  it('propagates packets across a 5-hop linear network while decrementing TTL and incrementing hopCount', async () => {
    // Linear topology: Node 0 -> Node 1 -> Node 2 -> Node 3 -> Node 4
    const nodes: { transport: MockTransport; scheduler: PriorityRelayScheduler }[] = [];
    for (let i = 0; i < 5; i++) {
      const transport = new MockTransport();
      const scheduler = new PriorityRelayScheduler(transport);
      nodes.push({ transport, scheduler });
    }

    // Origin packet at Node 0 with TTL = 5, hopCount = 0
    const originPacket = makeEnvelope('INCIDENT', 'incident-chain-1', 5, 0);

    // Node 0 enqueues and flushes
    const enqueued0 = nodes[0]!.scheduler.enqueueRelay(originPacket);
    expect(enqueued0).toBe(true);
    await nodes[0]!.scheduler.flushQueue();
    expect(nodes[0]!.transport.sentBroadcast.length).toBe(1);

    // Node 1 receives envelope from Node 0 broadcast
    let currentData = nodes[0]!.transport.sentBroadcast[0]!.data;
    let currentEnvelope: PacketEnvelope<any> = JSON.parse(new TextDecoder().decode(currentData));
    expect(currentEnvelope.ttl).toBe(4);
    expect(currentEnvelope.hopCount).toBe(1);

    // Relay through Node 1 -> 2 -> 3
    for (let hop = 1; hop < 4; hop++) {
      const enqueued = nodes[hop]!.scheduler.enqueueRelay(currentEnvelope);
      expect(enqueued).toBe(true);
      await nodes[hop]!.scheduler.flushQueue();

      currentData = nodes[hop]!.transport.sentBroadcast[0]!.data;
      currentEnvelope = JSON.parse(new TextDecoder().decode(currentData));
      expect(currentEnvelope.ttl).toBe(5 - (hop + 1));
      expect(currentEnvelope.hopCount).toBe(hop + 1);
    }

    // At Node 4, currentEnvelope has ttl=1, hopCount=4
    expect(currentEnvelope.ttl).toBe(1);
    expect(currentEnvelope.hopCount).toBe(4);

    // Node 4 relays it: TTL becomes 0, hopCount becomes 5
    const enqueued4 = nodes[4]!.scheduler.enqueueRelay(currentEnvelope);
    expect(enqueued4).toBe(true);
    await nodes[4]!.scheduler.flushQueue();

    const finalData = nodes[4]!.transport.sentBroadcast[0]!.data;
    const finalEnvelope: PacketEnvelope<any> = JSON.parse(new TextDecoder().decode(finalData));
    expect(finalEnvelope.ttl).toBe(0);
    expect(finalEnvelope.hopCount).toBe(5);

    // Now, any subsequent node receiving this finalEnvelope with ttl=0 MUST drop it
    const node5Transport = new MockTransport();
    const node5Scheduler = new PriorityRelayScheduler(node5Transport);
    const droppedAtZeroTTL = node5Scheduler.enqueueRelay(finalEnvelope);
    expect(droppedAtZeroTTL).toBe(false);
    expect(node5Scheduler.getQueueLength()).toBe(0);
  });

  it('strictly bounds relay hops at MAX_RELAY_HOPS limit even if TTL is artificially large', () => {
    const transport = new MockTransport();
    const scheduler = new PriorityRelayScheduler(transport);

    // Packet with hopCount >= LIMITS.MAX_RELAY_HOPS (10)
    const exhaustedEnvelope = makeEnvelope('CHAT', 'chat-limit-1', 99, LIMITS.MAX_RELAY_HOPS);
    const result = scheduler.enqueueRelay(exhaustedEnvelope);
    expect(result).toBe(false);
    expect(scheduler.getQueueLength()).toBe(0);
  });

  it('strictly prioritizes SOS distress and TRIAGE packets over CHAT and VOTE packets', async () => {
    const transport = new MockTransport();
    const scheduler = new PriorityRelayScheduler(transport);

    // Enqueue in reverse priority order: CHAT (4), VOTE (5), INCIDENT (8), TRIAGE (9), SOS (10)
    scheduler.enqueueRelay(makeEnvelope('CHAT', 'pkt-chat-1', 5, 0));
    scheduler.enqueueRelay(makeEnvelope('VOTE', 'pkt-vote-1', 5, 0));
    scheduler.enqueueRelay(makeEnvelope('INCIDENT', 'pkt-incident-1', 5, 0));
    scheduler.enqueueRelay(makeEnvelope('TRIAGE', 'pkt-triage-1', 5, 0));
    scheduler.enqueueRelay(makeEnvelope('SOS', 'pkt-sos-1', 5, 0));

    expect(scheduler.getQueueLength()).toBe(5);

    // Verify peek is highest priority (SOS)
    expect(scheduler.peekNext()?.envelope.type).toBe('SOS');

    // Flush and verify transmission ordering
    await scheduler.flushQueue();
    expect(transport.sentBroadcast.length).toBe(5);

    const emittedTypes = transport.sentBroadcast.map(b => {
      const env = JSON.parse(new TextDecoder().decode(b.data));
      return env.type;
    });

    expect(emittedTypes).toEqual(['SOS', 'TRIAGE', 'INCIDENT', 'VOTE', 'CHAT']);
  });

  it('deduplicates packets arriving over multiple mesh multipath routes', () => {
    const transport = new MockTransport();
    const scheduler = new PriorityRelayScheduler(transport);

    const pkt = makeEnvelope('INCIDENT', 'multipath-pkt-1', 5, 1);

    // First arrival from Peer A
    const firstArrival = scheduler.enqueueRelay(pkt, 'peer-b');
    expect(firstArrival).toBe(true);

    // Redundant arrival from Peer C for the same packet ID
    const duplicateArrival = scheduler.enqueueRelay(pkt, 'peer-d');
    expect(duplicateArrival).toBe(false);

    expect(scheduler.getQueueLength()).toBe(1);
  });
});
