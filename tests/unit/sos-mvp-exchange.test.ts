import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { DeltaSyncService } from '../../src/mesh/sync/DeltaSyncService';
import { MeshReceiverService } from '../../src/application/services/MeshReceiverService';
import { SosRepository } from '../../src/data/repositories/SosRepository';
import { ChatRepository } from '../../src/data/repositories/ChatRepository';
import { MeshTransportAdapter, MeshPeer } from '../../src/mesh/adapters/MeshTransportAdapter';
import { utf8Encode } from '../../src/shared/utils';

class TestMockTransport implements MeshTransportAdapter {
  private messageListeners = new Set<(peerId: string, payload: Uint8Array) => void>();
  private peerDiscoveredListeners = new Set<(peer: MeshPeer) => void>();
  private peerDisconnectedListeners = new Set<(peerId: string) => void>();

  async initialize(): Promise<void> {}
  async startDiscovery(): Promise<void> {}
  async stopDiscovery(): Promise<void> {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async send(): Promise<void> {}
  async broadcast(): Promise<void> {}

  onPeerDiscovered(cb: (peer: MeshPeer) => void): () => void {
    this.peerDiscoveredListeners.add(cb);
    return () => this.peerDiscoveredListeners.delete(cb);
  }

  onPeerDisconnected(cb: (peerId: string) => void): () => void {
    this.peerDisconnectedListeners.add(cb);
    return () => this.peerDisconnectedListeners.delete(cb);
  }

  onMessageReceived(cb: (peerId: string, payload: Uint8Array) => void): () => void {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  // Helper to simulate incoming BLE frame over the radio
  simulateIncomingBytes(peerId: string, payload: Uint8Array) {
    for (const cb of this.messageListeners) {
      cb(peerId, payload);
    }
  }
}

describe('OFFGRID MVP: Two-Phone SOS and Chat Exchange', () => {
  let dbPhoneA: NodeSqliteDriver;
  let dbPhoneB: NodeSqliteDriver;
  let cryptoPhoneA: Ed25519CryptoProvider;
  let cryptoPhoneB: Ed25519CryptoProvider;
  let transportPhoneA: TestMockTransport;
  let transportPhoneB: TestMockTransport;
  let receiverPhoneA: MeshReceiverService;
  let receiverPhoneB: MeshReceiverService;
  let sosRepoPhoneB: SosRepository;
  let chatRepoPhoneA: ChatRepository;

  beforeEach(async () => {
    // Setup Phone A
    dbPhoneA = new NodeSqliteDriver(':memory:');
    await runMigrations(dbPhoneA);
    cryptoPhoneA = new Ed25519CryptoProvider();
    transportPhoneA = new TestMockTransport();
    const deltaSyncA = new DeltaSyncService(dbPhoneA, cryptoPhoneA);
    receiverPhoneA = new MeshReceiverService(transportPhoneA, deltaSyncA);
    receiverPhoneA.start();
    chatRepoPhoneA = new ChatRepository(dbPhoneA);

    // Setup Phone B
    dbPhoneB = new NodeSqliteDriver(':memory:');
    await runMigrations(dbPhoneB);
    cryptoPhoneB = new Ed25519CryptoProvider();
    transportPhoneB = new TestMockTransport();
    const deltaSyncB = new DeltaSyncService(dbPhoneB, cryptoPhoneB);
    receiverPhoneB = new MeshReceiverService(transportPhoneB, deltaSyncB);
    receiverPhoneB.start();
    sosRepoPhoneB = new SosRepository(dbPhoneB);
  });

  it('Step 3: Phone A sends minimal SOS -> Phone B receives, validates, saves to DB, and displays', async () => {
    const sosMessage = {
      messageId: 'sos_msg_phoneA_001',
      senderDeviceId: 'phone_a_node_id',
      messageType: 'SOS',
      messageText: 'Flooding in basement! 3 people trapped need urgent rescue.',
      headcount: 3,
      batteryLevel: 85,
      timestamp: Date.now()
    };

    let phoneBNotificationReceived = false;
    receiverPhoneB.onEventReceived((envelope) => {
      if (envelope.type === 'SOS') {
        phoneBNotificationReceived = true;
      }
    });

    // Simulate BLE transmission over the radio to Phone B
    const payloadBytes = utf8Encode(JSON.stringify(sosMessage));
    transportPhoneB.simulateIncomingBytes('PEER_PHONE_A', payloadBytes);

    // Wait a brief moment for async SQLite transaction to commit
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(phoneBNotificationReceived).toBe(true);

    // Verify Phone B's local SQLite database holds the SOS projection
    const activeSos = await sosRepoPhoneB.getActiveSos();
    expect(activeSos.length).toBe(1);
    expect(activeSos[0]?.sosId).toBe('sos_msg_phoneA_001');
    expect(activeSos[0]?.message).toBe('Flooding in basement! 3 people trapped need urgent rescue.');
    expect(activeSos[0]?.headcount).toBe(3);
    expect(activeSos[0]?.batteryLevel).toBe(85);
  });

  it('Step 3 (Duplicate Prevention): Phone B drops duplicate SOS packets with same messageId', async () => {
    const sosMessage = {
      messageId: 'sos_msg_phoneA_dup_test',
      senderDeviceId: 'phone_a_node_id',
      messageType: 'SOS',
      messageText: 'Medical assistance requested.',
      headcount: 1,
      batteryLevel: 90,
      timestamp: Date.now()
    };

    const payloadBytes = utf8Encode(JSON.stringify(sosMessage));

    // Deliver first time
    transportPhoneB.simulateIncomingBytes('PEER_PHONE_A', payloadBytes);
    await new Promise((resolve) => setTimeout(resolve, 50));

    let activeSos = await sosRepoPhoneB.getActiveSos();
    expect(activeSos.length).toBe(1);

    // Deliver exact duplicate
    transportPhoneB.simulateIncomingBytes('PEER_PHONE_A', payloadBytes);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Ensure database still has exactly 1 entry without throwing or duplicating
    activeSos = await sosRepoPhoneB.getActiveSos();
    expect(activeSos.length).toBe(1);
  });

  it('Step 3 (Bidirectional Reply): Phone B sends reply chat -> Phone A receives, saves to DB, and displays', async () => {
    const replyMessage = {
      messageId: 'chat_msg_phoneB_reply_001',
      senderDeviceId: 'phone_b_node_id',
      messageType: 'CHAT',
      messageText: 'Rescue team is on the way. Keep your device on and stay above water level.',
      timestamp: Date.now()
    };

    let phoneANotificationReceived = false;
    receiverPhoneA.onEventReceived((envelope) => {
      if (envelope.type === 'CHAT') {
        phoneANotificationReceived = true;
      }
    });

    // Simulate BLE transmission back to Phone A
    const payloadBytes = utf8Encode(JSON.stringify(replyMessage));
    transportPhoneA.simulateIncomingBytes('PEER_PHONE_B', payloadBytes);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(phoneANotificationReceived).toBe(true);

    // Verify Phone A's local SQLite database holds the reply in chat_messages
    const messages = await chatRepoPhoneA.getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0]?.body).toBe('Rescue team is on the way. Keep your device on and stay above water level.');
    expect(messages[0]?.senderPublicKey).toBe('phone_b_node_id');
  });
});
