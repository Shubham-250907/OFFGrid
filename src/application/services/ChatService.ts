import { DatabaseConnection } from '../../data/database/connection';
import { EventRepository, StoredEventRecord } from '../../data/repositories/EventRepository';
import { ChatRepository, ChatMessageProjection } from '../../data/repositories/ChatRepository';
import { RelayQueueRepository } from '../../data/repositories/RelayQueueRepository';
import { CryptoProvider, DeviceIdentity } from '../../security/identity/DeviceIdentity';
import { MeshTransportAdapter } from '../../mesh/adapters/MeshTransportAdapter';
import { createEnvelope } from '../../mesh/protocol/envelope';
import { signEnvelope } from '../../security/signing/signPayload';
import { generateUuid } from '../../shared/utils';
import { PACKET_PRIORITY, LIMITS } from '../../shared/constants/config';
import { validateChatPayload } from '../../domain/validation/packetValidation';
import { ChatPayload } from '../../mesh/protocol/contracts';

export interface SendMessageInput {
  text: string;
  recipientPublicKey?: string; // If omitted, broadcast
}

export class ChatService {
  private eventRepo: EventRepository;
  private chatRepo: ChatRepository;
  private relayRepo: RelayQueueRepository;

  constructor(
    private db: DatabaseConnection,
    private crypto: CryptoProvider,
    private transport: MeshTransportAdapter
  ) {
    this.eventRepo = new EventRepository(db);
    this.chatRepo = new ChatRepository(db);
    this.relayRepo = new RelayQueueRepository(db);
  }

  /**
   * Sends a local radio chat message.
   * Discloses MVP plaintext visibility (not end-to-end encrypted).
   */
  async sendMessage(
    input: SendMessageInput,
    identity: DeviceIdentity
  ): Promise<ChatMessageProjection> {
    const now = Date.now();
    const messageId = generateUuid();
    const messageType: 'DIRECT' | 'BROADCAST' = input.recipientPublicKey ? 'DIRECT' : 'BROADCAST';

    const payload: ChatPayload = {
      messageId,
      senderPublicKey: identity.publicKey,
      recipientPublicKey: input.recipientPublicKey,
      messageType,
      text: input.text,
      createdAt: now,
      expiresAt: now + LIMITS.INCIDENT_ACTIVE_WINDOW_MS
    };

    validateChatPayload(payload);

    // 1. Create and sign canonical envelope
    const envelope = createEnvelope('CHAT', payload, identity, LIMITS.MAX_RELAY_HOPS);
    envelope.signature = await signEnvelope(envelope, this.crypto);

    // 2. Persist transactionally
    await this.db.transaction(async (tx) => {
      const record: StoredEventRecord = {
        event_id: envelope.packetId,
        event_type: 'CHAT',
        entity_id: messageId,
        author_public_key: identity.publicKey,
        author_timestamp: now,
        received_at: now,
        protocol_version: 1,
        schema_version: 1,
        payload_json: JSON.stringify(payload),
        payload_hash: envelope.payloadHash,
        signature: envelope.signature,
        validation_status: 'VALID'
      };

      await this.eventRepo.saveEvent(record, tx);
      await this.chatRepo.projectChat(payload, envelope.packetId, tx);
      await this.relayRepo.enqueue(
        envelope.packetId,
        input.recipientPublicKey ?? 'BROADCAST_ALL',
        PACKET_PRIORITY.CHAT,
        tx
      );
    });

    // 3. Radio transmission at priority 4
    const serialized = new TextEncoder().encode(JSON.stringify(envelope));
    try {
      if (input.recipientPublicKey) {
        await this.transport.broadcast(serialized, PACKET_PRIORITY.CHAT);
      } else {
        await this.transport.broadcast(serialized, PACKET_PRIORITY.CHAT);
      }
    } catch (e) {
      console.warn('Chat transmission queued', e);
    }

    const messages = await this.chatRepo.getMessages(input.recipientPublicKey);
    return messages.find((m) => m.messageId === messageId)!;
  }

  async getMessages(recipientPublicKey?: string): Promise<ChatMessageProjection[]> {
    return this.chatRepo.getMessages(recipientPublicKey);
  }
}
