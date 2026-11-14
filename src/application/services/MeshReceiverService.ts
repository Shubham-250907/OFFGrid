import { MeshTransportAdapter } from '../../mesh/adapters/MeshTransportAdapter';
import { DeltaSyncService } from '../../mesh/sync/DeltaSyncService';
import { PacketEnvelope } from '../../mesh/protocol/contracts';
import { utf8Decode } from '../../shared/utils';
import { hashCanonicalPayload } from '../../security/hashing/sha256';

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
      const text = utf8Decode(payloadBytes);
      const parsed = JSON.parse(text);

      if (!parsed) return;

      // 1. Standard full OFFGRID packet envelope
      if (parsed.protocol === 'OFFGRID' && parsed.packetId) {
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
        return;
      }

      // 2. Minimal MVP SOS message format
      if (parsed.messageType === 'SOS' || parsed.type === 'SOS') {
        const packetId = String(parsed.messageId || parsed.packetId || 'sos_' + Date.now());
        const senderId = String(parsed.senderDeviceId || parsed.senderId || peerId);
        const timestamp = typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now();
        const message = String(parsed.messageText || parsed.payload?.message || 'Emergency SOS Distress');

        const payload = {
          sosId: packetId,
          message,
          headcount: parsed.headcount || 1,
          batteryLevel: parsed.batteryLevel ?? 100,
          locationStatus: parsed.locationStatus || 'UNAVAILABLE',
          latitude: parsed.latitude ?? null,
          longitude: parsed.longitude ?? null,
          accuracyM: parsed.accuracyM ?? null,
          createdAt: timestamp,
          expiresAt: timestamp + 86400000
        };

        const envelope: PacketEnvelope<any> = {
          protocol: 'OFFGRID',
          protocolVersion: 1,
          schemaVersion: 1,
          packetId,
          type: 'SOS',
          senderPublicKey: senderId,
          keyAlgorithm: 'ED25519',
          createdAt: timestamp,
          ttl: 3,
          hopCount: 0,
          payload,
          payloadHash: hashCanonicalPayload(payload),
          signature: 'mvp_sig'
        };

        await this.deltaSyncService.mergeSyncBatch([envelope], peerId);
        this.notifyListeners(envelope);
        return;
      }

      // 3. Minimal MVP CHAT message format
      if (parsed.messageType === 'CHAT' || parsed.type === 'CHAT') {
        const packetId = String(parsed.messageId || parsed.packetId || 'chat_' + Date.now());
        const senderId = String(parsed.senderDeviceId || parsed.senderId || peerId);
        const timestamp = typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now();
        const text = String(parsed.messageText || parsed.text || parsed.payload?.text || parsed.payload?.body || '');

        const payload = {
          messageId: packetId,
          text,
          messageType: 'BROADCAST' as const,
          senderPublicKey: senderId,
          createdAt: timestamp,
          expiresAt: timestamp + 86400000
        };

        const envelope: PacketEnvelope<any> = {
          protocol: 'OFFGRID',
          protocolVersion: 1,
          schemaVersion: 1,
          packetId,
          type: 'CHAT',
          senderPublicKey: senderId,
          keyAlgorithm: 'ED25519',
          createdAt: timestamp,
          ttl: 3,
          hopCount: 0,
          payload,
          payloadHash: hashCanonicalPayload(payload),
          signature: 'mvp_sig'
        };

        await this.deltaSyncService.mergeSyncBatch([envelope], peerId);
        this.notifyListeners(envelope);
        return;
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
