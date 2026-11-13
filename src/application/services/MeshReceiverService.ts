import { MeshTransportAdapter } from '../../mesh/adapters/MeshTransportAdapter';
import { DeltaSyncService } from '../../mesh/sync/DeltaSyncService';
import { PacketEnvelope } from '../../mesh/protocol/contracts';

export type EventReceivedListener = (envelope: PacketEnvelope<any>) => void;

export class MeshReceiverService {
  private unsubscribe?: () => void;
  private listeners: Set<EventReceivedListener> = new Set();

  constructor(
    private transport: MeshTransportAdapter,
    private deltaSyncService: DeltaSyncService
  ) {}

  /**
   * Starts listening to live mesh radio messages.
   */
  start(): void {
    if (this.unsubscribe) return;

    this.unsubscribe = this.transport.onMessageReceived(async (peerId: string, payloadBytes: Uint8Array) => {
      await this.handleIncomingMessage(peerId, payloadBytes);
    });
  }

  /**
   * Processes an incoming raw packet from a mesh peer.
   */
  async handleIncomingMessage(peerId: string, payloadBytes: Uint8Array): Promise<void> {
    try {
      const text = new TextDecoder().decode(payloadBytes);
      const parsed = JSON.parse(text);

      if (parsed && parsed.protocol === 'OFFGRID' && parsed.packetId) {
        const envelope = parsed as PacketEnvelope<any>;

        // Process emergency event through delta merge pipeline
        if (
          [
            'SOS',
            'SOS_UPDATE',
            'TRIAGE',
            'INCIDENT',
            'VOTE',
            'SHELTER',
            'SHELTER_UPDATE',
            'CHAT'
          ].includes(envelope.type)
        ) {
          await this.deltaSyncService.mergeSyncBatch([envelope], peerId);
          this.notifyListeners(envelope);
        }
      }
    } catch (err) {
      console.warn('Failed to parse or merge incoming mesh packet', err);
    }
  }

  /**
   * Stops listening to live mesh radio messages.
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  onEventReceived(listener: EventReceivedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(envelope: PacketEnvelope<any>): void {
    for (const listener of this.listeners) {
      try {
        listener(envelope);
      } catch (err) {
        console.error('Error in event received listener', err);
      }
    }
  }
}
