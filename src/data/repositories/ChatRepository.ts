import { DatabaseConnection } from '../database/connection';
import { ChatPayload } from '../../mesh/protocol/contracts';

export interface ChatMessageProjection {
  messageId: string;
  eventId: string;
  senderPublicKey: string;
  recipientPublicKey?: string;
  messageType: 'DIRECT' | 'BROADCAST';
  body: string;
  createdAt: number;
  expiresAt: number;
  deliveryState: 'PENDING' | 'SENT' | 'DELIVERED';
}

export class ChatRepository {
  constructor(private db: DatabaseConnection) {}

  async projectChat(
    payload: ChatPayload,
    eventId: string,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `INSERT INTO chat_messages (
        message_id, event_id, sender_public_key, recipient_public_key,
        message_type, body, created_at, expires_at, delivery_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      ON CONFLICT(message_id) DO NOTHING;`,
      [
        payload.messageId,
        eventId,
        payload.senderPublicKey,
        payload.recipientPublicKey ?? null,
        payload.messageType,
        payload.text,
        payload.createdAt,
        payload.expiresAt
      ]
    );
  }

  async getMessages(
    recipientPublicKey?: string,
    tx?: DatabaseConnection
  ): Promise<ChatMessageProjection[]> {
    const conn = tx ?? this.db;
    let queryStr = `SELECT * FROM chat_messages WHERE message_type = 'BROADCAST'`;
    const params: unknown[] = [];

    if (recipientPublicKey) {
      queryStr += ` OR (sender_public_key = ? OR recipient_public_key = ?)`;
      params.push(recipientPublicKey, recipientPublicKey);
    }

    queryStr += ` ORDER BY created_at ASC;`;

    const rows = await conn.query<any>(queryStr, params);
    return rows.map((r) => ({
      messageId: r.message_id,
      eventId: r.event_id,
      senderPublicKey: r.sender_public_key,
      recipientPublicKey: r.recipient_public_key ?? undefined,
      messageType: r.message_type,
      body: r.body,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      deliveryState: r.delivery_state
    }));
  }
}
