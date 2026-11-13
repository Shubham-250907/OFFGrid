import { describe, it, expect } from 'vitest';
import { validateIngressEnvelope } from '../../src/mesh/validation/ingressValidation';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { signEnvelope } from '../../src/security/signing/signPayload';
import { ValidationError, SignatureVerificationError } from '../../src/shared/errors/AppError';

describe('Ingress Envelope Validation', () => {
  it('passes completely for valid signed envelope with matching canonical hash', async () => {
    const crypto = new Ed25519CryptoProvider();
    const identity = await crypto.createOrLoadIdentity();

    const payload = { incidentId: 'inc-99', severity: 4, category: 'FLOOD' };
    const envelope = createEnvelope('INCIDENT', payload, identity);
    envelope.signature = await signEnvelope(envelope, crypto);

    const isValid = await validateIngressEnvelope(envelope, crypto);
    expect(isValid).toBe(true);
  });

  it('rejects envelope with payload hash mismatch (tampered payload)', async () => {
    const crypto = new Ed25519CryptoProvider();
    const identity = await crypto.createOrLoadIdentity();

    const payload = { incidentId: 'inc-99', severity: 4 };
    const envelope = createEnvelope('INCIDENT', payload, identity);
    envelope.signature = await signEnvelope(envelope, crypto);

    // Tamper with payload without updating payloadHash
    envelope.payload = { incidentId: 'inc-99', severity: 1 };

    await expect(validateIngressEnvelope(envelope, crypto)).rejects.toThrow(
      ValidationError
    );
  });

  it('rejects envelope with invalid cryptographic signature', async () => {
    const crypto = new Ed25519CryptoProvider();
    const identity = await crypto.createOrLoadIdentity();

    const payload = { incidentId: 'inc-99' };
    const envelope = createEnvelope('INCIDENT', payload, identity);
    envelope.signature = 'AQIDBA_corrupted_signature';

    await expect(validateIngressEnvelope(envelope, crypto)).rejects.toThrow(
      SignatureVerificationError
    );
  });

  it('rejects envelope with expired TTL', async () => {
    const crypto = new Ed25519CryptoProvider();
    const identity = await crypto.createOrLoadIdentity();

    const payload = { note: 'test' };
    const envelope = createEnvelope('CHAT', payload, identity, 0); // TTL = 0
    envelope.signature = await signEnvelope(envelope, crypto);

    await expect(validateIngressEnvelope(envelope, crypto)).rejects.toThrow(
      ValidationError
    );
  });
});
