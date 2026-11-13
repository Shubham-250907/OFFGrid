import { PacketEnvelope } from '../protocol/contracts';
import { PACKET_PRIORITY, LIMITS } from '../../shared/constants/config';
import { MeshTransportAdapter } from '../adapters/MeshTransportAdapter';

export interface QueuedRelayPacket<T = any> {
  envelope: PacketEnvelope<T>;
  priority: number;
  enqueuedAt: number;
  targetPeerId?: string; // If undefined, broadcast
}

export class PriorityRelayScheduler {
  private queue: QueuedRelayPacket[] = [];
  private seenPacketIds = new Set<string>();
  private maxSeenSize: number;

  constructor(
    private transport: MeshTransportAdapter,
    maxSeenSize = 5000
  ) {
    this.maxSeenSize = maxSeenSize;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isDuplicate(packetId: string): boolean {
    return this.seenPacketIds.has(packetId);
  }

  markSeen(packetId: string): void {
    if (this.seenPacketIds.size >= this.maxSeenSize) {
      // Evict oldest entry (simple set iterator shift)
      const first = this.seenPacketIds.values().next().value;
      if (first) {
        this.seenPacketIds.delete(first);
      }
    }
    this.seenPacketIds.add(packetId);
  }

  /**
   * Enqueues an envelope for relay transmission with priority scheduling and hop budget validation.
   * Returns true if packet was enqueued, false if dropped (duplicate or TTL expired).
   */
  enqueueRelay<T>(envelope: PacketEnvelope<T>, targetPeerId?: string): boolean {
    // 1. Deduplication check
    if (this.isDuplicate(envelope.packetId)) {
      return false;
    }

    // 2. Hop budget and TTL check (Section 7.10 & 8.5)
    if (envelope.ttl <= 0 || envelope.hopCount >= LIMITS.MAX_RELAY_HOPS) {
      return false; // Drop packet
    }

    // 3. Decrement TTL and increment hop count for relay
    const relayEnvelope: PacketEnvelope<T> = {
      ...envelope,
      ttl: envelope.ttl - 1,
      hopCount: envelope.hopCount + 1
    };

    // 4. Assign priority based on packet type
    const priority = this.getPriorityForType(relayEnvelope.type);

    this.markSeen(relayEnvelope.packetId);

    this.queue.push({
      envelope: relayEnvelope,
      priority,
      enqueuedAt: Date.now(),
      targetPeerId
    });

    // Sort by priority DESC (highest priority first), then by enqueuedAt ASC (FIFO within priority)
    this.queue.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.enqueuedAt - b.enqueuedAt;
    });

    return true;
  }

  /**
   * Flushes and transmits queued packets via the transport adapter.
   */
  async flushQueue(maxCount = 50): Promise<number> {
    const toSend = this.queue.splice(0, maxCount);
    let sentCount = 0;

    for (const item of toSend) {
      const serialized = new TextEncoder().encode(JSON.stringify(item.envelope));

      if (item.targetPeerId) {
        await this.transport.send(item.targetPeerId, serialized, item.priority);
      } else {
        await this.transport.broadcast(serialized, item.priority);
      }
      sentCount++;
    }

    return sentCount;
  }

  peekNext(): QueuedRelayPacket | null {
    return this.queue[0] ?? null;
  }

  clearQueue(): void {
    this.queue = [];
  }

  private getPriorityForType(type: string): number {
    switch (type) {
      case 'SOS':
      case 'SOS_UPDATE':
        return PACKET_PRIORITY.SOS; // 10
      case 'TRIAGE':
        return PACKET_PRIORITY.TRIAGE; // 9
      case 'INCIDENT':
        return PACKET_PRIORITY.INCIDENT; // 8
      case 'SHELTER_UPDATE':
        return PACKET_PRIORITY.SHELTER_UPDATE; // 7
      case 'SHELTER':
        return PACKET_PRIORITY.SHELTER; // 6
      case 'VOTE':
        return PACKET_PRIORITY.VOTE; // 5
      case 'CHAT':
        return PACKET_PRIORITY.CHAT; // 4
      case 'SYNC_MANIFEST':
        return PACKET_PRIORITY.SYNC_MANIFEST; // 2
      default:
        return PACKET_PRIORITY.BULK_SYNC; // 1
    }
  }
}
