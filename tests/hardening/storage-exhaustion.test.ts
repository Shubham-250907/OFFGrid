import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { StoragePruningService } from '../../src/data/retention/StoragePruningService';
import { EventRepository, StoredEventRecord } from '../../src/data/repositories/EventRepository';

describe('Phase 6 Hardening: Low Storage Pruning & Distress Preservation', () => {
  let db: NodeSqliteDriver;
  let eventRepo: EventRepository;
  let pruningService: StoragePruningService;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
    eventRepo = new EventRepository(db);
    pruningService = new StoragePruningService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  function makeRecord(
    eventId: string,
    eventType: any,
    payload: any,
    timestamp: number
  ): StoredEventRecord {
    return {
      event_id: eventId,
      event_type: eventType,
      entity_id: eventId,
      author_public_key: 'pub-sender-key-1',
      author_timestamp: timestamp,
      received_at: timestamp,
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify(payload),
      payload_hash: 'hash-' + eventId,
      signature: 'sig-' + eventId,
      validation_status: 'VALID'
    };
  }

  it('prunes expired chats under storage pressure while strictly preserving all SOS, TRIAGE, and INCIDENT records', async () => {
    const now = 1000000;
    const sender = 'pub-sender-key-1';

    // 1. Insert critical emergency SOS event
    await eventRepo.saveEvent(
      makeRecord('sos-critical-1', 'SOS', { sosId: 'sos-critical-1', batteryLevel: 15 }, now - 50000)
    );

    // 2. Insert critical TRIAGE event
    await eventRepo.saveEvent(
      makeRecord('triage-critical-1', 'TRIAGE', { triageId: 'tr-1', category: 'RED' }, now - 40000)
    );

    // 3. Insert critical INCIDENT event
    await eventRepo.saveEvent(
      makeRecord('incident-critical-1', 'INCIDENT', { incidentId: 'inc-1', category: 'FLOOD' }, now - 30000)
    );

    // 4. Insert an expired CHAT event & chat_messages row (expires_at < now, delivery_state = 'DELIVERED')
    await eventRepo.saveEvent(
      makeRecord('chat-expired-1', 'CHAT', { messageId: 'msg-exp-1', body: 'Old gossip' }, now - 7200000)
    );
    await db.execute(
      `INSERT INTO chat_messages (message_id, event_id, sender_public_key, recipient_public_key, message_type, body, created_at, expires_at, delivery_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      ['msg-exp-1', 'chat-expired-1', sender, 'pub-recipient-1', 'DIRECT', 'Old gossip', now - 7200000, now - 3600000, 'DELIVERED']
    );

    // 5. Insert an unexpired CHAT event & chat_messages row (expires_at > now)
    await eventRepo.saveEvent(
      makeRecord('chat-active-1', 'CHAT', { messageId: 'msg-active-1', body: 'Recent query' }, now - 1000)
    );
    await db.execute(
      `INSERT INTO chat_messages (message_id, event_id, sender_public_key, recipient_public_key, message_type, body, created_at, expires_at, delivery_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      ['msg-active-1', 'chat-active-1', sender, 'pub-recipient-1', 'DIRECT', 'Recent query', now - 1000, now + 3600000, 'PENDING']
    );

    // Initial check: 5 total events
    const initialEvents = await eventRepo.getAllEvents();
    expect(initialEvents.length).toBe(5);

    // Run pruning under storage pressure
    const pruneResult = await pruningService.pruneLowStorage(now);

    expect(pruneResult.prunedChatMessages).toBe(1);
    expect(pruneResult.prunedExpiredEvents).toBe(1);
    expect(pruneResult.activeCriticalEventsPreserved).toBe(3);

    // Verify chat_messages: only active chat remains
    const remainingChats = await db.query<any>('SELECT * FROM chat_messages;');
    expect(remainingChats.length).toBe(1);
    expect(remainingChats[0].message_id).toBe('msg-active-1');

    // Verify events: expired chat event was deleted, but all 3 critical events + 1 active chat remain
    const remainingEvents = await eventRepo.getAllEvents();
    expect(remainingEvents.length).toBe(4);

    const remainingEventIds = remainingEvents.map(e => e.event_id);
    expect(remainingEventIds).toContain('sos-critical-1');
    expect(remainingEventIds).toContain('triage-critical-1');
    expect(remainingEventIds).toContain('incident-critical-1');
    expect(remainingEventIds).toContain('chat-active-1');
    expect(remainingEventIds).not.toContain('chat-expired-1');
  });

  it('never deletes pending un-relayed chat messages even if their timestamps are old', async () => {
    const now = 1000000;
    const sender = 'pub-sender-key-2';

    // Chat marked PENDING delivery must NOT be pruned because it hasn't reached peers
    await eventRepo.saveEvent(
      makeRecord('chat-pending-1', 'CHAT', { messageId: 'msg-pending-1', body: 'Unsent urgent note' }, now - 5000000)
    );
    await db.execute(
      `INSERT INTO chat_messages (message_id, event_id, sender_public_key, recipient_public_key, message_type, body, created_at, expires_at, delivery_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      ['msg-pending-1', 'chat-pending-1', sender, 'pub-recipient-2', 'DIRECT', 'Unsent urgent note', now - 5000000, now - 1000, 'PENDING']
    );

    const pruneResult = await pruningService.pruneLowStorage(now);
    expect(pruneResult.prunedChatMessages).toBe(0);
    expect(pruneResult.prunedExpiredEvents).toBe(0);

    const remainingChats = await db.query<any>('SELECT * FROM chat_messages;');
    expect(remainingChats.length).toBe(1);
  });
});
