import { describe, it, expect } from 'vitest';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { ShelterPayload } from '../../src/mesh/protocol/contracts';

describe('Shelter Packet Protocol', () => {
  it('creates shelter registration envelope', () => {
    const payload: ShelterPayload = {
      shelterId: 'sh-1',
      name: 'Central High Gym',
      description: 'Emergency warming center',
      latitude: 12.97,
      longitude: 77.59,
      accuracyM: 5,
      capacity: 150,
      status: 'OPEN',
      createdAt: 1000
    };
    const identity = {
      publicKey: 'pub_admin',
      keyAlgorithm: 'ECDSA_P256' as const,
      keyId: 'fp_admin'
    };
    const envelope = createEnvelope('SHELTER', payload, identity);
    expect(envelope.type).toBe('SHELTER');
    expect(envelope.payload.name).toBe('Central High Gym');
  });
});
