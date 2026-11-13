import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { validateIngressEnvelope } from '../../src/mesh/validation/ingressValidation';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { signEnvelope } from '../../src/security/signing/signPayload';
import { EventRepository } from '../../src/data/repositories/EventRepository';
import {
  ValidationError,
  SignatureVerificationError,
  IntegrityConflictError
} from '../../src/shared/errors/AppError';

describe('Phase 6 Hardening: Security, Packet Tampering, Replay & Integrity Conflict', () => {
  let db: NodeSqliteDriver;
  let crypto: Ed25519CryptoProvider;
  let eventRepo: EventRepository;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
    crypto = new Ed25519CryptoProvider();
    eventRepo = new EventRepository(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('rejects malformed packet envelopes with missing protocol or invalid version', async () => {
    const identity = await crypto.createOrLoadIdentity();
    const payload = { incidentId: 'inc-malformed-1', severity: 3, category: 'FLOOD' };

    const envelope = createEnvelope('INCIDENT', payload, identity);
    envelope.signature = await signEnvelope(envelope, crypto);

    // Tamper protocol tag
    const badProto = { ...envelope, protocol: 'UNKNOWN_RADIO' as any };
    await expect(validateIngressEnvelope(badProto, crypto)).rejects.toThrow(ValidationError);

    // Tamper protocol version
    const badVersion = { ...envelope, protocolVersion: 99 as any };
    await expect(validateIngressEnvelope(badVersion, crypto)).rejects.toThrow(ValidationError);
  });

  it('detects payload tampering when payload bytes are altered without updating hash', async () => {
    const identity = await crypto.createOrLoadIdentity();
    const payload = { incidentId: 'inc-tamper-1', severity: 4, category: 'FLOOD' };

    const envelope = createEnvelope('INCIDENT', payload, identity);
    envelope.signature = await signEnvelope(envelope, crypto);

    // Attacker modifies severity from 4 to 1 without updating payloadHash
    envelope.payload = { incidentId: 'inc-tamper-1', severity: 1, category: 'FLOOD' };

    await expect(validateIngressEnvelope(envelope, crypto)).rejects.toThrow(ValidationError);
  });

  it('detects signature tampering and rejects corrupted signatures', async () => {
    const identity = await crypto.createOrLoadIdentity();
    const payload = { incidentId: 'inc-tamper-2', severity: 5, category: 'EARTHQUAKE_DAMAGE' };

    const envelope = createEnvelope('INCIDENT', payload, identity);
    envelope.signature = await signEnvelope(envelope, crypto);

    // Corrupt one character in the base64url signature
    envelope.signature = envelope.signature.slice(0, -4) + 'XXXX';

    await expect(validateIngressEnvelope(envelope, crypto)).rejects.toThrow(
      SignatureVerificationError
    );
  });

  it('detects identity impersonation when senderPublicKey does not match the signing key', async () => {
    const attackerCrypto = new Ed25519CryptoProvider();
    const victimCrypto = new Ed25519CryptoProvider();

    const victimIdentity = await victimCrypto.createOrLoadIdentity();

    const payload = { incidentId: 'inc-impersonate', severity: 5 };
    // Envelope claims sender is victim
    const envelope = createEnvelope('INCIDENT', payload, victimIdentity);
    // But signed by attacker's private key
    envelope.signature = await signEnvelope(envelope, attackerCrypto);

    await expect(validateIngressEnvelope(envelope, crypto)).rejects.toThrow(
      SignatureVerificationError
    );
  });

  it('handles identical replayed packets idempotently without duplicating events', async () => {
    const identity = await crypto.createOrLoadIdentity();
    const payload = { incidentId: 'inc-replay-1', severity: 3, category: 'FLOOD' };

    const envelope = createEnvelope('INCIDENT', payload, identity);
    envelope.signature = await signEnvelope(envelope, crypto);

    const record = {
      event_id: envelope.packetId,
      event_type: envelope.type,
      entity_id: 'inc-replay-1',
      author_public_key: identity.publicKey,
      author_timestamp: envelope.createdAt,
      received_at: Date.now(),
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify(payload),
      payload_hash: envelope.payloadHash,
      signature: envelope.signature,
      validation_status: 'VALID' as const
    };

    // 1st insertion succeeds
    const res1 = await eventRepo.saveEvent(record);
    expect(res1.inserted).toBe(true);

    // 2nd identical replay: ignored idempotently
    const res2 = await eventRepo.saveEvent(record);
    expect(res2.inserted).toBe(false);

    const all = await eventRepo.getEventsByType('INCIDENT');
    expect(all).toHaveLength(1);
  });

  it('quarantines duplicate UUID with divergent payload hash as an integrity conflict', async () => {
    const identity = await crypto.createOrLoadIdentity();
    const payload1 = { incidentId: 'inc-conflict-1', severity: 4, category: 'FLOOD' };
    const envelope1 = createEnvelope('INCIDENT', payload1, identity);
    envelope1.signature = await signEnvelope(envelope1, crypto);

    const record1 = {
      event_id: envelope1.packetId,
      event_type: envelope1.type,
      entity_id: 'inc-conflict-1',
      author_public_key: identity.publicKey,
      author_timestamp: envelope1.createdAt,
      received_at: Date.now(),
      protocol_version: 1,
      schema_version: 1,
      payload_json: JSON.stringify(payload1),
      payload_hash: envelope1.payloadHash,
      signature: envelope1.signature,
      validation_status: 'VALID' as const
    };

    await eventRepo.saveEvent(record1);

    // Attacker crafts record with SAME event_id but DIFFERENT payload_hash
    const record2 = {
      ...record1,
      payload_hash: 'divergent_corrupted_hash_0000000000000000000000000000000000000000',
      payload_json: JSON.stringify({ ...payload1, severity: 1 })
    };

    // PRD Section 5.3 & 8.4: must throw IntegrityConflictError and must NOT overwrite
    await expect(eventRepo.saveEvent(record2)).rejects.toThrow(IntegrityConflictError);

    // Verify original event is preserved intact
    const original = await eventRepo.getEventById(envelope1.packetId);
    expect(original?.payload_hash).toBe(envelope1.payloadHash);
  });
});
