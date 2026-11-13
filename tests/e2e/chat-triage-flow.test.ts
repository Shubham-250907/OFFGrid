import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { TriageService } from '../../src/application/services/TriageService';
import { ChatService } from '../../src/application/services/ChatService';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { MeshTransportAdapter } from '../../src/mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../src/shared/types';
import { MockLocationRejectedError, ValidationError } from '../../src/shared/errors/AppError';

describe('E2E Triage Coordination and Local Mesh Chat Flow', () => {
  let db: NodeSqliteDriver;
  let crypto: Ed25519CryptoProvider;
  let transport: MeshTransportAdapter;
  let triageService: TriageService;
  let chatService: ChatService;
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

    triageService = new TriageService(db, crypto, transport);
    chatService = new ChatService(db, crypto, transport);
  });

  afterEach(async () => {
    await db.close();
  });

  it('submits triage request with headcount and coordinates, broadcasting at priority 9', async () => {
    const author = await crypto.createOrLoadIdentity();

    const loc: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 8.0,
      timestamp: Date.now(),
      isMock: false,
      provider: 'gps',
      status: 'AVAILABLE'
    };

    const triage = await triageService.submitTriage(
      {
        category: 'TRAPPED',
        headcount: 4,
        description: 'Family stranded on 2nd floor balcony',
        location: loc
      },
      author
    );

    expect(triage.triageId).toBeTruthy();
    expect(triage.category).toBe('TRAPPED');
    expect(triage.headcount).toBe(4);
    expect(triage.latitude).toBe(12.9716);
    expect(broadcastCount).toBe(1);

    const all = await triageService.getAllTriage();
    expect(all).toHaveLength(1);
    expect(all[0]?.triageId).toBe(triage.triageId);
  });

  it('rejects triage with mock GPS provider', async () => {
    const author = await crypto.createOrLoadIdentity();

    const mockLoc: LocationResult = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 5.0,
      timestamp: Date.now(),
      isMock: true,
      provider: 'fused',
      status: 'MOCK'
    };

    await expect(
      triageService.submitTriage(
        {
          category: 'MEDICAL',
          headcount: 1,
          location: mockLoc
        },
        author
      )
    ).rejects.toThrow(MockLocationRejectedError);

    expect(broadcastCount).toBe(0);
  });

  it('sends and persists broadcast chat message at priority 4', async () => {
    const author = await crypto.createOrLoadIdentity();

    const msg = await chatService.sendMessage(
      {
        text: 'Anyone near 5th cross road have extra drinking water?'
      },
      author
    );

    expect(msg.messageId).toBeTruthy();
    expect(msg.senderPublicKey).toBe(author.publicKey);
    expect(msg.messageType).toBe('BROADCAST');
    expect(msg.body).toBe('Anyone near 5th cross road have extra drinking water?');
    expect(msg.deliveryState).toBe('PENDING');
    expect(broadcastCount).toBe(1);

    const msgs = await chatService.getMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.messageId).toBe(msg.messageId);
  });

  it('sends direct chat message and enforces 2000 character limit', async () => {
    const author = await crypto.createOrLoadIdentity();
    const recipient = await crypto.createOrLoadIdentity();

    const msg = await chatService.sendMessage(
      {
        text: 'Direct coordinate dispatch: rendezvous at shelter B',
        recipientPublicKey: recipient.publicKey
      },
      author
    );

    expect(msg.messageType).toBe('DIRECT');
    expect(msg.recipientPublicKey).toBe(recipient.publicKey);

    // Exceeding 2000 characters
    const oversizeText = 'A'.repeat(2001);
    await expect(
      chatService.sendMessage(
        {
          text: oversizeText,
          recipientPublicKey: recipient.publicKey
        },
        author
      )
    ).rejects.toThrow(ValidationError);
  });
});
