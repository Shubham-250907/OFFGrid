import { describe, it, expect } from 'vitest';
import { validateIngressEnvelope } from '../../src/mesh/validation/ingressValidation';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { CryptoProvider, DeviceIdentity } from '../../src/security/identity/DeviceIdentity';

describe('Event Ingestion Integration', () => {
  it('validates canonical hash and mock crypto provider signature', async () => {
    const mockIdentity: DeviceIdentity = {
      publicKey: 'mock_pub_key',
      keyAlgorithm: 'ECDSA_P256',
      keyId: 'mock_fp'
    };
    const mockCrypto: CryptoProvider = {
      createOrLoadIdentity: async () => mockIdentity,
      sign: async () => new Uint8Array([1, 2, 3, 4]),
      verify: async () => true
    };

    const envelope = createEnvelope('INCIDENT', { test: true }, mockIdentity);
    envelope.signature = 'AQIDBA'; // base64url for [1,2,3,4]

    const isValid = await validateIngressEnvelope(envelope, mockCrypto);
    expect(isValid).toBe(true);
  });
});
