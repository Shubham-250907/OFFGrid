import { describe, it, expect } from 'vitest';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { IncidentPayload } from '../../src/mesh/protocol/contracts';

describe('Incident Packet Protocol', () => {
  it('creates an incident envelope with SHA-256 payload hash', () => {
    const payload: IncidentPayload = {
      incidentId: 'inc-1',
      category: 'FLOOD',
      description: 'Severe road flooding',
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 10,
      severity: 4,
      createdAt: 1000,
      expiresAt: 2000
    };
    const identity = {
      publicKey: 'pub_test_key',
      keyAlgorithm: 'ECDSA_P256' as const,
      keyId: 'fingerprint_123'
    };
    const envelope = createEnvelope('INCIDENT', payload, identity);
    expect(envelope.type).toBe('INCIDENT');
    expect(envelope.payloadHash).toHaveLength(64);
    expect(envelope.ttl).toBe(10);
    expect(envelope.hopCount).toBe(0);
  });
});
