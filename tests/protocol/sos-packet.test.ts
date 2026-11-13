import { describe, it, expect } from 'vitest';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { SOSPayload } from '../../src/mesh/protocol/contracts';

describe('SOS Packet Protocol', () => {
  it('creates an SOS envelope with priority 10 and handles location unavailable', () => {
    const payload: SOSPayload = {
      sosId: 'sos-1',
      latitude: null,
      longitude: null,
      accuracyM: null,
      locationStatus: 'UNAVAILABLE',
      batteryLevel: 42,
      headcount: 3,
      message: 'Trapped on roof',
      createdAt: 1000,
      expiresAt: 2000
    };
    const identity = {
      publicKey: 'pub_user',
      keyAlgorithm: 'ECDSA_P256' as const,
      keyId: 'fp_user'
    };
    const envelope = createEnvelope('SOS', payload, identity);
    expect(envelope.type).toBe('SOS');
    expect(envelope.payload.locationStatus).toBe('UNAVAILABLE');
    expect(envelope.payload.batteryLevel).toBe(42);
  });
});
